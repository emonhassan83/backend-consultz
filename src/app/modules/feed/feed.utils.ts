import { Types } from 'mongoose';
import { TUser } from '../user/user.interface';
import { messages } from '../notification/notification.constant';
import { modeType } from '../notification/notification.interface';
import { sendNotification } from '../../utils/sentNotification';
import { TFeed } from './feed.interface';
import { canSendPushNotification } from '../notification/notification.utils';
import { User } from '../user/user.model';
import { Follow } from '../connection/connection.models';
import { Feed } from './feed.model';
import { getMessaging } from 'firebase-admin/messaging'
import { Notification } from '../notification/notification.model';
import { Report } from '../report/report.models';
import emailSender from '../../utils/emailSender';

/**
 * Batch check if any report exists for multiple feeds
 * Returns Map<feedId, isReported: boolean>
 */
export const getReportedStatusBatch = async (
  feedIds: string[] | Types.ObjectId[],
  currentUserId?: string // optional: যদি শুধু current user এর report চাও
): Promise<Map<string, boolean>> => {
  if (feedIds.length === 0) return new Map();

  const normalizedIds = feedIds.map(id => new Types.ObjectId(id.toString()));

  const query: any = {
    feed: { $in: normalizedIds },
  };

  // যদি শুধু current user এর report চাও (optional)
  if (currentUserId) {
    query.author = new Types.ObjectId(currentUserId);
  }

  const reports = await Report.find(query)
    .select('_id feed')
    .lean();

  const reportedSet = new Set(
    reports.map((report) => report.feed.toString()),
  );

  const result = new Map<string, boolean>();
  normalizedIds.forEach(id => {
    result.set(id.toString(), reportedSet.has(id.toString()));
  });

  return result;
};

/**
 * Get all reports for a single feed
 */
export const getReportsForFeed = async (feedId: string) => {
  return await Report.find({ feed: feedId })
    .populate('author', 'firstName lastName photoUrl')
    .select('author reason createdAt')
    .sort({ createdAt: -1 })
    .lean();
};

// Utility to check isLiked
export const enrichFeedWithUserInfo = async (feed: any, userId: string) => {
  const authorId = feed.author?._id?.toString();

  const contentMeta = feed.contentMeta as {
    likeBy?: (string | Types.ObjectId)[];
  };
  const likeBy = contentMeta?.likeBy || [];

  const isLiked = likeBy.some((id) =>
    new Types.ObjectId(id).equals(userId),
  );

  if (!authorId) {
    return {
      ...feed.toObject(),
      isLiked
    };
  }
  return {
    ...feed.toObject(),
    isLiked
  };
};

export const notifyFollowersOnNewPost = async (feedId: string) => {
  try {
    // 1. Feed + author find out
    const feed = await Feed.findById(feedId)
      .populate('author', 'firstName')
      .lean() as any;

    if (!feed || feed?.isDeleted) return;

    const authorId = feed.author?._id?.toString() || feed.author?.toString();
    const authorName = feed.author?.firstName || 'An expert';

    // Find feed caption
    const firstLine = feed.description?.split('\n')[0]?.trim() || feed.description || 'Check out my new post!';

    // 2. find out followers
    const followers = await Follow.find({ following: authorId })
      .select('follower')
      .lean();

    if (followers.length === 0) return;

    const followerIds = followers.map(f => f.follower.toString());

    // 3. Followers fcmToken + pushNotify
    const followerUsers = await User.find({
      _id: { $in: followerIds },
      isDeleted: false,
    })
      .select('fcmToken pushNotify _id')
      .lean();

    // 4. Valid token + receiver ID collect
    const notificationsToSend = followerUsers
      .filter(user => user.fcmToken && canSendPushNotification(user, 'post'))
      .map(user => ({
        receiver: user._id,
        fcmToken: user.fcmToken,
        message: `${authorName} has posted a new update!`,
        description: firstLine,
        reference: feed._id.toString(),
        model_type: modeType.Feed,
      }));

    if (notificationsToSend.length === 0) return;

    // 5. Database-এ bulk insert 
    const notificationDocs = notificationsToSend.map(n => ({
      receiver: n.receiver,
      message: n.message,
      description: n.description,
      reference: n.reference,
      model_type: n.model_type,
      read: false,
      isDeleted: false,
    }));

    await Notification.insertMany(notificationDocs);

    // 6. FCM batch sent in chunk
    const chunkSize = 500;
    const tokensWithPayload = notificationsToSend.map(n => ({
      token: n.fcmToken,
      payload: {
        message: n.message,
        description: n.description,
      },
    }));

    for (let i = 0; i < tokensWithPayload.length; i += chunkSize) {
      const chunk = tokensWithPayload.slice(i, i + chunkSize);

      const multicastPayload = {
        tokens: chunk.map(c => c.token),
        notification: {
          title: chunk[0].payload.message,
          body: chunk[0].payload.description,
        },
        apns: {
          headers: { 'apns-push-type': 'alert' },
          payload: { aps: { badge: 1, sound: 'default' } },
        },
      };

      try {
        const response = await getMessaging().sendEachForMulticast(multicastPayload);
        console.log(`Batch sent to ${response.successCount} devices, failed: ${response.failureCount}`);
      } catch (err) {
        console.error('FCM batch failed:', err);
      }
    }

    console.log(`New post notification queued for ${notificationsToSend.length} followers`);
  } catch (error) {
    console.error('Failed to notify followers on new post:', error);
  }
};

export const sendFeedNotificationToUser = async (
  status: 'active' | 'restricted',
  user: TUser,
  feed: TFeed,
) => {
  if (!user?.fcmToken || !canSendPushNotification(user, 'post')) return;

  let message = '';
  let description = '';

  if (status === 'active') {
    message = messages.feed.active || 'Your post is now live';
    description = 'Your post is now visible to your followers. Share it!';
  } else {
    message = messages.feed.restricted || 'Your post has been restricted';
    description = 'Your post has been restricted by admin. Contact support if needed.';
  }

  const notifyPayload = {
    receiver: user._id,
    message,
    description,
    reference: feed._id,
    modelType: modeType.Feed,
  };

  await sendNotification([user.fcmToken], notifyPayload);
};

export type TModerationEvent =
  | 'reported'
  | 'reportWithdrawn'
  | 'restricted'
  | 'reinstated'
  | 'removed'
  | 'warning'
  | 'suspended'
  | 'appealApproved'
  | 'appealRejected'

const moderationCopy: Record<
  TModerationEvent,
  { subject: string; message: string; description: (reason?: string) => string }
> = {
  reported: {
    subject: 'Your post has been reported',
    message: messages.feed.reported,
    description: (reason) =>
      `Your post has been reported and is now waiting for admin review. Reason: ${reason || 'Not provided'}. Your post remains live unless an admin restricts it.`,
  },
  reportWithdrawn: {
    subject: 'A report on your post has been removed',
    message: messages.feed.reportWithdrawn,
    description: (reason) =>
      `A report on your post has been removed. ${reason || 'The reporter deleted their report.'}`,
  },
  restricted: {
    subject: 'Your post has been restricted',
    message: messages.feed.restricted,
    description: (reason) =>
      `Your post has been restricted after review. Reason: ${reason || 'Not provided'}. You can submit an appeal from your restricted post.`,
  },
  reinstated: {
    subject: 'Your post has been activated',
    message: messages.feed.reinstated,
    description: (reason) =>
      `Your post has been activated and is visible again. Reason: ${reason || 'Admin review completed'}.`,
  },
  removed: {
    subject: 'Your post has been removed',
    message: messages.feed.removed,
    description: (reason) =>
      `Your post has been removed. Reason: ${reason || 'Not provided'}.`,
  },
  warning: {
    subject: 'Content warning issued',
    message: messages.feed.warning,
    description: (reason) =>
      `A warning has been issued for your post. Reason: ${reason || 'Not provided'}.`,
  },
  suspended: {
    subject: 'Your account has been suspended',
    message: messages.feed.suspended,
    description: (reason) =>
      `Your account has been suspended following content moderation review. Reason: ${reason || 'Not provided'}.`,
  },
  appealApproved: {
    subject: 'Your appeal has been approved',
    message: messages.feed.appealApproved,
    description: (reason) =>
      `Your appeal has been approved. Your post has been activated. Reason: ${reason || 'Admin review completed'}.`,
  },
  appealRejected: {
    subject: 'Your appeal has been rejected',
    message: messages.feed.appealRejected,
    description: (reason) =>
      `Your appeal has been rejected. Your post remains restricted. Reason: ${reason || 'Admin review completed'}.`,
  },
}

export const sendContentModerationNotification = async (
  event: TModerationEvent,
  user: TUser,
  feed: TFeed,
  reason?: string,
) => {
  const copy = moderationCopy[event]
  const description = copy.description(reason)

  if (user?.fcmToken && canSendPushNotification(user, 'post')) {
    await sendNotification([user.fcmToken], {
      receiver: user._id,
      message: copy.message,
      description,
      reference: feed._id,
      modelType: modeType.Feed,
    })
  }

  if (user?.email) {
    await emailSender(
      user.email,
      copy.subject,
      `
        <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.6;">
          <h2>${copy.subject}</h2>
          <p>${description}</p>
          <p><strong>Appeal route:</strong> If your post is restricted, open the restricted post in the app and submit an appeal with your reason and optional evidence file URL.</p>
          <p>Best regards,<br/>Consultz Team</p>
        </div>
      `,
    ).catch((err) =>
      console.error(`Moderation email failed (user ${user._id}):`, err),
    )
  }
}

// file upload utils
export const getFileExtension = (file: Express.Multer.File) => {
  const extensionFromName = file.originalname?.split('.').pop()?.toLowerCase()
  if (extensionFromName && extensionFromName !== file.originalname) {
    return extensionFromName
  }

  const extensionByMimeType: Record<string, string> = {
    'image/avif': 'avif',
    'image/bmp': 'bmp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/gif': 'gif',
    'image/jp2': 'jp2',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/pjpeg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
    'image/tiff': 'tiff',
    'image/vnd.microsoft.icon': 'ico',
    'image/webp': 'webp',
    'video/3gpp': '3gp',
    'video/3gpp2': '3g2',
    'video/avi': 'avi',
    'video/divx': 'divx',
    'video/h261': 'h261',
    'video/h263': 'h263',
    'video/h264': 'h264',
    'video/h265': 'h265',
    'video/iso.segment': 'm4s',
    'video/jpeg': 'jpgv',
    'video/mj2': 'mj2',
    'video/mp4': 'mp4',
    'video/mpeg': 'mpeg',
    'video/ogg': 'ogv',
    'video/quicktime': 'mov',
    'video/vnd.avi': 'avi',
    'video/vnd.dlna.mpeg-tts': 'ts',
    'video/vnd.mpegurl': 'mxu',
    'video/vnd.ms-playready.media.pyv': 'pyv',
    'video/vnd.uvvu.mp4': 'uvu',
    'video/vnd.vivo': 'viv',
    'video/webm': 'webm',
    'video/x-f4v': 'f4v',
    'video/x-flv': 'flv',
    'video/x-m4v': 'm4v',
    'video/x-matroska': 'mkv',
    'video/x-ms-asf': 'asf',
    'video/x-ms-vob': 'vob',
    'video/x-ms-wm': 'wm',
    'video/x-ms-wmv': 'wmv',
    'video/x-msvideo': 'avi',
    'video/x-sgi-movie': 'movie',
  }

  return extensionByMimeType[file.mimetype.toLowerCase()]
}

export const generateFeedFilePath = (file: Express.Multer.File) => {
  const contentType = file.mimetype.split('/')[0]
  const randomId = Math.floor(100000 + Math.random() * 900000)
  const extension = getFileExtension(file)

  return `${contentType}s/${randomId}${extension ? `.${extension}` : ''}`
}

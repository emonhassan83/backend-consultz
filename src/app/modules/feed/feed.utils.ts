import { Types } from 'mongoose';
import { TUser } from '../user/user.interface';
import { messages } from '../notification/notification.constant';
import { modeType } from '../notification/notification.interface';
import { sendNotification } from '../../utils/sentNotification';
import { TFeed } from './feed.interface';

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

export const sendFeedNotificationToUser = async (
  status: 'active' | 'restricted',
  user: TUser,
  feed: TFeed,
) => {
  // Respect user notification settings
  if (!user?.fcmToken || user?.pushNotify?.post === false) return

  let message = ''
  let description = ''

  if (status === 'active') {
    message = messages.feed.active
    description = 'Your post is now live. You can share it with your followers.'
  } else {
    message = messages.feed.restricted
    description =
      'Your post has been restricted by admin. Please contact support if you have questions.'
  }

  const notifyPayload = {
    receiver: user._id,
    message,
    description,
    reference: feed._id,
    model_type: modeType.Feed,
  }

  await sendNotification([user.fcmToken], notifyPayload)
}

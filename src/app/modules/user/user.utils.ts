import httpStatus from 'http-status'
import { ClientSession, Types } from 'mongoose'
import { Follow } from '../connection/connection.models'
import { modeType } from '../notification/notification.interface'
import { messages } from '../notification/notification.constant'
import { TUser } from './user.interface'
import { findAdmin } from '../../utils/findAdmin'
import { sendNotification } from '../../utils/sentNotification'
import { TUserStatus, USER_ROLE, USER_STATUS } from './user.constant'
import emailSender from '../../utils/emailSender'
import config from '../../config'
import { BOOKING_STATUS } from '../booking/booking.constants'
import { Booking } from '../booking/booking.models'
import { User } from './user.model'
import AppError from '../../errors/AppError'
import { Feed } from '../feed/feed.model'
import { ContentMeta } from '../contentMeta/contentMeta.model'
import { Comments } from '../comments/comments.models'
import { Reply } from '../reply/reply.models'
import { Report } from '../report/report.models'
import { Appeal } from '../appeal/appeal.model'
import { Withdraw } from '../withdraw/withdraw.model'
import { WITHDRAW_STATUS } from '../withdraw/withdraw.constant'
import { BlockProfile } from '../blockProfile/blockProfile.models'
import { Reviews } from '../review/review.models'
import { Notification } from '../notification/notification.model'
import { PointsLog } from '../pointsLogs/pointsLogs.model'

const ACTIVE_BOOKING_STATUSES_FOR_PROFILE_DELETE = [
  BOOKING_STATUS.pending,
  BOOKING_STATUS.confirmed,
  BOOKING_STATUS.running,
]

const PENDING_WITHDRAW_STATUSES = [
  WITHDRAW_STATUS.proceed,
  WITHDRAW_STATUS.hold,
]

export const getCancellationRates = (
  lifetimeTotal: number,
  lifetimeCancelled: number,
  last90DaysTotal: number,
  last90DaysCancelled: number,
) => {
  const toRate = (total: number, cancelled: number) =>
    total > 0 ? Math.min(Math.round((cancelled / total) * 100), 100) : 0

  return {
    cancellationRate: toRate(lifetimeTotal, lifetimeCancelled),
    cancellationRateLast90Days: toRate(last90DaysTotal, last90DaysCancelled),
  }
}

export const calculateProfileSetupProgress = (user: any): number => {
  if (!user || !user.role) {
    return 0
  }

  let requiredFields: string[] = []

  // Required fields for 'consult' role
  if (user.role === USER_ROLE.consult) {
    requiredFields = [
      'firstName',
      'lastName',
      'email',
      'password',
      'dob',
      'photoUrl',
      'coverPhoto',
      'phoneNumber',
      'timeZone',
      'priceRange',
      'interests',
      'learningStyles',
      'availability',
    ]
  } else {
    // Required fields for 'tutor' or other roles
    requiredFields = [
      'firstName',
      'lastName',
      'email',
      'password',
      'dob',
      'photoUrl',
      'coverPhoto',
      'phoneNumber',
      'socialProfiles',
      'hourlyRate',
      'expertise',
      'skills',
      'advisingStyles',
      'bio',
      'timeZone',
      'sessionDurations',
      'availability',
    ]
  }

  if (requiredFields.length === 0) {
    return 0
  }

  // Count how many fields are "filled"
  const filledCount = requiredFields.filter((field) => {
    const value = user[field]

    if (value === null || value === undefined) return false

    if (typeof value === 'string') {
      return value.trim().length > 0
    }

    if (Array.isArray(value)) {
      return value.length > 0
    }

    if (typeof value === 'number') {
      return value > 0
    }

    // Any other truthy value
    return !!value
  }).length

  // Calculate percentage and cap at 100
  const progress = Math.round((filledCount / requiredFields.length) * 100)
  return Math.min(progress, 100)
}

/**
 * Batch checks if current user follows multiple target users
 * @returns Map<targetUserId: string, isFollowing: boolean>
 */
export const getFollowingStatusBatch = async (
  currentUserId: string,
  targetUserIds: string[] | Types.ObjectId[]
): Promise<Map<string, boolean>> => {
  if (!currentUserId || targetUserIds.length === 0) return new Map();

  const normalizedIds = targetUserIds.map(id => new Types.ObjectId(id.toString()));

  const follows = await Follow.find({
    follower: new Types.ObjectId(currentUserId),
    following: { $in: normalizedIds },
  })
    .select('following')
    .lean();

  const followingSet = new Set(follows.map(f => f.following.toString()));

  const result = new Map<string, boolean>();
  normalizedIds.forEach(id => {
    result.set(id.toString(), followingSet.has(id.toString()));
  });

  return result;
};

/**
 * Batch calculates total completed bookings for multiple experts
 * @returns Map<expertId: string, totalBookings: number>
 */
export const getTotalBookingsBatch = async (
  expertIds: string[] | Types.ObjectId[]
): Promise<Map<string, number>> => {
  if (expertIds.length === 0) return new Map();

  const normalizedIds = expertIds.map(id => new Types.ObjectId(id.toString()));

  const completedCounts = await Booking.aggregate([
    {
      $match: {
        consult: { $in: normalizedIds },
        status: BOOKING_STATUS.completed,
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: '$consult',
        totalBookings: { $sum: 1 },
      },
    },
  ]);

  const countMap = new Map(completedCounts.map(c => [c._id.toString(), c.totalBookings]));
  return countMap;
};

export const sendUserStatusNotifYToAdmin = async (
  status: 'active' | 'blocked' | 'pending' | 'warning',
  user: TUser,
) => {
  const admin = await findAdmin()
  if (!admin || !admin?.fcmToken) return

  let message = ''
  let description = ''

  if (status === 'active') {
    message = messages.userManagement.accountActivated
    description = `User ${user?.firstName} (ID: ${user?.id}) has been successfully activated.`
  } else {
    message = messages.userManagement.accountDeactivated
    description = `User ${user?.firstName} (ID: ${user?.id}) has been blocked from accessing the system.`
  }

  const notifyPayload = {
    receiver: admin._id,
    message,
    description,
    reference: user._id,
    modelType: modeType.User,
  }

  await sendNotification([admin.fcmToken], notifyPayload)
}

export const sendUserStatusNotifYToUser = async (
  status: 'active' | 'blocked' | 'pending' | 'warning',
  user: TUser,
) => {
  if (!user || !user?.fcmToken) return

  let message
  let description

  if (status === 'active') {
    message = messages.userManagement.accountActivated
    description = `Your account has been successfully activated. You can now access all available features.`
  } else {
    message = messages.userManagement.accountDeactivated
    description = `Your account has been blocked. Please contact support for further assistance.`
  }

  const notifyPayload = {
    receiver: user._id,
    message,
    description,
    reference: user._id,
    modelType: modeType.User,
  }

  await sendNotification([user.fcmToken], notifyPayload)
}

export const generateUserStatusEmail = async (
  user: TUser,
  status: TUserStatus,
) => {
  const supportEmail = config.emailSender.email

  if (status === USER_STATUS.blocked) {
    await emailSender(
      user?.email,
      'Your Consultz Account Has Been Blocked',
      `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
        <h2 style="color: #333;">Account Blocked Notification</h2>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          Dear <strong>${user.firstName}</strong>,
        </p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          We regret to inform you that your Consultz account has been <strong>temporarily blocked</strong> by our admin team.
        </p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          If you believe this action was taken in error or would like to appeal, please contact our support team immediately at 
          <a href="mailto:${supportEmail}" style="color: #D83578; text-decoration: none;">${supportEmail}</a>.
        </p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          Thank you for your understanding.<br>
          Consultz Support Team
        </p>
        <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #777;">
          © ${new Date().getFullYear()} Consultz. All rights reserved.<br>
        </div>
      </div>
    `,
    )
  }
  if (status === USER_STATUS.active) {
    await emailSender(
      user?.email,
      'Your Consultz Account Has Been Reactivated',
      `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
        <h2 style="color: #333; text-align: center;">Account Reactivated</h2>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          Dear <strong>${user.firstName}</strong>,
        </p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          Great news! Your Consultz account has been successfully <strong>reactivated</strong> by our team.
        </p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          You can now log in and continue using all features of the platform.
        </p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          If you have any questions or need assistance, feel free to contact us at 
          <a href="mailto:${supportEmail}" style="color: #D83578; text-decoration: none;">${supportEmail}</a>.
        </p>
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          Thank you for being part of Consultz.<br>
          Consultz Support Team
        </p>
        <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #777;">
          © ${new Date().getFullYear()} Consultz. All rights reserved.<br>
        </div>
      </div>
        `,
    )
  }
}

export const sendExpertPendingEmail = async (user: TUser) => {
  const supportEmail = config.emailSender.email

  await emailSender(
    user?.email,
    'Your Consultz Account Has Been Pending Approval',
    `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
      <h2 style="color: #555;">Your Profile is Under Review</h2>
      <p style="color: #555; margin-top: 10px;">Dear ${user.firstName},</p>
      <p style="color: #555;">Thank you for completing your registration as an Expert on Consultz.</p>
      <p style="color: #555;">Your profile is now in <strong>pending</strong> status. Our admin team is reviewing your details and will approve it shortly.</p>
      <p style="color: #555;">Once approved, you will be able to start accepting bookings and providing consultations.</p>
      <p style="color: #555;">You will receive another email notification when your account is activated.</p>
      <p style="color: #555;">If you have any questions in the meantime, feel free to contact us at 
         <a href="mailto:${supportEmail}" style="color: #D83578; text-decoration: none;">${supportEmail}</a>.
      </p>
      <p style="color: #555;">Thank you for joining Consultz,<br/>Consultz Team</p>
      <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #999;">
        © ${new Date().getFullYear()} Consultz. All rights reserved.
      </div>
    </div>
  `,
  )
}


export const assertUserCanDeleteProfile = async (userId: string) => {
  const userObjectId = new Types.ObjectId(userId)

  const [activeBooking, pendingWithdraw] = await Promise.all([
    Booking.exists({
      isDeleted: false,
      status: { $in: ACTIVE_BOOKING_STATUSES_FOR_PROFILE_DELETE },
      $or: [{ user: userObjectId }, { consult: userObjectId }],
    }),
    Withdraw.exists({
      user: userObjectId,
      isDeleted: false,
      status: { $in: PENDING_WITHDRAW_STATUSES },
    }),
  ])

  if (activeBooking) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Cannot delete profile while active bookings exist',
    )
  }

  if (pendingWithdraw) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Cannot delete profile while pending withdrawals exist',
    )
  }
}

export const removeUserContentData = async (
  userId: string,
  session: ClientSession,
) => {
  const userObjectId = new Types.ObjectId(userId)

  const feeds = await Feed.find({ author: userObjectId })
    .select('_id contentMeta')
    .session(session)
  const feedIds = feeds.map((feed) => feed._id)
  const contentMetaIds = feeds
    .map((feed) => feed.contentMeta?.toString())
    .filter((contentMetaId): contentMetaId is string => Boolean(contentMetaId))

  if (feedIds.length > 0) {
    const feedComments = await Comments.find({ content: { $in: feedIds } })
      .select('_id')
      .session(session)
    const feedCommentIds = feedComments.map((comment) => comment._id)

    await Promise.all([
      feedCommentIds.length > 0
        ? Reply.deleteMany({ replyRef: { $in: feedCommentIds } }).session(
            session,
          )
        : Promise.resolve(),
      Comments.deleteMany({ content: { $in: feedIds } }).session(session),
      Report.deleteMany({ feed: { $in: feedIds } }).session(session),
      Appeal.deleteMany({ feed: { $in: feedIds } }).session(session),
      Feed.deleteMany({ _id: { $in: feedIds } }).session(session),
    ])
  }

  if (contentMetaIds.length > 0) {
    await ContentMeta.deleteMany({ _id: { $in: contentMetaIds } }).session(
      session,
    )
  }

  const userCommentsFilter: Record<string, unknown> = { user: userObjectId }
  if (feedIds.length > 0) {
    userCommentsFilter.content = { $nin: feedIds }
  }

  const userCommentsOnOthers = await Comments.find(userCommentsFilter).session(
    session,
  )

  for (const comment of userCommentsOnOthers) {
    const replyCount = await Reply.countDocuments({
      replyRef: comment._id,
    }).session(session)

    await Reply.deleteMany({ replyRef: comment._id }).session(session)
    await ContentMeta.updateOne(
      { content: comment.content },
      { $inc: { comment: -(1 + replyCount) } },
      { session },
    )
  }

  if (userCommentsOnOthers.length > 0) {
    await Comments.deleteMany({
      _id: { $in: userCommentsOnOthers.map((comment) => comment._id) },
    }).session(session)
  }

  const userReplies = await Reply.find({ user: userObjectId }).session(session)

  for (const reply of userReplies) {
    if (!reply.replyRef) {
      continue
    }

    const parentComment = await Comments.findById(reply.replyRef).session(
      session,
    )
    if (!parentComment) {
      continue
    }

    await Comments.updateOne(
      { _id: parentComment._id },
      { $pull: { reply: reply._id } },
      { session },
    )
    await ContentMeta.updateOne(
      { content: parentComment.content },
      { $inc: { comment: -1 } },
      { session },
    )
  }

  if (userReplies.length > 0) {
    await Reply.deleteMany({ user: userObjectId }).session(session)
  }

  await Promise.all([
    Report.deleteMany({
      $or: [{ author: userObjectId }, { feedAuthor: userObjectId }],
    }).session(session),
    Appeal.deleteMany({ user: userObjectId }).session(session),
  ])

  const likedContentMetas = await ContentMeta.find({
    likeBy: userId,
  }).session(session)

  for (const contentMeta of likedContentMetas) {
    const hasLiked = contentMeta.likeBy?.some(
      (likedById) => likedById.toString() === userId,
    )

    if (!hasLiked) {
      continue
    }

    await ContentMeta.updateOne(
      { _id: contentMeta._id },
      {
        $pull: { likeBy: userId },
        $inc: { like: -1 },
      },
      { session },
    )
  }

  await Promise.all([
    Follow.deleteMany({
      $or: [{ follower: userObjectId }, { following: userObjectId }],
    }).session(session),
    BlockProfile.deleteMany({
      $or: [{ blocker: userObjectId }, { blocked: userObjectId }],
    }).session(session),
    Reviews.deleteMany({
      $or: [{ user: userObjectId }, { expert: userObjectId }],
    }).session(session),
    Notification.deleteMany({ receiver: userObjectId }).session(session),
    PointsLog.deleteMany({ user: userObjectId }).session(session),
  ])
}

export const sendSlotRegenerationNotification = async (expertId: string) => {
  const expert = await User.findById(expertId);
  if (!expert?.fcmToken) return;

  await sendNotification([expert.fcmToken], {
    receiver: expert._id,
    message: 'Availability Updated',
    description: 'Your availability has been updated. New booking times will be generated dynamically.',
    modelType: modeType.User,
  });
};

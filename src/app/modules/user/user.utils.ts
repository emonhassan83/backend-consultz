import { Types } from 'mongoose';
import { Follow } from '../connection/connection.models'
import { modeType } from '../notification/notification.interface'
import { messages } from '../notification/notification.constant'
import { TUser } from './user.interface'
import { findAdmin } from '../../utils/findAdmin'
import { sendNotification } from '../../utils/sentNotification'
import { TUserStatus, USER_ROLE, USER_STATUS } from './user.constant'
import emailSender from '../../utils/emailSender'
import config from '../../config'
import { BOOKING_STATUS } from '../booking/booking.constants';
import { Booking } from '../booking/booking.models';

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
  status: 'active' | 'blocked' | 'pending',
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
  status: 'active' | 'blocked' | 'pending',
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
    'Your Consultz Account Has Been Blocked',
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

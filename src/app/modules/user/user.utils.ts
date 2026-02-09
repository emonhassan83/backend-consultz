import { modeType } from '../notification/notification.interface';
import { messages } from '../notification/notification.constant';
import { TUser } from './user.interface';
import { findAdmin } from '../../utils/findAdmin';
import { sendNotification } from '../../utils/sentNotification';
import { USER_ROLE } from './user.constant';

export const calculateProfileSetupProgress = (user: any): number => {
  if (!user || !user.role) {
    return 0;
  }

  let requiredFields: string[] = [];

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
    ];
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
    ];
  }

  if (requiredFields.length === 0) {
    return 0;
  }

  // Count how many fields are "filled"
  const filledCount = requiredFields.filter((field) => {
    const value = user[field];

    if (value === null || value === undefined) return false;

    if (typeof value === 'string') {
      return value.trim().length > 0;
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    if (typeof value === 'number') {
      return value > 0;
    }

    // Any other truthy value
    return !!value;
  }).length;

  // Calculate percentage and cap at 100
  const progress = Math.round((filledCount / requiredFields.length) * 100);
  return Math.min(progress, 100);
};

export const sendUserStatusNotifYToAdmin = async (
  status: 'active' | 'blocked',
  user: TUser,
) => {
  const admin = await findAdmin();
  if (!admin || !admin?.fcmToken) throw new Error('Admin not found or missing FCM token!');

  let message = '';
  let description = '';

  if (status === 'active') {
    message = messages.userManagement.accountActivated;
    description = `User ${user?.firstName} (ID: ${user?.id}) has been successfully activated.`;
  } else {
    message = messages.userManagement.accountDeactivated;
    description = `User ${user?.firstName} (ID: ${user?.id}) has been blocked from accessing the system.`;
  }

  const notifyPayload = {
    receiver: admin._id,
    message,
    description,
    reference: user._id,
    model_type: modeType.User,
  };

  await sendNotification([admin.fcmToken], notifyPayload);
};


export const sendUserStatusNotifYToUser = async (
  status: 'active' | 'blocked',
  user: TUser,
) => {
  if (!user?.fcmToken) return;

  let message = '';
  let description = '';

  if (status === 'active') {
    message = messages.userManagement.accountActivated;
    description = `Your account has been successfully activated. You can now access all available features.`;
  } else {
    message = messages.userManagement.accountDeactivated;
    description = `Your account has been blocked. Please contact support for further assistance.`;
  }

  const notifyPayload = {
    receiver: user._id,
    message,
    description,
    reference: user._id,
    model_type: modeType.User,
  };

  await sendNotification([user.fcmToken], notifyPayload);
};

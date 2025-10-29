import { modeType } from '../notification/notification.interface';
import { messages } from '../notification/notification.constant';
import { TUser } from './user.interface';
import { findAdmin } from '../../utils/findAdmin';
import { sendNotification } from '../../utils/sentNotification';

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
    description = `User ${user?.name} (ID: ${user?.id}) has been successfully activated.`;
  } else {
    message = messages.userManagement.accountDeactivated;
    description = `User ${user?.name} (ID: ${user?.id}) has been blocked from accessing the system.`;
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
  if (!user?.fcmToken) throw new Error('User FCM token is missing!');

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

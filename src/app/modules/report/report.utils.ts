import { messages } from '../notification/notification.constant';
import { NotificationService } from '../notification/notification.service';
import { IUser } from '../user/user.interface';
import { modeType } from '../notification/notification.interface';
import { IReport } from './report.interface';
import { User } from '../user/user.models';

export const sendUserBlockedNotification = async (user: IUser, report: any) => {
  const message = messages.userManagement.accountDeactivated;
  const description = `Your account has been blocked due to a violation of our policies. Please contact support for clarification.`;

  await NotificationService.createNotificationIntoDB({
    receiver: user._id,
    reference: report?._id,
    message,
    description,
    model_type: modeType.User,
  });
};

export const sendContentBlockedNotification = async (
  authorId: string,
  model: 'Feed' | 'Wishlist' | 'Reels',
) => {
  const user = await User.findById(authorId);
  if (!user) return;

  const message = `Your ${model.toLowerCase()} has been blocked`;
  const description = `Dear ${user.name}, your ${model.toLowerCase()} was reported and has been soft deleted due to policy violation.`;

  await NotificationService.createNotificationIntoDB({
    receiver: user._id,
    message,
    description,
    model_type: modeType[model],
  });
};

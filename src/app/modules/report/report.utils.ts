import { NotificationService } from '../notification/notification.service';
import { modeType } from '../notification/notification.interface';
import { User } from '../user/user.model';

export const sendContentBlockedNotification = async (
  authorId: string
) => {
  const user = await User.findById(authorId);
  if (!user) return;

  const message = `Your feed has been blocked`;
  const description = `Dear ${user.firstName}, your feed was reported and has been soft deleted due to policy violation.`;

  await NotificationService.createNotificationIntoDB({
    receiver: user._id,
    message,
    description,
    modelType: modeType.Feed,
  });
};

import { NotificationService } from '../notification/notification.service';
import { modeType } from '../notification/notification.interface';
import { messages } from '../notification/notification.constant';
import { User } from '../user/user.model';

export const sendUserFollowNotify = async (
  type: 'follow' | 'unfollow',
  followerId: string,
  followingId: string,
) => {
  const [follower, following] = await Promise.all([
    User.findById(followerId),
    User.findById(followingId),
  ]);

  if (!follower || !following) return;

  let message: string;
  let description: string;

  if (type === 'follow') {
    message = messages.userFollow.followed;
    description = `${follower.firstName} started following you.`;
  } else {
    message = messages.userFollow.unfollowed;
    description = `${follower.firstName} unfollowed you.`;
  }

  await NotificationService.createNotificationIntoDB({
    receiver: following._id,
    message,
    description,
    modelType: modeType.User,
  });
};

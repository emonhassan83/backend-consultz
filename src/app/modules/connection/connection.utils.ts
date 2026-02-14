import { modeType } from '../notification/notification.interface'
import { User } from '../user/user.model'
import { IFollow } from './connection.interface'
import { sendNotification } from '../../utils/sentNotification'
import { canSendPushNotification } from '../notification/notification.utils'

// In-memory batch store for follows (key: following user ID)
const followBatchStore: Record<
  string,
  {
    count: number;
    timer: NodeJS.Timeout | null;
    lastFollowerName: string;
  }
> = {};

export const sendUserFollowNotify = async (
  followerId: string,
  followingId: string,
  connection: IFollow,
) => {
  const [follower, following] = await Promise.all([
    User.findById(followerId).select('firstName'),
    User.findById(followingId).select('fcmToken pushNotify'),
  ]);

  if (!following || !follower || !canSendPushNotification(following, 'followers')) {
    return;
  }

  const key = followingId.toString();

  // Initialize batch if not exists
  if (!followBatchStore[key]) {
    followBatchStore[key] = {
      count: 0,
      timer: null,
      lastFollowerName: follower.firstName,
    };
  }

  // Increase count
  followBatchStore[key].count += 1;

  // Update last follower name 
  followBatchStore[key].lastFollowerName = follower.firstName;

  // Clear previous timer if exists
  if (followBatchStore[key].timer) {
    clearTimeout(followBatchStore[key].timer);
  }

  // Set 10-minute timer for batched notification
  followBatchStore[key].timer = setTimeout(async () => {
    const batch = followBatchStore[key];
    if (!batch || batch.count === 0) return;

    let message = '';
    let description = '';

    if (batch.count === 1) {
      message = 'New Follower';
      description = `${batch.lastFollowerName} started following you.`;
    } else {
      message = `You have ${batch.count} new followers!`;
      description = `${batch.lastFollowerName} and others started following you. Tap to see all.`;
    }

    const notifyPayload = {
      receiver: following._id,
      message,
      reference: connection._id,
      modelType: modeType.Follow,
    };

    await sendNotification([following.fcmToken], notifyPayload);

    // Clean up batch
    delete followBatchStore[key];
  }, 10 * 60 * 1000); // 10 minutes delay
};
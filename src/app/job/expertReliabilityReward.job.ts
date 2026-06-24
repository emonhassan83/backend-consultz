import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { User } from '../modules/user/user.model'
import { Booking } from '../modules/booking/booking.models'
import { BOOKING_STATUS } from '../modules/booking/booking.constants'
import { USER_ROLE, USER_STATUS } from '../modules/user/user.constant'
import { sendNotification } from '../utils/sentNotification'
import { modeType } from '../modules/notification/notification.interface'

dayjs.extend(utc)

export const expertReliabilityRewardJob = async (): Promise<void> => {
  console.log('[Reliability Reward] Job started')

  const nowUtc = dayjs.utc().toDate()
  const thirtyDaysAgo = dayjs.utc().subtract(30, 'day').toDate()

  // Only check experts who have never received this bonus
  // or whose last bonus was more than 30 days ago
  const experts = await User.find({
    role: USER_ROLE.expert,
    status: USER_STATUS.active,
    isDeleted: false,
    $or: [
      { lastNoShowBonusAt: null },
      { lastNoShowBonusAt: { $lte: thirtyDaysAgo } },
    ],
  }).select('_id fcmToken pushNotify lastNoShowBonusAt')

  console.log(`[Reliability Reward] Checking ${experts.length} eligible experts`)

  for (const expert of experts) {
    // Count no-show bookings for this expert in the last 30 days
    const noShowCount = await Booking.countDocuments({
      consult: expert._id,
      status: BOOKING_STATUS.not_responded,
      updatedAt: { $gte: thirtyDaysAgo },
      isDeleted: false,
    })

    if (noShowCount > 0) {
      console.log(
        `[Reliability Reward] ❌ Expert ${expert._id} has ${noShowCount} no-shows — skipping`,
      )
      continue
    }

    // Award 300 points and update the last bonus timestamp
    await User.findByIdAndUpdate(expert._id, {
      $inc: { points: 300 },
      lastNoShowBonusAt: nowUtc,
    })

    console.log(`[Reliability Reward] ✅ 300 points awarded to expert ${expert._id}`)

    // Send push notification if enabled
    if (expert.fcmToken && expert.pushNotify?.points) {
      await sendNotification([expert.fcmToken], {
        receiver: expert._id,
        message: 'Reliability Bonus Awarded!',
        description:
          'Congratulations! You had zero no-shows in the last 30 days and earned 300 points. Keep it up! 🎉',
        reference: expert._id,
        modelType: modeType.Achievement,
      }).catch((err) =>
        console.error(`Push failed for expert ${expert._id}:`, err),
      )
    }
  }

  console.log('[Reliability Reward] Job completed')
}
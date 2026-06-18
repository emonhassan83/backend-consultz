import { User } from '../modules/user/user.model'
import { Booking } from '../modules/booking/booking.models'
import { BOOKING_STATUS } from '../modules/booking/booking.constants'
import { USER_ROLE, USER_STATUS } from '../modules/user/user.constant'
import { sendNotification } from '../utils/sentNotification'
import { modeType } from '../modules/notification/notification.interface'

export const expertReliabilityRewardJob = async (): Promise<void> => {
  console.log('[No-Show Bonus] Job started')

  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const experts = await User.find({
    role: USER_ROLE.expert,
    status: USER_STATUS.active,
    isDeleted: false,
    $or: [
      { lastNoShowBonusAt: null },
      { lastNoShowBonusAt: { $lte: thirtyDaysAgo } },
    ],
  }).select('_id points fcmToken pushNotify lastNoShowBonusAt')

  console.log(`[No-Show Bonus] Checking ${experts.length} eligible experts`)

  for (const expert of experts) {
    const noShowCount = await Booking.countDocuments({
      consult: expert._id,
      status: BOOKING_STATUS.not_responded,
      updatedAt: { $gte: thirtyDaysAgo },
      isDeleted: false,
    })

    if (noShowCount > 0) {
      console.log(`[No-Show Bonus] ❌ Expert ${expert._id} has ${noShowCount} no-shows — skipping`)
      continue
    }

    await User.findByIdAndUpdate(expert._id, {
      $inc: { points: 300 },
      lastNoShowBonusAt: now,
    })

    console.log(`[No-Show Bonus] ✅ 300 points awarded to expert ${expert._id}`)

    if (expert.fcmToken && expert.pushNotify?.points) {
      await sendNotification([expert.fcmToken], {
        receiver: expert._id,
        message: 'Reliability Bonus Awarded!',
        description: 'Congratulations! You had zero no-shows in the last 30 days and earned 300 points. Keep it up! 🎉',
        reference: expert._id,
        modelType: modeType.Achievement,
      })
    }
  }

  console.log('[No-Show Bonus] Job completed')
}
import dayjs from 'dayjs'
import { User } from '../modules/user/user.model'
import { Booking } from '../modules/booking/booking.models'
import { BOOKING_STATUS } from '../modules/booking/booking.constants'
import { USER_ROLE, USER_STATUS } from '../modules/user/user.constant'
import { sendNotification } from '../utils/sentNotification'
import { modeType } from '../modules/notification/notification.interface'

export const expertResponseTimeRewardJob = async (): Promise<void> => {
  console.log('[Response Time Reward] Job started')

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const experts = await User.find({
    role: USER_ROLE.expert,
    status: USER_STATUS.active,
    isDeleted: false,
  }).select('_id points fcmToken pushNotify')

  for (const expert of experts) {
    const pendingRequests = await Booking.find({
      consult: expert._id,
      status: BOOKING_STATUS.pending,
      createdAt: { $gte: sevenDaysAgo },
      isDeleted: false,
    }).select('_id createdAt updatedAt')

    const totalRequests = pendingRequests.length
    if (totalRequests === 0) continue

    let fastResponses = 0
    for (const req of pendingRequests) {
      const responseTimeMinutes = dayjs(req.updatedAt).diff(req.createdAt, 'minute')
      if (responseTimeMinutes <= 30) fastResponses++
    }

    const fastResponseRate = (fastResponses / totalRequests) * 100
    if (fastResponseRate < 80) continue

    await User.findByIdAndUpdate(expert._id, { $inc: { points: 50 } })

    console.log(`[Response Time Reward] ✅ 50 points awarded to expert ${expert._id}`)

    if (expert.fcmToken && expert.pushNotify?.points) {
      await sendNotification([expert.fcmToken], {
        receiver: expert._id,
        message: 'Fast Response Reward!',
        description: 'You earned 50 points this week for maintaining fast response time to booking requests. Excellent! 🎉',
        reference: expert._id,
        modelType: modeType.Achievement,
      })
    }
  }

  console.log('[Response Time Reward] Job completed')
}
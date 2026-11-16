import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { User } from '../modules/user/user.model'
import { Booking } from '../modules/booking/booking.models'
import {
  BOOKING_NO_SHOW_BY,
  BOOKING_STATUS,
  PAYMENT_STATUS,
} from '../modules/booking/booking.constants'
import { USER_ROLE, USER_STATUS } from '../modules/user/user.constant'
import { PointsService } from '../modules/points/points.service'
import { POINTS_REWARD_KEY } from '../modules/points/points.constant'

dayjs.extend(utc)

export const expertReliabilityRewardJob = async (): Promise<void> => {
  // console.log('[Reliability Reward] Job started')

  const nowUtc = dayjs.utc().toDate()
  const rule = await PointsService.getRuleOrNull(POINTS_REWARD_KEY.no_show_bonus)
  if (!rule?.enabled) return

  const windowDays = rule.conditions?.windowDays || 30
  const minSessions = rule.conditions?.minSessions || 5
  const windowStart = dayjs.utc().subtract(windowDays, 'day').toDate()

  const experts = await User.find({
    role: USER_ROLE.expert,
    status: USER_STATUS.active,
    isDeleted: false,
    $or: [
      { lastNoShowBonusAt: null, createdAt: { $lte: windowStart } },
      { lastNoShowBonusAt: { $exists: false }, createdAt: { $lte: windowStart } },
      { lastNoShowBonusAt: { $lte: windowStart, $ne: null } },
    ],
  }).select('_id fcmToken pushNotify lastNoShowBonusAt createdAt')

  for (const expert of experts) {
    if (!expert.lastNoShowBonusAt) {
      if (!expert.createdAt || dayjs.utc(expert.createdAt).isAfter(windowStart)) {
        continue
      }
    } else if (dayjs.utc(expert.lastNoShowBonusAt).isAfter(windowStart)) {
      continue
    }

    const completedBookingCount = await Booking.countDocuments({
      consult: expert._id,
      status: BOOKING_STATUS.completed,
      paymentStatus: { $ne: PAYMENT_STATUS.unpaid },
      isDeleted: false,
      $or: [
        { updatedAt: { $gte: windowStart } },
        { startAt: { $gte: windowStart } },
      ],
    })

    if (completedBookingCount < minSessions) {
      continue
    }

    const noShowCount = await Booking.countDocuments({
      consult: expert._id,
      status: BOOKING_STATUS.not_responded,
      paymentStatus: PAYMENT_STATUS.paid,
      updatedAt: { $gte: windowStart },
      isDeleted: false,
      $or: [
        {
          noShowBy: {
            $in: [BOOKING_NO_SHOW_BY.consultant, BOOKING_NO_SHOW_BY.both],
          },
        },
        { noShowBy: { $exists: false } },
        { noShowBy: null },
      ],
    })

    if (noShowCount > 0) continue

    await PointsService.awardByKey({
      userId: expert._id,
      key: POINTS_REWARD_KEY.no_show_bonus,
      reason: 'Reliability reward for zero no-shows',
      meta: { windowStart, windowEnd: nowUtc },
    })

    await User.findByIdAndUpdate(expert._id, { lastNoShowBonusAt: nowUtc })
  }

  // console.log('[Reliability Reward] Job completed')
}

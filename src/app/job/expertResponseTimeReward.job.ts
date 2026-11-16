import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { User } from '../modules/user/user.model'
import { Booking } from '../modules/booking/booking.models'
import { BOOKING_STATUS, PAYMENT_STATUS } from '../modules/booking/booking.constants'
import { USER_ROLE, USER_STATUS } from '../modules/user/user.constant'
import { PointsService } from '../modules/points/points.service'
import { POINTS_REWARD_KEY } from '../modules/points/points.constant'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

const isWithinExpertAvailability = (
  expert: any,
  createdAtUtc: dayjs.Dayjs,
) => {
  const availability = expert.availability || []
  if (!availability.length) return true

  const expertTz = expert.timeZone || 'UTC'
  const local = createdAtUtc.tz(expertTz)
  const dayName = local.format('dddd').toLowerCase()
  const daySlots =
    availability.find(
      (item: any) => String(item.day || '').toLowerCase() === dayName,
    )?.slots || []

  if (!daySlots.length) return false

  const minutes = local.hour() * 60 + local.minute()
  return daySlots.some((slot: { from: string; to: string }) => {
    const [fromH, fromM] = String(slot.from).split(':').map(Number)
    const [toH, toM] = String(slot.to).split(':').map(Number)
    const fromMin = fromH * 60 + fromM
    const toMin = toH * 60 + toM
    return minutes >= fromMin && minutes <= toMin
  })
}

export const expertResponseTimeRewardJob = async (): Promise<void> => {
  // console.log('[Response Time Reward] Job started')

  const rule = await PointsService.getRuleOrNull(
    POINTS_REWARD_KEY.fast_response_bonus,
  )
  if (!rule?.enabled) return

  const responseMinutes = rule.conditions?.responseMinutes || 30
  const responsePct = rule.conditions?.responsePct || 80
  const minRequests = rule.conditions?.minRequests || 3
  const onlyDuringAvailability = Boolean(
    rule.conditions?.onlyDuringAvailability,
  )
  const { start: weekStart, end: weekEnd } =
    PointsService.getCurrentIsoWeekWindow()

  const experts = await User.find({
    role: USER_ROLE.expert,
    status: USER_STATUS.active,
    isDeleted: false,
  }).select('_id fcmToken pushNotify availability timeZone')

  for (const expert of experts) {
    const bookingRequests = await Booking.find({
      consult: expert._id,
      createdAt: { $gte: weekStart, $lte: weekEnd },
      paymentStatus: PAYMENT_STATUS.paid,
      isDeleted: false,
      status: { $ne: BOOKING_STATUS.pending },
    }).select('_id createdAt respondedAt timezone')

    const eligibleRequests = bookingRequests.filter((req) => {
      if (!onlyDuringAvailability) return true
      return isWithinExpertAvailability(expert, dayjs.utc(req.createdAt))
    })

    const totalRequests = eligibleRequests.length
    if (totalRequests < minRequests) continue

    let fastResponses = 0
    for (const req of eligibleRequests) {
      if (!req.respondedAt) continue
      const bookingTz = (req as any).timezone || 'UTC'
      const createdAtLocal = dayjs.utc(req.createdAt).tz(bookingTz)
      const respondedAtLocal = dayjs.utc(req.respondedAt).tz(bookingTz)
      const responseTimeMinutes = respondedAtLocal.diff(
        createdAtLocal,
        'minute',
      )
      if (responseTimeMinutes <= responseMinutes) fastResponses++
    }

    const fastResponseRate = (fastResponses / totalRequests) * 100
    if (fastResponseRate < responsePct) continue

    const already = await PointsService.hasAwardedReward(
      expert._id,
      POINTS_REWARD_KEY.fast_response_bonus,
      { 'meta.windowStart': weekStart },
    )
    if (already) continue

    await PointsService.awardByKey({
      userId: expert._id,
      key: POINTS_REWARD_KEY.fast_response_bonus,
      reason: 'Fast response time weekly reward',
      meta: { windowStart: weekStart, windowEnd: weekEnd },
    })
  }

  // console.log('[Response Time Reward] Job completed')
}

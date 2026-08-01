import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import mongoose from 'mongoose'
import httpStatus from 'http-status'
import { TBookings } from './booking.interface'
import { BOOKING_STATUS, PAYMENT_STATUS } from './booking.constants'
import AppError from '../../errors/AppError'
import { Booking } from './booking.models'
import { User } from '../user/user.model'
import {
  getUnreadMessageCount,
  getUnreadMessageCountsBatch,
  sendBookingsNotification,
} from './booking.utils'
import QueryBuilder from '../../builder/QueryBuilder'
import { BookingSlots } from '../bookingSlots/bookingSlots.model'
import { Payment } from '../payment/payment.model'
import { Contents } from '../contents/contents.models'
import Stripe from 'stripe'
import config from '../../config'
import {
  sendCancellationEmail,
  sendRescheduleEmail,
  sendScheduleChangeRequestEmail,
  sendSessionCompletedToConsultant,
} from '../../utils/emailNotify'
import { sendNotification } from '../../utils/sentNotification'
import isoWeek from 'dayjs/plugin/isoWeek'
import { modeType } from '../notification/notification.interface'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import { TUser } from '../user/user.interface'
import { timeSensitiveNotificationsJob } from '../../job/timeSensitiveNotifications.job'
import { USER_STATUS } from '../user/user.constant'
import {
  buildBookingInterval,
  isMinNoticeSatisfied,
  isWithinBookingHorizon,
  parseLocalDateTimeToUtc,
  resolveBookingRules,
} from './bookingRules.utils'

const getEntityId = (entity: any): string =>
  (entity?._id || entity)?.toString()

dayjs.extend(isSameOrBefore)
dayjs.extend(isoWeek)
dayjs.extend(customParseFormat)
dayjs.extend(utc)
dayjs.extend(timezone)

const stripe = new Stripe(config.stripe?.stripe_api_secret as string, {
  apiVersion: '2026-06-24.dahlia',
  typescript: true,
})

const ACTIVE_BOOKING_STATUSES = [
  BOOKING_STATUS.pending,
  BOOKING_STATUS.confirmed,
  BOOKING_STATUS.running,
  BOOKING_STATUS.completed,
]

const isIntervalOverlapping = (
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
) => startA < endB && endA > startB

const getOfferedSessionDuration = (expert: any, duration: number) => {
  return expert.sessionDurations?.find(
    (session: any) => session.duration === duration && session.isOffered,
  )
}

const getSessionPrice = (expert: any, duration: number) => {
  if (typeof expert.hourlyRate !== 'number' || expert.hourlyRate <= 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Consultant hourly rate is not configured.',
    )
  }

  return Number(((expert.hourlyRate / 60) * duration).toFixed(2))
}

const buildLegacyBookingInterval = ({
  booking,
  timezone,
  rules,
}: {
  booking: any
  timezone: string
  rules: ReturnType<typeof resolveBookingRules>
}) => {
  if (booking.startAt && booking.bufferEndAt) {
    return {
      start: new Date(booking.startAt),
      end: new Date(booking.bufferEndAt),
    }
  }

  if (!booking.slot?.date || !booking.slot?.time) {
    const bookingDate = booking.localDate || booking.date
    const bookingTime = booking.localStartTime || booking.localTime

    if (!bookingDate || !bookingTime) {
      return null
    }

    const interval = buildBookingInterval({
      date: bookingDate,
      startTime: bookingTime,
      duration: booking.sessionDuration,
      timezone: booking.timezone || timezone,
      rules,
    })

    return {
      start: interval.startAt,
      end: interval.bufferEndAt,
    }
  }

  const interval = buildBookingInterval({
    date: booking.slot.date,
    startTime: booking.slot.time,
    duration: booking.sessionDuration,
    timezone: booking.timezone || timezone,
    rules,
  })

  return {
    start: interval.startAt,
    end: interval.bufferEndAt,
  }
}

const getBookingDisplayFields = (booking: any, slot?: any) => ({
  displayDate: booking.localDate || booking.date || slot?.date || null,
  displayStartTime:
    booking.localStartTime ||
    booking.localTime ||
    slot?.time ||
    booking.startTime ||
    null,
  displayEndTime: booking.localEndTime || booking.endTime || null,
  displayTimezone: booking.timezone || 'UTC',
})

const attachBookingDisplayFields = (booking: any, slot?: any) => ({
  ...booking,
  ...getBookingDisplayFields(booking, slot),
})

const getGeneralNumberSetting = async (
  key: string,
  defaultValue: number,
): Promise<number> => {
  const content = await Contents.findOne({ key }).select('value').lean()
  const value = Number(content?.value)
  return Number.isFinite(value) && value >= 0 ? value : defaultValue
}

const resolveBookingStartDate = (booking: any): Date | null => {
  if (booking.startAt) {
    return new Date(booking.startAt)
  }

  const bookingDate = booking.localDate || booking.date || booking.slot?.date
  const bookingTime =
    booking.localStartTime ||
    booking.localTime ||
    booking.startTime ||
    booking.slot?.time

  if (!bookingDate || !bookingTime) {
    return null
  }

  const parsedStart = dayjs.tz(
    `${bookingDate} ${bookingTime}`,
    'YYYY-MM-DD HH:mm',
    booking.timezone || 'UTC',
  )

  return parsedStart.isValid() ? parsedStart.utc().toDate() : null
}

const ensureActionBeforePolicyWindow = async ({
  booking,
  settingKey,
  defaultMinutes = 60,
  actionLabel,
}: {
  booking: any
  settingKey: 'reschedulingTime' | 'cancellationTime'
  defaultMinutes?: number
  actionLabel: string
}) => {
  const policyMinutes = await getGeneralNumberSetting(settingKey, defaultMinutes)
  const startAt = resolveBookingStartDate(booking)

  if (!startAt) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot validate ${actionLabel} policy because booking start time is missing.`,
    )
  }

  const deadline = dayjs(startAt).subtract(policyMinutes, 'minute')

  if (dayjs().isAfter(deadline)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `${actionLabel} is not allowed within ${policyMinutes} minutes of the scheduled time.`,
    )
  }
}

const getLegacySlotMapForBookings = async (bookingIds: string[]) => {
  if (!bookingIds.length) return new Map<string, any>()

  const rawBookings = await Booking.collection
    .find({ _id: { $in: bookingIds.map((id) => new mongoose.Types.ObjectId(id)) } })
    .project({ _id: 1, slot: 1 })
    .toArray()

  const slotIds = rawBookings
    .map((booking) => booking.slot)
    .filter(Boolean)

  if (!slotIds.length) return new Map<string, any>()

  const slots = await BookingSlots.find({ _id: { $in: slotIds } })
    .select('date time')
    .lean()

  const slotById = new Map(slots.map((slot: any) => [slot._id.toString(), slot]))
  const slotByBookingId = new Map<string, any>()

  rawBookings.forEach((booking) => {
    if (booking.slot) {
      const slot = slotById.get(booking.slot.toString())
      if (slot) slotByBookingId.set(booking._id.toString(), slot)
    }
  })

  return slotByBookingId
}

const createBookings = async (payload: TBookings, userId: string) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const { consult: consultId } = payload

    // 1. User validation
    const userData = await User.findById(userId).session(session)
    if (!userData || userData.isDeleted) {
      throw new AppError(httpStatus.BAD_REQUEST, 'User not found!')
    }

    // 2. Consultant validation
    const consult = await User.findById(consultId).session(session)
    if (!consult || consult.isDeleted) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Consultant not found!')
    }

    if (consult.status !== USER_STATUS.active) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Consultant is not active!')
    }

    if (!getOfferedSessionDuration(consult, payload.sessionDuration)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Selected session duration is not offered by this consultant.',
      )
    }

    {
      const timezoneValue = consult.timeZone || 'UTC'
      const rules = resolveBookingRules(consult)
      const interval = buildBookingInterval({
        date: payload.date as string,
        startTime: payload.startTime as string,
        duration: payload.sessionDuration,
        timezone: timezoneValue,
        rules,
      })

      if (!isMinNoticeSatisfied(interval.startAt, rules)) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          `Booking must be made at least ${rules.minNotice} hours before the session start time.`,
        )
      }

      if (!isWithinBookingHorizon(interval.startAt, rules)) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          `Booking cannot be made more than ${rules.bookingHorizonDays} days in advance.`,
        )
      }

      const requestedDay = dayjs
        .tz(payload.date as string, 'YYYY-MM-DD', timezoneValue)
        .format('ddd')
        .toLowerCase()
      const dayAvailability = consult.availability?.find(
        (availability: any) => availability.day === requestedDay,
      )

      const isInsideAvailability = dayAvailability?.slots?.some(
        (slot: { from: string; to: string }) => {
          const availabilityStart = parseLocalDateTimeToUtc(
            payload.date as string,
            slot.from,
            timezoneValue,
          )
          const availabilityEnd = parseLocalDateTimeToUtc(
            payload.date as string,
            slot.to,
            timezoneValue,
          )

          return (
            interval.startAt >= availabilityStart &&
            interval.bufferEndAt <= availabilityEnd
          )
        },
      )

      if (!isInsideAvailability) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Selected booking time is outside consultant availability.',
        )
      }

      const existingBookings = await Booking.find({
        consult: consult._id,
        status: { $in: ACTIVE_BOOKING_STATUSES },
        paymentStatus: PAYMENT_STATUS.paid,
        isDeleted: false,
      })
        .select('sessionDuration timezone startAt endAt bufferEndAt date localDate localTime localStartTime')
        .session(session)

      const hasOverlap = existingBookings.some((booking: any) => {
        const existingInterval = buildLegacyBookingInterval({
          booking,
          timezone: timezoneValue,
          rules,
        })

        if (!existingInterval) {
          return false
        }

        return isIntervalOverlapping(
          interval.startAt,
          interval.bufferEndAt,
          existingInterval.start,
          existingInterval.end,
        )
      })

      if (hasOverlap) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Selected booking time overlaps with an existing booking.',
        )
      }

      const frontendLocalDate = payload.localDate || interval.localDate
      const frontendLocalStartTime =
        payload.localStartTime || payload.localTime || interval.localStartTime
      const frontendLocalEndTime = dayjs(
        `${frontendLocalDate} ${frontendLocalStartTime}`,
        'YYYY-MM-DD HH:mm',
        true,
      ).isValid()
        ? dayjs(`${frontendLocalDate} ${frontendLocalStartTime}`, 'YYYY-MM-DD HH:mm')
          .add(payload.sessionDuration, 'minute')
          .format('HH:mm')
        : interval.localEndTime

      payload.user = new mongoose.Types.ObjectId(userData._id)
      payload.consult = new mongoose.Types.ObjectId(consult._id)
      payload.timezone = timezoneValue
      payload.status = BOOKING_STATUS.pending
      payload.isExpertVatRegistered = !!(
        consult.isVatRegistered && consult.vatRegistrationNumber
      )
      payload.price = getSessionPrice(consult, payload.sessionDuration)
      payload.date = interval.date
      payload.startTime = interval.startTime
      payload.endTime = interval.endTime
      payload.bufferTime = interval.bufferTime
      payload.startAt = interval.startAt
      payload.endAt = interval.endAt
      payload.bufferEndAt = interval.bufferEndAt
      payload.localDate = frontendLocalDate
      payload.localStartTime = frontendLocalStartTime
      payload.localEndTime = frontendLocalEndTime

      const [createdBooking] = await Booking.create([payload], { session })
      if (!createdBooking) {
        throw new AppError(httpStatus.BAD_REQUEST, 'Failed to create booking')
      }

      await session.commitTransaction()
      return createdBooking
    }

    throw new AppError(httpStatus.BAD_REQUEST, 'Legacy slot booking payload is no longer supported.')
    /*

    // 3. Slot validation
    const slotTime = await BookingSlots.findOne({
      _id: slotId.toString(),
      author: consultId,
    }).session(session)
    if (!slotTime) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Slot not found!')
    }
    if (slotTime.isBooked) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Slot already booked!')
    }

    // 🔥 NEW CHECK: Prevent same user from booking the same slot again if it's still booked
    // const unpaidBooking = await Booking.findOne({
    //   user: userId,
    //   consult: consult?._id,
    //   slot: slotId,
    //   isDeleted: false,
    //   paymentStatus: PAYMENT_STATUS.unpaid,
    // }).session(session)
    // if (unpaidBooking) {
    //   return unpaidBooking
    // }

    const existingBooking = await Booking.findOne({
      consult: consult?._id,
      slot: slotId,
      isDeleted: false,
      status: {
        $nin: [
          BOOKING_STATUS.cancelled,
          BOOKING_STATUS.not_responded,
          BOOKING_STATUS.declined,
        ],
      }, // ignore bookings
      paymentStatus: PAYMENT_STATUS.paid
    }).session(session)

    if (existingBooking) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'This expert already booked this slot. You cannot book the same slot again.',
      )
    }

    // 4. Date/time validation (buffer time check)
    const slotDateTimeStr = `${slotTime.date} ${slotTime.time}`
    const slotDateTime = dayjs(slotDateTimeStr, 'YYYY-MM-DD HH:mm')

    if (!slotDateTime.isValid()) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Invalid slot date/time format',
      )
    }

    const now = dayjs()
    const minBufferMinutes = 0

    if (slotDateTime.isBefore(now.add(minBufferMinutes, 'minute'))) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Booking must be made at least ${minBufferMinutes} minutes in advance. Slot time: ${slotDateTime.format('YYYY-MM-DD HH:mm')}`,
      )
    }

    // 5. Assign payload values
    payload.user = new mongoose.Types.ObjectId(userData._id)
    payload.slot = new mongoose.Types.ObjectId(slotTime._id)
    // Keep the timezone associated with localDate/localTime when the client
    // supplies it. Fall back to the consultant's slot timezone for old clients.
    payload.timezone = payload.timezone || consult.timeZone || 'UTC'
    payload.status = BOOKING_STATUS.pending
    payload.isExpertVatRegistered = !!(
      consult.isVatRegistered && consult.vatRegistrationNumber
    )

    // Calculate DM close time
    const sessionDurationMinutes = payload.sessionDuration || 60
    const dmCloseTime = slotDateTime
      .add(sessionDurationMinutes, 'minute')
      .add(6, 'hour')
      .toDate()

    payload.dmCloseTime = dmCloseTime

    // 6. Create the booking
    const [createdBooking] = await Booking.create([payload], { session })
    if (!createdBooking) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to create booking')
    }
    await session.commitTransaction()

    return createdBooking
    */
  } catch (error) {
    await session.abortTransaction()
    throw error instanceof AppError
      ? error
      : new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to create booking',
      )
  } finally {
    session.endSession()
  }
}

const getBookingCalender = async (
  query: Record<string, any>,
  userId: string,
) => {
  const { date } = query // "2026-04"

  if (!date || !/^\d{4}-\d{2}$/.test(date)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Invalid date format. Use YYYY-MM (e.g., 2026-04)',
    )
  }

  const [year, month] = date.split('-').map(Number)

  const startOfMonth = `${year}-${month.toString().padStart(2, '0')}-01`
  const endOfMonth = dayjs(`${year}-${month}-01`)
    .endOf('month')
    .format('YYYY-MM-DD')

  // 1. Current user-এর সব active booking খুঁজে বের করা
  const bookings = await Booking.find({
    $or: [{ user: userId }, { consult: userId }],
    isDeleted: false,
    paymentStatus: { $ne: PAYMENT_STATUS.unpaid },
    status: {
      $nin: [
        BOOKING_STATUS.declined,
        BOOKING_STATUS.cancelled,
        BOOKING_STATUS.not_responded,
      ],
    },
  })
    .select('date localDate')
    .lean()

  const slotIds = bookings
    .filter((b) => (b as any).slot)
    .map((b) => (b as any).slot.toString())

  // 2. এই মাসের স্লটগুলো নেওয়া
  const slots = await BookingSlots.find({
    _id: { $in: slotIds },
    date: { $gte: startOfMonth, $lte: endOfMonth },
  })
    .select('date isBooked')
    .lean()

  // 3. Date wise isBooked map তৈরি
  const bookedDates = new Set<string>()
  bookings.forEach((booking: any) => {
    const bookingDate = booking.localDate || booking.date
    if (
      bookingDate &&
      bookingDate >= startOfMonth &&
      bookingDate <= endOfMonth
    ) {
      bookedDates.add(bookingDate)
    }
  })

  const slotByBookingId = await getLegacySlotMapForBookings(
    bookings.map((booking: any) => booking._id.toString()),
  )

  bookings.forEach((booking: any) => {
    const slotDate = slotByBookingId.get(booking._id.toString())?.date
    if (slotDate && slotDate >= startOfMonth && slotDate <= endOfMonth) {
      bookedDates.add(slotDate)
    }
  })
  slots.forEach((slot) => {
    if (slot.isBooked === true) {
      bookedDates.add(slot.date)
    }
  })

  // 4. পুরো মাসের সব তারিখ generate করা + isBooked flag
  const calendarData: { date: string; isBooked: boolean }[] = []

  let currentDate = dayjs(startOfMonth)
  const lastDate = dayjs(endOfMonth)

  while (currentDate.isSameOrBefore(lastDate)) {
    const dateStr = currentDate.format('YYYY-MM-DD')
    calendarData.push({
      date: dateStr,
      isBooked: bookedDates.has(dateStr),
    })
    currentDate = currentDate.add(1, 'day')
  }

  return calendarData
}

const getAllBookings = async (
  query: Record<string, any>,
  currentUserId: string,
) => {
  const queryCopy = { ...query }
  const { consult, user, ...restQuery } = queryCopy

  let baseFilter: any = {
    isDeleted: false,
    paymentStatus: { $ne: PAYMENT_STATUS.unpaid },
  }

  if (consult) baseFilter.consult = new mongoose.Types.ObjectId(consult)
  if (user) baseFilter.user = new mongoose.Types.ObjectId(user)

  const bookingModel = new QueryBuilder(
    Booking.find(baseFilter)
      .populate([
        { path: 'user', select: 'firstName lastName photoUrl' },
        { path: 'consult', select: 'firstName lastName photoUrl' },
      ])
      .select(
        'user consult sessionType sessionDuration price timezone status createdAt mainQuestion date localDate localTime localStartTime localEndTime startTime endTime',
      ) as any,
    restQuery,
  )
    .search(['mainQuestion'])
    .filter()
    .paginate()
    .sort()

  const data = await bookingModel.modelQuery
  const meta = await bookingModel.countTotal()

  // ✅ Batch unread counts
  const bookingIds = data.map((b: any) => b._id.toString())
  const unreadMap = await getUnreadMessageCountsBatch(bookingIds, currentUserId)

  // ✅ Batch payment details
  const payments = await Payment.find({ booking: { $in: bookingIds } }).lean()
  const slotByBookingId = await getLegacySlotMapForBookings(bookingIds)
  const paymentMap = new Map()
  payments.forEach((p: any) => {
    paymentMap.set(p.booking.toString(), p)
  })

  const enriched = data.map((booking: any) => {
    const payment = paymentMap.get(booking._id.toString())
    return {
      ...attachBookingDisplayFields(
        booking.toObject(),
        slotByBookingId.get(booking._id.toString()),
      ),
      unreadMessageCount: unreadMap.get(booking._id.toString()) ?? 0,
      totalPay: payment?.amount || 0,
      vat: payment?.consultantVat || 0,
    }
  })

  return { data: enriched, meta }
}

const getAllBookingsByDate = async (
  query: Record<string, any>,
  userId: string,
) => {
  const { filterType, date, ...restQuery } = query

  let targetDates: string[] = []
  const today = dayjs()

  if (date) {
    const parsed = dayjs(date, 'DD-MM-YYYY')
    if (!parsed.isValid()) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Invalid date format. Use DD-MM-YYYY',
      )
    }
    targetDates = [parsed.format('YYYY-MM-DD')]
  } else if (filterType === 'today') {
    targetDates = [today.format('YYYY-MM-DD')]
  } else if (filterType === 'tomorrow') {
    targetDates = [today.add(1, 'day').format('YYYY-MM-DD')]
  } else if (filterType === 'day') {
    targetDates = [
      today.format('YYYY-MM-DD'),
      today.add(1, 'day').format('YYYY-MM-DD'),
    ]
  } else if (filterType === 'week') {
    const startOfWeek = today.startOf('isoWeek')
    for (let i = 0; i < 7; i++) {
      targetDates.push(startOfWeek.add(i, 'day').format('YYYY-MM-DD'))
    }
  } else if (filterType === 'month') {
    const startOfMonth = today.startOf('month')
    const daysInMonth = today.daysInMonth()
    for (let i = 0; i < daysInMonth; i++) {
      targetDates.push(startOfMonth.add(i, 'day').format('YYYY-MM-DD'))
    }
  } else {
    targetDates = [today.format('YYYY-MM-DD')]
  }

  const matchingSlots = await BookingSlots.find({
    date: { $in: targetDates },
  }).select('_id')

  const slotIds = matchingSlots.map((s) => s._id)
  const legacyBookingIds = slotIds.length
    ? (
      await Booking.collection
        .find({ slot: { $in: slotIds } })
        .project({ _id: 1 })
        .toArray()
    ).map((booking) => booking._id)
    : []

  const bookingFilter: Record<string, any> = {
    isDeleted: false,
    paymentStatus: { $ne: PAYMENT_STATUS.unpaid },
    $or: [{ user: userId }, { consult: userId }],
    $and: [
      {
        $or: [
          { localDate: { $in: targetDates } },
          { date: { $in: targetDates } },
          { _id: { $in: legacyBookingIds } },
        ],
      },
    ],
  }

  const bookings: any[] = await Booking.find(bookingFilter)
    .populate([
      { path: 'user', select: 'firstName lastName photoUrl' },
      { path: 'consult', select: 'firstName lastName photoUrl' },
    ])
    .select(
      'user consult sessionType sessionDuration price timezone status createdAt date localDate localTime localStartTime localEndTime startTime endTime',
    )
    .sort({ createdAt: -1 })

  // ✅ Batch unread counts for all fetched bookings
  const bookingIds = bookings.map((b) => b._id.toString())
  const unreadMap = await getUnreadMessageCountsBatch(bookingIds, userId)

  // ✅ Batch payment details
  const payments = await Payment.find({ booking: { $in: bookingIds } }).lean()
  const slotByBookingId = await getLegacySlotMapForBookings(bookingIds)
  const paymentMap = new Map()
  payments.forEach((p: any) => {
    paymentMap.set(p.booking.toString(), p)
  })

  const enrichBooking = (booking: any) => {
    const payment = paymentMap.get(booking._id.toString())
    return {
      ...attachBookingDisplayFields(
        booking.toObject(),
        slotByBookingId.get(booking._id.toString()),
      ),
      unreadMessageCount: unreadMap.get(booking._id.toString()) ?? 0,
      totalPay: payment?.amount || 0,
      vat: payment?.consultantVat || 0,
    }
  }

  if (targetDates.length === 1) {
    return {
      data: {
        date: dayjs(targetDates[0]).format('DD-MM-YYYY'),
        bookingList: bookings.map(enrichBooking),
      },
    }
  }

  const groupedByDate: Record<string, any[]> = {}
  for (const d of targetDates) {
    groupedByDate[d] = []
  }

  for (const booking of bookings) {
    const enrichedBooking = enrichBooking(booking)
    const bookingDate = enrichedBooking.displayDate
    if (bookingDate && groupedByDate[bookingDate] !== undefined) {
      groupedByDate[bookingDate].push(enrichedBooking)
    }
  }

  const formattedData = Object.keys(groupedByDate)
    .sort()
    .map((d) => ({
      date: dayjs(d).format('DD-MM-YYYY'),
      bookingList: groupedByDate[d],
    }))

  return { data: formattedData }
}

const getBookingsById = async (id: string, currentUserId: string) => {
  const result = await Booking.findOne({
    _id: id,
    paymentStatus: { $ne: PAYMENT_STATUS.unpaid },
    isDeleted: false,
  }).populate([
    { path: 'user', select: 'firstName lastName photoUrl' },
    { path: 'consult', select: 'firstName lastName photoUrl' },
  ])
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Bookings not found!')
  }

  // Single booking unread count
  const unreadMessageCount = await getUnreadMessageCount(
    result._id.toString(),
    currentUserId,
  )

  const payment = await Payment.findOne({ booking: result._id.toString() }).lean()
  const slotByBookingId = await getLegacySlotMapForBookings([
    result._id.toString(),
  ])

  return {
    ...attachBookingDisplayFields(
      result.toObject(),
      slotByBookingId.get(result._id.toString()),
    ),
    unreadMessageCount,
    totalPay: payment?.amount || 0,
    vat: payment?.consultantVat || 0,
  }
}

const cancelBooking = async (
  bookingId: string,
  currentUserId: string,
  reason = '',
) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // Find booking
    const booking = await Booking.findOne({
      _id: bookingId,
      isDeleted: false,
      $or: [{ user: currentUserId }, { consult: currentUserId }],
    })
      .populate('user consult')
      .session(session)
    if (!booking) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        'Booking not found or you do not have permission to cancel it.',
      )
    }

    // Single Combined Message with Clear Explanation
    if (booking.paymentStatus !== PAYMENT_STATUS.paid) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'This booking has not been paid yet and cannot be cancelled.',
      )
    }
    if (booking.status === BOOKING_STATUS.completed) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'This booking has already been completed and cannot be cancelled.',
      )
    }
    if (booking.status === BOOKING_STATUS.cancelled) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'This booking has already been cancelled.',
      )
    }

    await ensureActionBeforePolicyWindow({
      booking,
      settingKey: 'cancellationTime',
      actionLabel: 'Cancellation',
    })

    const legacySlotId = (booking as any).slot
      ? getEntityId((booking as any).slot)
      : null

    if (legacySlotId) {
      await BookingSlots.findByIdAndUpdate(
        legacySlotId,
        { isBooked: false },
        { session },
      )
    }

    // Booking status canceled
    const cancelledBooking = await Booking.findByIdAndUpdate(
      bookingId,
      { status: BOOKING_STATUS.cancelled },
      { returnDocument: 'after', session },
    ).populate('user consult')
    if (!cancelledBooking) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to cancel booking.',
      )
    }

    // Refund process
    let refundProcessed = false
    let refundAmount = 0
    if (booking.paymentStatus == PAYMENT_STATUS.paid) {
      const payment = await Payment.findOne({
        booking: booking._id.toString(),
        isPaid: true,
        isDeleted: false,
      }).session(session)

      if (payment && payment.paymentIntentId) {
        try {
          const refund = await stripe.refunds.create({
            payment_intent: payment.paymentIntentId,
            amount: payment.amount * 100,
          })

          // payment status changed
          await Payment.updateOne(
            { _id: payment._id },
            { status: PAYMENT_STATUS.refunded },
            { session },
          )

          refundProcessed = true
          refundAmount = refund.amount / 100

          refundProcessed = true
        } catch (refundError: any) {
          console.error('Refund failed:', refundError.message)
          // Also throw error if fail
          throw new AppError(
            httpStatus.INTERNAL_SERVER_ERROR,
            `Refund failed via Stripe: ${refundError.message}. Cancellation aborted.`,
          )
        }
      }
    }

    // user and consult sent notify
    const [booker, expert] = await Promise.all([
      User.findById(getEntityId(booking.user)).session(session),
      User.findById(getEntityId(booking.consult)).session(session),
    ])

    const cancelledBy =
      currentUserId.toString() === getEntityId(booking.user) ? 'booker' : 'consult'
    if (booker && booker?.fcmToken && booker.pushNotify?.bookingAndSchedule) {
      await sendBookingsNotification(
        'cancellation',
        cancelledBooking,
        booker,
        expert as TUser,
        null as any,
        { cancelledBy },
      )
    }
    if (expert && expert?.fcmToken && expert.pushNotify?.bookingAndSchedule) {
      await sendBookingsNotification(
        'cancellation',
        cancelledBooking,
        expert,
        expert as TUser,
        null as any,
        {
          cancelledBy,
          otherPartyName: booker?.firstName || 'your client',
        },
      )
    }

    // Email notify to user and consult
    const cancelledByEmail =
      currentUserId.toString() === getEntityId(booking.user) ? 'user' : 'consult'
    if (booker && expert) {
      await sendCancellationEmail(
        booker,
        expert,
        cancelledBooking,
        reason,
        cancelledByEmail,
      )
    }
    await session.commitTransaction()

    return {
      booking,
      refundProcessed,
      message: refundProcessed
        ? 'Booking cancelled and refund processed'
        : 'Booking cancelled (no refund needed)',
    }
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}

const confirmedBooking = async (bookingId: string, currentUserId: string) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // 1. Find the booking (only the consultant is allowed to confirm)
    const booking = await Booking.findOne({
      _id: bookingId,
      consult: currentUserId,
      isDeleted: false,
    })
      .populate('user consult')
      .session(session)

    if (!booking) {
      throw new AppError(httpStatus.NOT_FOUND, 'Booking not found or not yours')
    }

    // 2. Strict validation checks
    if (
      booking.status === BOOKING_STATUS.completed ||
      booking.status === BOOKING_STATUS.cancelled
    ) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `This booking has already been ${booking.status}. It cannot be confirmed now.`,
      )
    }

    if (booking.status !== BOOKING_STATUS.pending) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Only pending bookings can be confirmed',
      )
    }

    if (booking.paymentStatus !== PAYMENT_STATUS.paid) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'This booking has not been paid yet and cannot be confirmed.',
      )
    }

    // 3. Mark booking as confirmed
    const updatedBooking = await Booking.findByIdAndUpdate(
      bookingId,
      { status: BOOKING_STATUS.confirmed, respondedAt: new Date() },
      { returnDocument: 'after', session },
    ).populate('user consult')

    if (!updatedBooking) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to confirm booking')
    }

    // 4. Award 50 points to the USER (booker)
    const user = await User.findById(updatedBooking.user).session(session)
    if (user) {
      const pointsToAdd = 50
      user.points = (user.points || 0) + pointsToAdd
      await user.save({ session })

      // Send push notification (if enabled)
      if (user.fcmToken && user.pushNotify?.points) {
        await sendNotification([user.fcmToken], {
          receiver: user._id,
          message: 'Booking Confirmed!',
          description: `You have earned 50 points for booking a consultation. Keep booking more! 🎉`,
          reference: updatedBooking._id as string,
          modelType: modeType.Achievement,
        })
      }
    }

    // 5. New Reward #1: Rebook same expert within 30 days → 150 points for user
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const previousBookingsWithSameExpert = await Booking.countDocuments({
      user: updatedBooking.user,
      consult: updatedBooking.consult,
      status: BOOKING_STATUS.completed,
      createdAt: { $gte: thirtyDaysAgo, $lt: updatedBooking.createdAt },
      isDeleted: false,
    }).session(session)

    if (previousBookingsWithSameExpert > 0) {
      // This is a repeat booking → award 150 points
      user!.points = (user!.points || 0) + 150
      await user!.save({ session })

      if (user!.fcmToken && user!.pushNotify?.points) {
        await sendNotification([user!.fcmToken], {
          receiver: user!._id,
          message: 'Repeat Booking Bonus!',
          description: `You have earned 150 points for re-booking the same expert within 30 days!`,
          reference: updatedBooking._id as string,
          modelType: modeType.Achievement,
        })
      }
    }

    // 6. New Reward #2: 3 bookings within 30 days → 300 bonus points for user
    const thirtyDaysAgoForBonus = new Date()
    thirtyDaysAgoForBonus.setDate(thirtyDaysAgoForBonus.getDate() - 30)

    const bookingsInLast30Days = await Booking.countDocuments({
      user: updatedBooking.user,
      status: { $in: [BOOKING_STATUS.completed, BOOKING_STATUS.confirmed] },
      createdAt: { $gte: thirtyDaysAgoForBonus },
      isDeleted: false,
    }).session(session)

    // If this booking makes it 3 or more
    if (bookingsInLast30Days >= 3) {
      user!.points = (user!.points || 0) + 300
      await user!.save({ session })

      if (user!.fcmToken && user!.pushNotify?.points) {
        await sendNotification([user!.fcmToken], {
          receiver: user!._id,
          message: 'Booking Streak Bonus!',
          description: `Congratulations! You have earned 300 bonus points for booking 3 sessions within 30 days!`,
          reference: updatedBooking._id as string,
          modelType: modeType.Achievement,
        })
      }
    }

    // 7. Send confirmation notification to user (existing logic)
    if (user && user.fcmToken && user.pushNotify?.bookingAndSchedule) {
      await sendBookingsNotification(
        'confirmed',
        updatedBooking,
        user,
        updatedBooking.consult as any,
        null as any,
      )
    }

    await session.commitTransaction()

    // A booking may be accepted inside the normal reminder window. Evaluate it
    // immediately so it does not depend on the next cron tick.
    await timeSensitiveNotificationsJob(bookingId).catch((error) =>
      console.error(`Immediate reminder failed for booking ${bookingId}:`, error),
    )

    return updatedBooking
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}

const declineBooking = async (
  bookingId: string,
  currentUserId: string,
  payload: { reason: string },
) => {
  const { reason } = payload

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // 1. Find the booking (only the consultant is allowed to decline)
    const booking = await Booking.findOne({
      _id: bookingId,
      consult: currentUserId,
      isDeleted: false,
    })
      .populate('user consult')
      .session(session)

    if (!booking) {
      throw new AppError(httpStatus.NOT_FOUND, 'Booking not found or not yours')
    }

    // 2. Validation checks
    if (
      booking.status === BOOKING_STATUS.completed ||
      booking.status === BOOKING_STATUS.cancelled
    ) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `This booking has already been ${booking.status}. It cannot be declined now.`,
      )
    }

    if (booking.status !== BOOKING_STATUS.pending) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Only pending bookings can be declined',
      )
    }

    if (booking.paymentStatus !== PAYMENT_STATUS.paid) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'This booking has not been paid yet and cannot be declined.',
      )
    }

    const legacySlotId = (booking as any).slot
      ? getEntityId((booking as any).slot)
      : null

    if (legacySlotId) {
      await BookingSlots.findByIdAndUpdate(
        legacySlotId,
        { isBooked: false },
        { session },
      )
    }

    // 4. Mark booking as declined
    const updatedBooking = await Booking.findByIdAndUpdate(
      bookingId,
      { status: BOOKING_STATUS.declined },
      { returnDocument: 'after', session },
    ).populate('user consult')

    if (!updatedBooking) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to decline booking')
    }

    // 5. Refund process
    let refundProcessed = false
    let refundAmount = 0

    const payment = await Payment.findOne({
      booking: booking._id.toString(),
      isPaid: true,
      isDeleted: false,
    }).session(session)

    if (payment && payment.paymentIntentId) {
      try {
        const refund = await stripe.refunds.create({
          payment_intent: payment.paymentIntentId,
          amount: payment.amount * 100,
        })

        await Payment.updateOne(
          { _id: payment._id },
          { status: PAYMENT_STATUS.refunded },
          { session },
        )

        refundProcessed = true
        refundAmount = refund.amount / 100
      } catch (refundError: any) {
        console.error('Refund failed:', refundError.message)
      }
    }

    // 6. Fetch user and consult for notifications
    const [booker, expert] = await Promise.all([
      User.findById(booking.user).session(session),
      User.findById(booking.consult).session(session),
    ])

    // 7. Push notification to booker
    if (booker && booker.fcmToken && booker.pushNotify?.bookingAndSchedule) {
      await sendBookingsNotification('declined', updatedBooking, booker, expert as TUser, null as any, {
        cancelledBy: 'booker',
      })
    }

    // 8. Push notification to expert (optional — self declined)
    if (expert && expert.fcmToken && expert.pushNotify?.bookingAndSchedule) {
      await sendBookingsNotification('declined', updatedBooking, expert, expert as TUser, null as any, {
        cancelledBy: 'consult',
        otherPartyName: booker?.firstName || 'your client',
      })
    }

    // 9. Email notification
    if (booker && expert) {
      await sendCancellationEmail(
        booker,
        expert,
        updatedBooking,
        reason,
        'consult',
      )
    }

    await session.commitTransaction()

    return {
      booking: updatedBooking,
      refundProcessed,
      refundAmount,
      message: refundProcessed
        ? 'Booking declined and refund processed'
        : 'Booking declined (no refund needed)',
    }
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}

const completedBooking = async (
  bookingId: string,
  currentUserId: string,
  payload: { recordDuration: number; recordFile: string },
) => {
  const { recordDuration, recordFile } = payload

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const booking = await Booking.findOne({
      _id: bookingId,
      isDeleted: false,
      $or: [{ user: currentUserId }, { consult: currentUserId }],
    })
      .populate('user consult')
      .session(session)

    if (!booking) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        'Booking not found or does not belong to you.',
      )
    }

    if (booking.status === BOOKING_STATUS.completed) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'This booking has already been marked as completed.',
      )
    }
    if (booking.status === BOOKING_STATUS.cancelled) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'This booking has been cancelled and cannot be completed.',
      )
    }
    if (booking.status !== BOOKING_STATUS.confirmed) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Only confirmed bookings can be marked as completed. Current status: ${booking.status}`,
      )
    }
    if (booking.paymentStatus !== PAYMENT_STATUS.paid) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'This booking has not been paid yet and cannot be marked as completed.',
      )
    }

    const updatedBooking = await Booking.findByIdAndUpdate(
      bookingId,
      {
        $set: { status: BOOKING_STATUS.completed, recordDuration, recordFile },
      },
      { returnDocument: 'after', session },
    ).populate('user consult')

    if (!updatedBooking) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to mark booking as completed.',
      )
    }

    // ✅ Fetch consultAmount from Payment model
    const paymentRecord = await Payment.findOne({
      booking: bookingId,
      isDeleted: false,
    })
      .session(session)
      .lean()

    const consultAmount = paymentRecord?.consultAmount ?? updatedBooking.price

    // Award 100 points to the USER
    const booker = await User.findById(updatedBooking.user).session(session)
    if (booker) {
      booker.points = (booker.points || 0) + 100
      await User.findByIdAndUpdate(
        booker._id,
        { points: booker.points },
        { session },
      )

      if (booker.fcmToken && booker.pushNotify?.points) {
        await sendNotification([booker.fcmToken], {
          receiver: booker._id,
          message: 'Session Completed!',
          description: `You have earned 100 points for attending and completing your consultation. Great job! 🎉`,
          reference: updatedBooking._id as string,
          modelType: modeType.Achievement,
        })
      }
    }

    // Award points to the CONSULTANT
    const consultant = await User.findById(updatedBooking.consult).session(
      session,
    )
    if (consultant) {
      consultant.points = (consultant.points || 0) + 100

      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const completedInLastWeek = await Booking.countDocuments({
        consult: consultant._id,
        status: BOOKING_STATUS.completed,
        updatedAt: { $gte: sevenDaysAgo },
        isDeleted: false,
      }).session(session)

      if (completedInLastWeek >= 5) {
        consultant.points += 300

        if (consultant.fcmToken && consultant.pushNotify?.points) {
          await sendNotification([consultant.fcmToken], {
            receiver: consultant._id,
            message: 'Weekly Performance Bonus!',
            description: `Congratulations! You completed 5+ sessions this week and earned 300 bonus points! Keep it up! 🎉`,
            reference: updatedBooking._id as string,
            modelType: modeType.Achievement,
          })
        }
      }

      await User.findByIdAndUpdate(
        consultant._id,
        { points: consultant.points },
        { session },
      )

      if (consultant.fcmToken && consultant.pushNotify?.payment) {
        await sendBookingsNotification(
          'completed',
          updatedBooking,
          consultant,
          consultant as TUser,
          null as any,
        )
      }

      if (consultant.emailNotify?.booking) {
        const paymentHoldDaysContent = await Contents.findOne({ key: 'paymentHoldDays' })
          .session(session)
          .lean()
        const holdDays = paymentHoldDaysContent?.value || 7
        // ✅ consultAmount pass করুন
        await sendSessionCompletedToConsultant(
          consultant,
          updatedBooking,
          booker as TUser,
          paymentRecord,
          holdDays,
        )
      }
    }

    await session.commitTransaction()
    return updatedBooking
  } catch (error: any) {
    await session.abortTransaction()
    throw error instanceof AppError
      ? error
      : new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to complete booking',
      )
  } finally {
    session.endSession()
  }
}

const rescheduleBooking = async (
  id: string,
  payload: {
    date: string
    startTime: string
  },
  currentUserId: string, // added for ownership check (recommended)
) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // 1. Find the booking
    const booking = await Booking.findById(id)
      .populate('user consult')
      .session(session)
    if (!booking || booking.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
    }

    // 2. Verify ownership (security)
    // ✅ সঠিক Authorization Check
    const isUser = booking.user._id.toString() === currentUserId
    const isConsult = booking.consult._id.toString() === currentUserId

    if (!isUser && !isConsult) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'You are not authorized to reschedule this booking. Only the booker or the consultant can reschedule.',
      )
    }

    // 3. Only active bookings can be rescheduled. A closed booking must never
    // be moved back into the active lifecycle.
    if (
      booking.status !== BOOKING_STATUS.confirmed &&
      booking.status !== BOOKING_STATUS.pending
    ) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `A ${booking.status} booking cannot be rescheduled`,
      )
    }

    await ensureActionBeforePolicyWindow({
      booking,
      settingKey: 'reschedulingTime',
      actionLabel: 'Rescheduling',
    })

    {
      const consultant = booking.consult as any
      const timezoneValue = consultant.timeZone || booking.timezone || 'UTC'
      const rules = resolveBookingRules(consultant)
      const interval = buildBookingInterval({
        date: payload.date,
        startTime: payload.startTime,
        duration: booking.sessionDuration,
        timezone: timezoneValue,
        rules,
      })

      if (!getOfferedSessionDuration(consultant, booking.sessionDuration)) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Selected session duration is not offered by this consultant.',
        )
      }

      if (!isMinNoticeSatisfied(interval.startAt, rules)) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          `Reschedule must be made at least ${rules.minNotice} hours before the new session start time.`,
        )
      }

      if (!isWithinBookingHorizon(interval.startAt, rules)) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          `Reschedule cannot be made more than ${rules.bookingHorizonDays} days in advance.`,
        )
      }

      const requestedDay = dayjs
        .tz(payload.date, 'YYYY-MM-DD', timezoneValue)
        .format('ddd')
        .toLowerCase()
      const dayAvailability = consultant.availability?.find(
        (availability: any) => availability.day === requestedDay,
      )

      const isInsideAvailability = dayAvailability?.slots?.some(
        (slot: { from: string; to: string }) => {
          const availabilityStart = parseLocalDateTimeToUtc(
            payload.date as string,
            slot.from,
            timezoneValue,
          )
          const availabilityEnd = parseLocalDateTimeToUtc(
            payload.date as string,
            slot.to,
            timezoneValue,
          )

          return (
            interval.startAt >= availabilityStart &&
            interval.bufferEndAt <= availabilityEnd
          )
        },
      )

      if (!isInsideAvailability) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Selected reschedule time is outside consultant availability.',
        )
      }

      const existingBookings = await Booking.find({
        _id: { $ne: booking._id },
        consult: consultant._id,
        status: { $in: ACTIVE_BOOKING_STATUSES },
        paymentStatus: PAYMENT_STATUS.paid,
        isDeleted: false,
      })
        .select('sessionDuration timezone startAt endAt bufferEndAt date localDate localTime localStartTime')
        .session(session)

      const hasOverlap = existingBookings.some((existingBooking: any) => {
        const existingInterval = buildLegacyBookingInterval({
          booking: existingBooking,
          timezone: timezoneValue,
          rules,
        })

        if (!existingInterval) {
          return false
        }

        return isIntervalOverlapping(
          interval.startAt,
          interval.bufferEndAt,
          existingInterval.start,
          existingInterval.end,
        )
      })

      if (hasOverlap) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Selected reschedule time overlaps with an existing booking.',
        )
      }

      const updatedBooking = await Booking.findOneAndUpdate(
        {
          _id: booking._id,
          status: booking.status,
          updatedAt: booking.updatedAt,
        },
        {
          $set: {
            timezone: timezoneValue,
            date: interval.date,
            startTime: interval.startTime,
            endTime: interval.endTime,
            bufferTime: interval.bufferTime,
            startAt: interval.startAt,
            endAt: interval.endAt,
            bufferEndAt: interval.bufferEndAt,
            localDate: interval.localDate,
            localStartTime: interval.localStartTime,
            localEndTime: interval.localEndTime,
            is10MinReminderSent: false,
            isJoinCallReminderSent: false,
            lastPendingReminderSentAt: null,
          },
        },
        { new: true, session },
      )

      if (!updatedBooking) {
        throw new AppError(
          httpStatus.CONFLICT,
          'Booking schedule changed concurrently. Please try again.',
        )
      }

      const [user, expert] = await Promise.all([
        User.findById(booking.user).session(session),
        User.findById(booking.consult).session(session),
      ])

      if (user?.fcmToken && user.pushNotify?.bookingAndSchedule) {
        await sendBookingsNotification('reschedule', updatedBooking, user, expert as TUser, null as any)
      }

      if (expert?.fcmToken && expert.pushNotify?.bookingAndSchedule) {
        await sendBookingsNotification(
          'reschedule',
          updatedBooking,
          expert,
          expert as TUser,
          null as any,
          { otherPartyName: user?.firstName || 'your client' },
        )
      }

      if (user && expert) {
        await sendRescheduleEmail(user, expert, updatedBooking)
      }

      await session.commitTransaction()
      return updatedBooking
    }
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}

const requestScheduleChange = async (
  id: string,
  payload: { reason?: string },
  currentUserId: string,
) => {
  const booking = await Booking.findOne({
    _id: id,
    consult: currentUserId,
    paymentStatus: PAYMENT_STATUS.paid,
    status: { $in: [BOOKING_STATUS.pending, BOOKING_STATUS.confirmed] },
    isDeleted: false,
  }).populate('user consult')

  if (!booking) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'Paid active booking not found for this consultant',
    )
  }

  const user = booking.user as unknown as TUser
  const consultant = booking.consult as unknown as TUser

  await ensureActionBeforePolicyWindow({
    booking,
    settingKey: 'reschedulingTime',
    actionLabel: 'Schedule change request',
  })

  if (user?.fcmToken && user.pushNotify?.bookingAndSchedule) {
    await sendBookingsNotification(
      'schedule_change_request',
      booking,
      user,
      consultant,
      null as any,
    )
  }

  await sendScheduleChangeRequestEmail(
    user,
    consultant,
    booking,
    payload.reason,
  )

  return booking
}

const deleteBookings = async (id: string) => {
  const booking = await Booking.findById(id)
  if (!booking || booking.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Booking not found!')
  }

  const result = await Booking.findByIdAndUpdate(
    id,
    { isDeleted: true },
    { returnDocument: 'after' },
  )

  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Failed to delete bookings')
  }

  return result
}

export const bookingsService = {
  createBookings,
  getBookingCalender,
  getAllBookings,
  getAllBookingsByDate,
  getBookingsById,
  deleteBookings,
  cancelBooking,
  confirmedBooking,
  declineBooking,
  completedBooking,
  rescheduleBooking,
  requestScheduleChange,
}


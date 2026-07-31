import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import { BookingSlots } from './bookingSlots.model'
import { User } from '../user/user.model'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezonePlugin from 'dayjs/plugin/timezone'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { generateHourlySlots } from './bookingSlots.utils'
import { Booking } from '../booking/booking.models'
import { BOOKING_STATUS } from '../booking/booking.constants'
import {
  buildBookingInterval,
  getBufferForDuration,
  isMinNoticeSatisfied,
  isWithinBookingHorizon,
  parseLocalDateTimeToUtc,
  resolveBookingRules,
} from '../booking/bookingRules.utils'

dayjs.extend(utc)
dayjs.extend(timezonePlugin)
dayjs.extend(customParseFormat)

type TInterval = {
  start: Date
  end: Date
}

const BLOCKING_BOOKING_STATUSES = [
  BOOKING_STATUS.pending,
  BOOKING_STATUS.confirmed,
  BOOKING_STATUS.running,
  BOOKING_STATUS.completed,
]

const subtractBlockedIntervals = (
  availabilityGaps: TInterval[],
  blockedIntervals: TInterval[],
): TInterval[] => {
  const sortedBlockedIntervals = blockedIntervals
    .filter((interval) => interval.start < interval.end)
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const freeGaps: TInterval[] = []

  availabilityGaps.forEach((gap) => {
    let cursor = gap.start

    sortedBlockedIntervals.forEach((blocked) => {
      if (blocked.end <= cursor || blocked.start >= gap.end) {
        return
      }

      if (blocked.start > cursor) {
        freeGaps.push({ start: cursor, end: blocked.start })
      }

      if (blocked.end > cursor) {
        cursor = blocked.end
      }
    })

    if (cursor < gap.end) {
      freeGaps.push({ start: cursor, end: gap.end })
    }
  })

  return freeGaps
}

const formatInTimezone = (date: Date, timezone: string) =>
  dayjs(date).tz(timezone).format('HH:mm')

const insertIntoDB = async (
  payload: { author: string },
  query: { year?: string; month?: string },
) => {
  const { author } = payload
  const year = Number(query.year)
  const month = Number(query.month)

  if (!year || !month || isNaN(year) || isNaN(month)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Valid year and month are required',
    )
  }

  const expert = await User.findById(author).lean()
  if (!expert || expert.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Expert not found!')
  }

  if (!expert.availability?.length) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Expert availability not set')
  }

  // Check if slots already exist for this month
  const monthPrefix = `${year}-${month.toString().padStart(2, '0')}`
  const existingSlots = await BookingSlots.find({
    author,
    date: { $regex: `^${monthPrefix}` },
  })
    .select('date time isBooked')
    .lean()

  if (existingSlots.length > 0) {
    return {
      message: 'Booking slots already exist for this month',
      data: existingSlots,
      count: existingSlots.length,
    }
  }

  // Generate slots from grouped availability
  const daysInMonth = dayjs(`${year}-${month}-01`).daysInMonth()
  const slotsToInsert: any[] = []

  for (let d = 1; d <= daysInMonth; d++) {
    const date = dayjs(`${year}-${month}-${d}`)
    const weekDay = date.format('ddd').toLowerCase() // "mon", "tue", etc.

    // Find matching day object
    const dayAvailability = expert.availability.find(
      (a: any) => a.day === weekDay,
    )

    if (dayAvailability && dayAvailability.slots?.length > 0) {
      dayAvailability.slots.forEach((slot: any) => {
        const hourlySlots = generateHourlySlots(slot.from, slot.to) // your function

        hourlySlots.forEach((time: string) => {
          slotsToInsert.push({
            author,
            date: date.format('YYYY-MM-DD'),
            time,
            isBooked: false,
          })
        })
      })
    }
  }

  if (!slotsToInsert.length) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'No slots generated from availability for this month',
    )
  }

  const insertedSlots = await BookingSlots.insertMany(slotsToInsert, {
    ordered: false,
  })

  return {
    message: 'Booking slots created successfully',
    data: insertedSlots,
    count: insertedSlots.length,
  }
}

const getAllIntoFromDB = async (query: Record<string, unknown>, author: string) => {
  const { year, month, date } = query as {
    year?: string
    month?: string
    date?: string
  }

  if (!year || !month) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Year and month are required')
  }

  if (!author) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Author is required')
  }

  let dateFilter: Record<string, any>

  if (date) {
    // ✅ specific date filter
    dateFilter = { date }
  } else {
    // ✅ month wise filter
    const monthPrefix = `${year}-${month.padStart(2, '0')}`
    dateFilter = { date: { $regex: `^${monthPrefix}` } }
  }

  const result = await BookingSlots.find({
    author,
    ...dateFilter,
  })
    .sort({ date: 1, time: 1 })
    .select('date time isBooked')

  return result
}

const getAIntoFromDB = async (id: string) => {
  const slot = await BookingSlots.findById(id)
  if (!slot) {
    throw new AppError(httpStatus.NOT_FOUND, 'Session slots not found')
  }

  return slot
}

const getDynamicSlotsFromDB = async (query: Record<string, unknown>) => {
  const { expertId, date, duration } = query as {
    expertId: string
    date: string
    duration: string | number
  }

  const sessionDuration = Number(duration)

  const expert = await User.findById(expertId).lean()
  if (!expert || expert.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Expert not found!')
  }

  if (!expert.availability?.length) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Expert availability not set')
  }

  const timezone = expert.timeZone || 'UTC'
  const rules = resolveBookingRules(expert)
  const bufferTime = getBufferForDuration(rules, sessionDuration)
  const requestedDay = dayjs.tz(date, 'YYYY-MM-DD', timezone).format('ddd').toLowerCase()
  const dayAvailability = expert.availability.find(
    (availability: any) => availability.day === requestedDay,
  )

  if (!dayAvailability?.slots?.length) {
    return {
      expertId,
      date,
      duration: sessionDuration,
      timezone,
      slotBufferStep: rules.slotBufferStep,
      bufferTime,
      slots: [],
    }
  }

  const availabilityGaps: TInterval[] = dayAvailability.slots
    .map((slot: { from: string; to: string }) => ({
      start: parseLocalDateTimeToUtc(date, slot.from, timezone),
      end: parseLocalDateTimeToUtc(date, slot.to, timezone),
    }))
    .filter((gap: TInterval) => gap.start < gap.end)

  const dayStart = parseLocalDateTimeToUtc(date, '00:00', timezone)
  const dayEnd = dayjs(dayStart).add(1, 'day').toDate()

  const existingBookings = await Booking.find({
    consult: expertId,
    status: { $in: BLOCKING_BOOKING_STATUSES },
    isDeleted: false,
  })
    .populate('slot', 'date time')
    .select('slot sessionDuration timezone status startAt endAt bufferEndAt')
    .lean()

  const blockedIntervals = existingBookings
    .map((booking: any): TInterval | null => {
      if (booking.startAt && booking.bufferEndAt) {
        return {
          start: new Date(booking.startAt),
          end: new Date(booking.bufferEndAt),
        }
      }

      if (!booking.slot?.date || !booking.slot?.time) {
        return null
      }

      if (booking.slot.date !== date) {
        return null
      }

      const interval = buildBookingInterval({
        date: booking.slot.date,
        startTime: booking.slot.time,
        duration: booking.sessionDuration,
        timezone,
        rules,
      })

      return {
        start: interval.startAt,
        end: interval.bufferEndAt,
      }
    })
    .filter((interval: TInterval | null): interval is TInterval => {
      if (!interval || interval.start >= interval.end) {
        return false
      }

      return interval.start < dayEnd && interval.end > dayStart
    })

  const freeGaps = subtractBlockedIntervals(availabilityGaps, blockedIntervals)
  const slots: {
    startTime: string
    endTime: string
    bufferEndTime: string
    available: boolean
  }[] = []

  freeGaps.forEach((gap) => {
    let cursor = gap.start

    while (cursor < gap.end) {
      const sessionEnd = dayjs(cursor).add(sessionDuration, 'minute').toDate()
      const bufferEnd = dayjs(sessionEnd).add(bufferTime, 'minute').toDate()

      if (bufferEnd > gap.end) {
        break
      }

      if (
        isMinNoticeSatisfied(cursor, rules) &&
        isWithinBookingHorizon(cursor, rules)
      ) {
        slots.push({
          startTime: formatInTimezone(cursor, timezone),
          endTime: formatInTimezone(sessionEnd, timezone),
          bufferEndTime: formatInTimezone(bufferEnd, timezone),
          available: true,
        })
      }

      cursor = bufferEnd
    }
  })

  return {
    expertId,
    date,
    duration: sessionDuration,
    timezone,
    slotBufferStep: rules.slotBufferStep,
    bufferTime,
    slots,
  }
}

export const BookingSlotsService = {
  insertIntoDB,
  getAllIntoFromDB,
  getAIntoFromDB,
  getDynamicSlotsFromDB,
}

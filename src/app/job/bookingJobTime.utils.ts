import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

export const resolveBookingStartUtc = (booking: any): dayjs.Dayjs | null => {
  if (booking.startAt) {
    return dayjs.utc(booking.startAt)
  }

  const bookingTimezone = booking.timezone || 'UTC'
  const bookingDate = booking.localDate || booking.date
  const bookingTime = booking.localStartTime || booking.startTime

  if (!bookingDate || !bookingTime) {
    return null
  }

  try {
    return dayjs
      .tz(`${bookingDate} ${bookingTime}`, 'YYYY-MM-DD HH:mm', bookingTimezone)
      .utc()
  } catch {
    return dayjs.utc(`${bookingDate} ${bookingTime}`, 'YYYY-MM-DD HH:mm')
  }
}

export const resolveBookingEndUtc = (booking: any): dayjs.Dayjs | null => {
  if (booking.endAt) {
    return dayjs.utc(booking.endAt)
  }

  const startUtc = resolveBookingStartUtc(booking)
  if (!startUtc) {
    return null
  }

  return startUtc.add(booking.sessionDuration || 0, 'minute')
}

export const resolveBookingBufferEndUtc = (booking: any): dayjs.Dayjs | null => {
  if (booking.bufferEndAt) {
    return dayjs.utc(booking.bufferEndAt)
  }

  const endUtc = resolveBookingEndUtc(booking)
  if (!endUtc) {
    return null
  }

  return endUtc.add(booking.bufferTime || 0, 'minute')
}

export const getBookingSessionInfoForJob = (booking: any): string => {
  const bookingTimezone = booking.timezone || 'UTC'
  const displayDate = booking.localDate || booking.date || 'N/A'
  const startTime = booking.localStartTime || booking.startTime || 'N/A'
  const endTime = booking.localEndTime ? ` - ${booking.localEndTime}` : ''

  return `${displayDate} • ${startTime}${endTime} (${bookingTimezone})`
}

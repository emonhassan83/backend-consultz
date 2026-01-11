import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import { TBookingSlots } from './bookingSlots.interface'
import { BookingSlots } from './bookingSlots.model'
import { User } from '../user/user.model'
import dayjs from 'dayjs'
import { DAY_MAP, generateHourlySlots } from './bookingSlots.utils'

const insertIntoDB = async (
  payload: TBookingSlots,
  query: { year?: string; month?: string },
) => {
  const { author } = payload
  const year = Number(query.year)
  const month = Number(query.month) // 1–12

  if (!year || !month) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Year and month are required')
  }

  /* ============================
     1. Validate Expert
  ============================ */
  const user = await User.findById(author)
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Expert not found!')
  }

  if (!user.availability?.length) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Expert availability not set')
  }

  /* ============================
     2. Prevent Duplicate Creation
  ============================ */
  const monthPrefix = `${year}-${month.toString().padStart(2, '0')}`

  const exists = await BookingSlots.findOne({
    author,
    date: { $regex: `^${monthPrefix}` },
  })

  if (exists) {
    return {
      message: 'Booking slots already exist for this month',
    }
  }

  /* ============================
     3. Generate Slots
  ============================ */
  const daysInMonth = dayjs(`${year}-${month}-01`).daysInMonth()
  const slotsToInsert: any[] = []

  for (let d = 1; d <= daysInMonth; d++) {
    const date = dayjs(`${year}-${month}-${d}`)
    const weekDay = date.day() // 0–6

    user.availability.forEach((a) => {
      if (DAY_MAP[a.day] === weekDay) {
        const hourlySlots = generateHourlySlots(a.from, a.to)

        hourlySlots.forEach((time) => {
          slotsToInsert.push({
            author,
            date: date.format('YYYY-MM-DD'),
            time,
            isBooked: false,
          })
        })
      }
    })
  }

  if (!slotsToInsert.length) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'No slots generated from availability',
    )
  }

  /* ============================
     4. Insert Slots
  ============================ */
  const result = await BookingSlots.insertMany(slotsToInsert, {
    ordered: false,
  })

  return result
}

const getAllIntoFromDB = async (query: Record<string, unknown>) => {
  const { year, month, author } = query as {
    year?: string
    month?: string
    author?: string
  }

  if (!year || !month) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Year and month are required')
  }

  if (!author) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Author is required')
  }

  const monthPrefix = `${year}-${month.padStart(2, '0')}`

  const result = await BookingSlots.find({
    author,
    date: { $regex: `^${monthPrefix}` },
  }).sort({ date: 1, time: 1 })

  return result
}

const getAIntoFromDB = async (id: string) => {
  const slot = await BookingSlots.findById(id)
  if (!slot) {
    throw new AppError(httpStatus.NOT_FOUND, 'Session slots not found')
  }

  return slot
}

export const BookingSlotsService = {
  insertIntoDB,
  getAllIntoFromDB,
  getAIntoFromDB,
}

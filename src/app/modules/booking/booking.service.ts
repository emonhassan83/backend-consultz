import mongoose from 'mongoose'
import httpStatus from 'http-status'
import { TBookings } from './booking.interface'
import moment from 'moment'
import { BOOKING_STATUS, TBookingStatus } from './booking.constants'
import AppError from '../../errors/AppError'
import { Booking } from './booking.models'
import { User } from '../user/user.model'
import {
  sendBookingsNotification,
} from './booking.utils'
import QueryBuilder from '../../builder/QueryBuilder'

const createBookings = async (payload: TBookings, userId: string) => {
  const sessionClient = await mongoose.startSession()
  sessionClient.startTransaction()

  try {
    const { consult: consultId } = payload

    // Find the user
    const userData = await User.findById(userId).session(sessionClient)
    if (!userData || userData.isDeleted) {
      throw new AppError(httpStatus.BAD_REQUEST, 'User not found!')
    }

    // Find the session
    const consult = await User.findById(consultId).session(sessionClient)
    if (!consult || consult.isDeleted) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Consult not found!')
    }

    //assign payload values
    payload.user = userData._id
    payload.status = BOOKING_STATUS.pending

    // Create the booking
    const result = await Booking.create([payload], { session: sessionClient })
    if (!result || result.length === 0) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to create booking')
    }

    // Commit the transaction if everything succeeds
    await sessionClient.commitTransaction()
    sessionClient.endSession()

    return result[0]
  } catch (error) {
    await sessionClient.abortTransaction()
    sessionClient.endSession()
    throw error
  }
}

const getAllBookings = async (query: Record<string, any>) => {
  const bookingModel = new QueryBuilder(
    Booking.find().populate([
      { path: 'user', select: 'firstName lastName photoUrl email' },
      { path: 'consult', select: 'firstName lastName photoUrl email' }
    ]),
    query,
  )
    .search([''])
    .filter()
    .paginate()
    .sort()

  const data: any = await bookingModel?.modelQuery
  const meta = await bookingModel?.countTotal()

  return { data, meta }
}

const getBookingsById = async (id: string) => {
  const result = await Booking.findById(id).populate([
    { path: 'user', select: 'firstName lastName photoUrl email' },
    { path: 'consult', select: 'firstName lastName photoUrl email' }
  ])

  if (!result || result?.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Bookings not found!')
  }

  return result
}

const changeBookingStatus = async (
  id: string,
  status: TBookingStatus,
) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const booking = await Booking.findById(id).session(session)

    if (!booking || booking.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Booking not found!')
    }

    // ✅ User can ONLY cancel when status is pending
    if (booking.status !== BOOKING_STATUS.pending) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Only pending bookings can be cancelled',
      )
    }

    if (status !== BOOKING_STATUS.cancelled) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Invalid status change request',
      )
    }

    // Update status
    booking.status = BOOKING_STATUS.cancelled
    await booking.save({ session })

    // Fetch both parties
    const [user, consultant] = await Promise.all([
      User.findById(booking.user).session(session),
      User.findById(booking.consult).session(session),
    ])

    if (!user || user.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
    }

    if (!consultant || consultant.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Consultant not found!')
    }

    // 🔔 Notify both user & consultant
    await Promise.all([
      sendBookingsNotification('cancellation', booking, user),
      sendBookingsNotification('cancellation', booking, consultant),
    ])

    await session.commitTransaction()
    session.endSession()

    return booking
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    throw error
  }
}

const rescheduleBooking = async (
  id: string,
  payload: {
    sessionDate: string
    sessionTime: string
    timezone?: string
  },
) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const booking = await Booking.findById(id).session(session)

    if (!booking || booking.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Booking not found!')
    }

    if (booking.status !== BOOKING_STATUS.confirmed) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Only confirmed bookings can be rescheduled',
      )
    }

    booking.sessionDate = payload.sessionDate
    booking.sessionTime = payload.sessionTime

    if (payload.timezone) {
      booking.timezone = payload.timezone
    }

    await booking.save({ session })

    const user = await User.findById(booking.user).session(session)
    if (!user || user.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
    }

    // Notify user after reschedule
    await sendBookingsNotification('reschedule', booking, user)

    await session.commitTransaction()
    session.endSession()

    return booking
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    throw error
  }
}

const deleteBookings = async (id: string) => {
  const booking = await Booking.findById(id)
  if (!booking || booking.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Booking not found!')
  }

  const result = await Booking.findByIdAndUpdate(
    id,
    { isDeleted: true },
    { new: true },
  )

  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Failed to delete bookings')
  }

  return result
}

export const bookingsService = {
  createBookings,
  getAllBookings,
  getBookingsById,
  deleteBookings,
  changeBookingStatus,
  rescheduleBooking,
}

import dayjs from 'dayjs'
import mongoose, { ClientSession } from 'mongoose'
import httpStatus from 'http-status'
import { TBookings } from './booking.interface'
import { BOOKING_STATUS, PAYMENT_STATUS } from './booking.constants'
import AppError from '../../errors/AppError'
import { Booking } from './booking.models'
import { User } from '../user/user.model'
import { sendBookingsNotification } from './booking.utils'
import QueryBuilder from '../../builder/QueryBuilder'
import { BookingSlots } from '../bookingSlots/bookingSlots.model'
import { Payment } from '../payment/payment.model'
import Stripe from 'stripe'
import config from '../../config'

const stripe = new Stripe(config.stripe?.stripe_api_secret as string, {
  apiVersion: '2025-02-24.acacia',
  typescript: true,
})

const createBookings = async (payload: TBookings, userId: string) => {
  const sessionClient = await mongoose.startSession()
  sessionClient.startTransaction()

  try {
    const { consult: consultId, slot: slotId } = payload

    // user checked
    const userData = await User.findById(userId).session(sessionClient)
    if (!userData || userData.isDeleted) {
      throw new AppError(httpStatus.BAD_REQUEST, 'User not found!')
    }

    // consult checked
    const consult = await User.findById(consultId).session(sessionClient)
    if (!consult || consult.isDeleted) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Consult not found!')
    }

    // check slot
    const slotTime = await BookingSlots.findOne({
      _id: slotId,
      author: consultId,
    }).session(sessionClient)
    if (!slotTime) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Slot not found!')
    }

    if (slotTime.isBooked) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Slot already booked!')
    }

    // date time validation
    const slotDateTimeStr = `${slotTime.date} ${slotTime.time}` // e.g., "2025-02-10 14:00"
    const slotDateTime = dayjs(slotDateTimeStr, 'YYYY-MM-DD HH:mm')

    if (!slotDateTime.isValid()) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Invalid slot date/time format',
      )
    }

    const now = dayjs()
    const minBufferMinutes = 60 // checked booking slots buffer time

    if (slotDateTime.isBefore(now.add(minBufferMinutes, 'minute'))) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Booking must be made at least ${minBufferMinutes} minutes in advance. Slot time: ${slotDateTime.format('YYYY-MM-DD HH:mm')}`,
      )
    }

    // logic assign
    payload.user = new mongoose.Types.ObjectId(userData._id)
    payload.slot = new mongoose.Types.ObjectId(slotTime._id)
    payload.timezone = consult.timeZone || 'UTC'
    payload.status = BOOKING_STATUS.pending

    const result = await Booking.create([payload], { session: sessionClient })
    if (!result || result.length === 0) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to create booking')
    }

    await sessionClient.commitTransaction()
    return result[0]
  } catch (error) {
    await sessionClient.abortTransaction()
    throw error
  } finally {
    sessionClient.endSession()
  }
}

const getAllBookings = async (query: Record<string, any>) => {
  const bookingModel = new QueryBuilder(
    Booking.find({
      isDeleted: false,
      status: { $ne: BOOKING_STATUS.pending || BOOKING_STATUS.cancelled },
    }).populate([
      { path: 'user', select: 'firstName lastName photoUrl email' },
      { path: 'consult', select: 'firstName lastName photoUrl email' },
      { path: 'slot', select: 'date time' },
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
  const result = await Booking.findOne({
    _id: id,
    status: { $ne: BOOKING_STATUS.pending || BOOKING_STATUS.cancelled },
    isDeleted: false,
  }).populate([
    { path: 'user', select: 'firstName lastName photoUrl email' },
    { path: 'consult', select: 'firstName lastName photoUrl email' },
    { path: 'slot', select: 'date time' },
  ])
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Bookings not found!')
  }

  return result
}

const cancelBooking = async (bookingId: string, currentUserId: string) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // Find booking
    const booking = await Booking.findOne({
      _id: bookingId,
      isDeleted: false,
      $or: [{ user: currentUserId }, { consult: currentUserId }],
    }).session(session)
    if (!booking) {
      throw new AppError(httpStatus.NOT_FOUND, 'Booking not found or not yours')
    }

    // Single Combined Message with Clear Explanation
    const canCancel =
      booking.paymentStatus === PAYMENT_STATUS.paid &&
      booking.status !== BOOKING_STATUS.completed &&
      booking.status !== BOOKING_STATUS.cancelled

    if (!canCancel) {
      let reason = ''

      if (booking.paymentStatus !== PAYMENT_STATUS.paid) {
        reason = 'The booking has not been paid yet.'
      } else if (booking.status === BOOKING_STATUS.completed) {
        reason = 'The booking has already been completed.'
      } else if (booking.status === BOOKING_STATUS.cancelled) {
        reason = 'The booking has already been cancelled.'
      }
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Cancellation is not allowed. ${reason}`,
      )
    }

    // Time checked
    const slot = await BookingSlots.findById(booking.slot).session(session)
    if (!slot) {
      throw new AppError(httpStatus.NOT_FOUND, 'Slot not found')
    }

    const slotDateTimeStr = `${slot.date} ${slot.time}`
    const slotDateTime = dayjs(slotDateTimeStr, 'YYYY-MM-DD HH:mm')

    if (!slotDateTime.isValid()) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid slot date/time')
    }

    const now = dayjs()
    const hoursLeft = slotDateTime.diff(now, 'hour')

    if (hoursLeft < 12) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Cancellation not allowed within 12 hours of the scheduled time',
      )
    }

    // Free the slots
    slot.isBooked = false
    await slot.save({ session })

    // Booking status canceled
    booking.status = BOOKING_STATUS.cancelled
    await booking.save({ session })

    // Refund process
    let refundProcessed = false
    let refundAmount = 0
    if (booking.paymentStatus == PAYMENT_STATUS.paid) {
      const payment = await Payment.findOne({
        booking: booking._id,
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
          // If you want to sent notify admin
        }
      }
    }

    // user and consult sent notify
    const [user, consultant] = await Promise.all([
      User.findById(booking.user).session(session),
      User.findById(booking.consult).session(session),
    ])

    if (user) {
      await sendBookingsNotification('cancellation', booking, user, slot)
    }
    if (consultant) {
      await sendBookingsNotification('cancellation', booking, consultant, slot)
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
    // Find booking
    const booking = await Booking.findOne({
      _id: bookingId,
      consult: currentUserId,
      isDeleted: false,
    })
      .populate('user consult slot')
      .session(session)
    if (!booking) {
      throw new AppError(httpStatus.NOT_FOUND, 'Booking not found or not yours')
    }

    // check if it valid or not for confirmed
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

    // Booking status confirmed
    const result = await Booking.findByIdAndUpdate(
      bookingId,
      { status: BOOKING_STATUS.confirmed },
      { new: true },
    ).populate('consult slot user')
    if (!result) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to confirmed bookings')
    }

    // sent confirmation notify to user
    await sendBookingsNotification(
      'confirmed',
      result,
      result.user,
      result.slot,
    )

    await session.commitTransaction()
    return result
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

  const session: ClientSession = await mongoose.startSession()
  session.startTransaction()

  try {
    // 1. Find the booking and ensure it belongs to the current user
    const booking = await Booking.findOne({
      _id: bookingId,
      isDeleted: false,
      $or: [{ user: currentUserId }, { consult: currentUserId }],
    }).session(session)
    if (!booking) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        'Booking not found or does not belong to you.',
      )
    }

    // 2. Strict validation: only confirmed & paid bookings can be completed
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
        'Only confirmed bookings can be marked as completed. Current status: ' +
          booking.status,
      )
    }
    if (booking.paymentStatus !== PAYMENT_STATUS.paid) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'This booking has not been paid yet and cannot be marked as completed.',
      )
    }

    // 3. Mark booking as completed + save record details
    const updatedBooking = await Booking.findByIdAndUpdate(
      bookingId,
      {
        $set: {
          status: BOOKING_STATUS.completed,
          recordDuration,
          recordFile,
        },
      },
      { new: true, session },
    )
    if (!updatedBooking) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to mark booking as completed.',
      )
    }

    // 4. Commit transaction
    await session.commitTransaction()
    session.endSession()

    return updatedBooking
  } catch (error: any) {
    await session.abortTransaction()
    session.endSession()
    throw error instanceof AppError
      ? error
      : new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          error.message || 'Failed to complete booking',
        )
  }
}

const rescheduleBooking = async (
  id: string,
  payload: {
    slot: string
  },
  currentUserId: string, // added for ownership check (recommended)
) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // 1. Find the booking
    const booking = await Booking.findById(id).session(session)
    if (!booking || booking.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
    }

    // 2. Verify ownership (security)
    if (booking.user.toString() !== currentUserId) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'You are not authorized to reschedule this booking',
      )
    }

    // 3. Only confirmed bookings can be rescheduled
    if (booking.status !== BOOKING_STATUS.confirmed) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Only confirmed bookings can be rescheduled',
      )
    }

    // 4. Find the new slot
    const newSlot = await BookingSlots.findById(payload.slot).session(session)
    if (!newSlot) {
      throw new AppError(httpStatus.BAD_REQUEST, 'New slot not found')
    }

    // 5. New slot must not be already booked
    if (newSlot.isBooked) {
      throw new AppError(httpStatus.BAD_REQUEST, 'New slot is already booked')
    }

    // 6. Validate new slot date & time (must be in future + buffer)
    const slotDateTimeStr = `${newSlot.date} ${newSlot.time}` // e.g. "2025-02-10 14:00"
    const slotDateTime = dayjs(slotDateTimeStr, 'YYYY-MM-DD HH:mm')

    if (!slotDateTime.isValid()) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Invalid slot date/time format',
      )
    }

    const now = dayjs()
    const minBufferMinutes = 60 // Minimum advance time required (adjustable)

    if (slotDateTime.isBefore(now.add(minBufferMinutes, 'minute'))) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `New slot must be at least ${minBufferMinutes} minutes in the future. Slot time: ${slotDateTime.format('YYYY-MM-DD HH:mm')}`,
      )
    }

    // 7. Free up the old slot
    const oldSlot = await BookingSlots.findById(booking.slot).session(session)
    if (oldSlot) {
      oldSlot.isBooked = false
      await oldSlot.save({ session })
    }

    // 8. Assign new slot to booking
    booking.slot = new mongoose.Types.ObjectId(newSlot._id)
    await booking.save({ session })

    // 9. Mark new slot as booked
    newSlot.isBooked = true
    await newSlot.save({ session })

    // 10. Fetch user (for notification)
    const user = await User.findById(booking.user).session(session)
    if (!user || user.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found')
    }

    // 11. Send notification (reschedule)
    await sendBookingsNotification('reschedule', booking, user, newSlot)

    await session.commitTransaction()
    return booking
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
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
  cancelBooking,
  confirmedBooking,
  completedBooking,
  rescheduleBooking,
}

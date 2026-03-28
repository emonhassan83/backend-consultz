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
import { sendBookingsNotification } from './booking.utils'
import QueryBuilder from '../../builder/QueryBuilder'
import { BookingSlots } from '../bookingSlots/bookingSlots.model'
import { Payment } from '../payment/payment.model'
import Stripe from 'stripe'
import config from '../../config'
import {
  sendCancellationEmail,
  sendRescheduleEmail,
  sendSessionCompletedToConsultant,
} from '../../utils/emailNotify'
import { sendNotification } from '../../utils/sentNotification'
import isoWeek from 'dayjs/plugin/isoWeek'
dayjs.extend(isoWeek)
dayjs.extend(customParseFormat)
dayjs.extend(utc)
dayjs.extend(timezone)

const stripe = new Stripe(config.stripe?.stripe_api_secret as string, {
  apiVersion: '2025-02-24.acacia',
  typescript: true,
})

const createBookings = async (payload: TBookings, userId: string) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const { consult: consultId, slot: slotId } = payload

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

    // 3. Slot validation
    const slotTime = await BookingSlots.findOne({
      _id: slotId,
      author: consultId,
    }).session(session)
    if (!slotTime) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Slot not found!')
    }
    if (slotTime.isBooked) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Slot already booked!')
    }

    // 🔥 NEW CHECK: Prevent same user from booking the same slot again if it's still booked
    const unpaidBooking = await Booking.findOne({
      user: userId,
      consult: consult?._id,
      slot: slotId,
      isDeleted: false,
      paymentStatus: PAYMENT_STATUS.unpaid,
    }).session(session)
    if (unpaidBooking) {
      return unpaidBooking
    }

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
    const minBufferMinutes = 60

    if (slotDateTime.isBefore(now.add(minBufferMinutes, 'minute'))) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Booking must be made at least ${minBufferMinutes} minutes in advance. Slot time: ${slotDateTime.format('YYYY-MM-DD HH:mm')}`,
      )
    }

    // 5. Assign payload values
    payload.user = new mongoose.Types.ObjectId(userData._id)
    payload.slot = new mongoose.Types.ObjectId(slotTime._id)
    payload.timezone = consult.timeZone || 'UTC'
    payload.status = BOOKING_STATUS.pending

    // Calculate DM close time
    const sessionDurationMinutes = payload.sessionDuration || 60
    const dmCloseTime = slotDateTime
      .add(sessionDurationMinutes, 'minute')
      .add(6, 'hour')
      .toDate()

    payload.dmCloseTime = dmCloseTime

    // 6. Check if this is the user's VERY FIRST booking
    const previousBookingsCount = await Booking.countDocuments(
      {
        user: userId,
        isDeleted: false,
      },
      { session },
    )

    const isFirstBooking = previousBookingsCount === 0

    // 7. Create the booking
    const [createdBooking] = await Booking.create([payload], { session })
    if (!createdBooking) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to create booking')
    }

    // 8. Award 300 points ONLY if this is the first booking ever
    if (isFirstBooking) {
      const pointsToAdd = 300
      userData.points = (userData.points || 0) + pointsToAdd

      // Update user's points
      await User.findByIdAndUpdate(
        userId,
        { points: userData.points },
        { session },
      )

      // Send push notification (if enabled)
      if (userData.fcmToken && userData.pushNotify?.points) {
        await sendNotification([userData.fcmToken], {
          message: 'First Consultation Booked!',
          description:
            'Congratulations! You have earned 300 points for booking your first consultation. 🎉 Keep exploring!',
        })
      }
    }

    await session.commitTransaction()

    return createdBooking
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

const getAllBookings = async (query: Record<string, any>) => {
  const bookingModel = new QueryBuilder(
    // @ts-ignore
    Booking.find({
      isDeleted: false,
      paymentStatus: { $ne: PAYMENT_STATUS.unpaid },
    })
      .populate([
        { path: 'user', select: 'firstName lastName photoUrl' },
        { path: 'consult', select: 'firstName lastName photoUrl' },
        { path: 'slot', select: 'date time' },
      ])
      .select(
        'user consult slot sessionType sessionDuration price timezone status createdAt',
      ),
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

const getAllBookingsByDate = async (query: Record<string, any>) => {
  const { filterType, date, ...restQuery } = query

  let targetDates: string[] = []
  const today = dayjs()

  // date দেওয়া থাকলে সবসময় single date filter
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
    // ✅ yesterday → tomorrow
    targetDates = [today.add(1, 'day').format('YYYY-MM-DD')]
  } else if (filterType === 'day') {
    // ✅ today + tomorrow দুটো দেখাবে
    targetDates = [
      today.format('YYYY-MM-DD'),
      today.add(1, 'day').format('YYYY-MM-DD'),
    ]
  } else if (filterType === 'week') {
    // ✅ Monday থেকে week শুরু (isoWeek = Monday start)
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
    // ✅ default → today
    targetDates = [today.format('YYYY-MM-DD')]
  }

  // Slot ids বের করো
  const matchingSlots = await BookingSlots.find({
    date: { $in: targetDates },
  }).select('_id')

  const slotIds = matchingSlots.map((s) => s._id)

  // Slot না থাকলে early return
  if (slotIds.length === 0) {
    if (targetDates.length === 1) {
      return {
        data: {
          date: dayjs(targetDates[0]).format('DD-MM-YYYY'),
          bookingList: [],
        },
      }
    }
    return {
      data: targetDates.map((d) => ({
        date: dayjs(d).format('DD-MM-YYYY'),
        bookingList: [],
      })),
    }
  }

  // Booking fetch করো
  const bookings: any[] = await Booking.find({
    isDeleted: false,
    paymentStatus: { $ne: PAYMENT_STATUS.unpaid },
    slot: { $in: slotIds },
  })
    .populate([
      { path: 'user', select: 'firstName lastName photoUrl' },
      { path: 'consult', select: 'firstName lastName photoUrl' },
      { path: 'slot', select: 'date time' },
    ])
    .select(
      'user consult slot sessionType sessionDuration price timezone status createdAt',
    )
    .sort({ createdAt: -1 })

  // Single date → simple response
  if (targetDates.length === 1) {
    return {
      data: {
        date: dayjs(targetDates[0]).format('DD-MM-YYYY'),
        bookingList: bookings,
      },
    }
  }

  // Multiple dates → grouped response
  const groupedByDate: Record<string, any[]> = {}
  for (const d of targetDates) {
    groupedByDate[d] = []
  }

  for (const booking of bookings) {
    const slotDate = booking?.slot?.date
    if (slotDate && groupedByDate[slotDate] !== undefined) {
      groupedByDate[slotDate].push(booking)
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

const getBookingsById = async (id: string) => {
  const result = await Booking.findOne({
    _id: id,
    paymentStatus: { $ne: PAYMENT_STATUS.unpaid },
    isDeleted: false,
  }).populate([
    { path: 'user', select: 'firstName lastName photoUrl' },
    { path: 'consult', select: 'firstName lastName photoUrl' },
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
    })
      .populate('slot user consult')
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
    await BookingSlots.findByIdAndUpdate(
      booking.slot,
      { isBooked: false },
      { session },
    )

    // Booking status canceled
    const cancelledBooking = await Booking.findByIdAndUpdate(
      bookingId,
      { status: BOOKING_STATUS.cancelled },
      { new: true, session },
    )
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
    const [booker, expert] = await Promise.all([
      User.findById(booking.user).session(session),
      User.findById(booking.consult).session(session),
    ])

    const cancelledBy =
      currentUserId === booking.user.toString() ? 'booker' : 'consult'
    if (booker && booker?.fcmToken && booker.pushNotify?.bookingAndSchedule) {
      await sendBookingsNotification(
        'cancellation',
        cancelledBooking,
        booker,
        slot,
        { cancelledBy },
      )
    }
    if (expert && expert?.fcmToken && expert.pushNotify?.bookingAndSchedule) {
      await sendBookingsNotification(
        'cancellation',
        cancelledBooking,
        expert,
        slot,
        { cancelledBy },
      )
    }

    // Email notify to user and consult
    const cancelledByEmail =
      currentUserId === booking.user.toString() ? 'user' : 'consult'
    if (booker && expert) {
      await sendCancellationEmail(
        booker,
        expert,
        cancelledBooking,
        slot,
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
      .populate('user consult slot')
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
      { new: true, session },
    ).populate('slot user')

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
          message: 'Booking Confirmed!',
          description: `You have earned 50 points for booking a consultation. Keep booking more! 🎉`,
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
          message: 'Repeat Booking Bonus!',
          description: `You have earned 150 points for re-booking the same expert within 30 days!`,
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
          message: 'Booking Streak Bonus!',
          description: `Congratulations! You have earned 300 bonus points for booking 3 sessions within 30 days!`,
        })
      }
    }

    // 7. Send confirmation notification to user (existing logic)
    if (user && user.fcmToken && user.pushNotify?.bookingAndSchedule) {
      await sendBookingsNotification(
        'confirmed',
        updatedBooking,
        user,
        updatedBooking.slot,
      )
    }

    await session.commitTransaction()

    return updatedBooking
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}

const declineBooking = async (bookingId: string, currentUserId: string) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // 1. Find the booking (only the consultant is allowed to decline)
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

    // 3. Free the slot
    await BookingSlots.findByIdAndUpdate(
      booking.slot,
      { isBooked: false },
      { session },
    )

    // 4. Mark booking as declined
    const updatedBooking = await Booking.findByIdAndUpdate(
      bookingId,
      { status: BOOKING_STATUS.declined },
      { new: true, session },
    )

    if (!updatedBooking) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to decline booking')
    }

    // 5. Refund process
    let refundProcessed = false
    let refundAmount = 0

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
    const [booker, expert, slot] = await Promise.all([
      User.findById(booking.user).session(session),
      User.findById(booking.consult).session(session),
      BookingSlots.findById(booking.slot).session(session),
    ])

    // 7. Push notification to booker
    if (booker && booker.fcmToken && booker.pushNotify?.bookingAndSchedule) {
      await sendBookingsNotification('declined', updatedBooking, booker, slot, {
        cancelledBy: 'consult',
      })
    }

    // 8. Push notification to expert (optional — self declined)
    if (expert && expert.fcmToken && expert.pushNotify?.bookingAndSchedule) {
      await sendBookingsNotification('declined', updatedBooking, expert, slot, {
        cancelledBy: 'consult',
      })
    }

    // 9. Email notification
    if (booker && expert && slot) {
      await sendCancellationEmail(
        booker,
        expert,
        updatedBooking,
        slot,
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
    // 1. Find booking (either user or consult can complete)
    const booking = await Booking.findOne({
      _id: bookingId,
      isDeleted: false,
      $or: [{ user: currentUserId }, { consult: currentUserId }],
    })
      .populate('user consult slot')
      .session(session)

    if (!booking) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        'Booking not found or does not belong to you.',
      )
    }

    // 2. Strict validation
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

    // 4. Award 100 points to the USER (booker) for attending/completing the session (existing)
    const booker = await User.findById(updatedBooking.user).session(session)
    if (booker) {
      const pointsToAdd = 100
      booker.points = (booker.points || 0) + pointsToAdd

      await User.findByIdAndUpdate(
        booker._id,
        { points: booker.points },
        { session },
      )

      // Send push notification to booker (if enabled)
      if (booker.fcmToken && booker.pushNotify?.points) {
        await sendNotification([booker.fcmToken], {
          message: 'Session Completed!',
          description: `You have earned 100 points for attending and completing your consultation. Great job! 🎉`,
        })
      }
    }

    // 5. Award points to the CONSULTANT (expert)
    const consultant = await User.findById(updatedBooking.consult).session(
      session,
    )
    if (consultant) {
      // Reward #1: 100 points per completed session (always)
      const basePoints = 100
      consultant.points = (consultant.points || 0) + basePoints

      // Reward #2: 300 bonus points if 5+ completed sessions in last 7 days
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const completedInLastWeek = await Booking.countDocuments({
        consult: consultant._id,
        status: BOOKING_STATUS.completed,
        updatedAt: { $gte: sevenDaysAgo }, // use updatedAt since completion time
        isDeleted: false,
      }).session(session)

      let bonusPoints = 0
      if (completedInLastWeek >= 5) {
        bonusPoints = 300
        consultant.points += bonusPoints

        // Send bonus notification
        if (consultant.fcmToken && consultant.pushNotify?.points) {
          await sendNotification([consultant.fcmToken], {
            message: 'Weekly Performance Bonus!',
            description: `Congratulations! You completed 5+ sessions this week and earned 300 bonus points! Keep it up! 🎉`,
          })
        }
      }

      await User.findByIdAndUpdate(
        consultant._id,
        { points: consultant.points },
        { session },
      )

      // Send base completion notification to consultant
      if (consultant.fcmToken && consultant.pushNotify?.payment) {
        await sendBookingsNotification(
          'completed',
          updatedBooking,
          consultant,
          updatedBooking.slot,
        )
      }

      // Send completed email to consultant (if enabled)
      if (consultant.emailNotify?.booking) {
        await sendSessionCompletedToConsultant(
          consultant,
          updatedBooking,
          updatedBooking.slot,
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

    // 10. user and consult sent notify
    const [user, consultant] = await Promise.all([
      User.findById(booking.user).session(session),
      User.findById(booking.consult).session(session),
    ])

    // 11. Send notification (reschedule)
    if (user && user?.fcmToken && user.pushNotify?.bookingAndSchedule)
      await sendBookingsNotification('reschedule', booking, user, newSlot)
    if (
      consultant &&
      consultant?.fcmToken &&
      consultant.pushNotify?.bookingAndSchedule
    )
      await sendBookingsNotification('reschedule', booking, consultant, newSlot)

    // sent reschedule email
    if (user && consultant) {
      await sendRescheduleEmail(user, consultant, booking, newSlot)
    }

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
  getAllBookingsByDate,
  getBookingsById,
  deleteBookings,
  cancelBooking,
  confirmedBooking,
  declineBooking,
  completedBooking,
  rescheduleBooking,
}

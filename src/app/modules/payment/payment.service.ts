import Stripe from 'stripe'
import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import QueryBuilder from '../../builder/QueryBuilder'
import { Payment } from './payment.model'
import { paymentNotifyToAdmin, paymentNotifyToUser } from './payment.utils'
import config from '../../config'
import { Booking } from '../booking/booking.models'
import mongoose from 'mongoose'
import { PAYMENT_STATUS } from './payment.constant'
import { BOOKING_STATUS } from '../booking/booking.constants'
import { User } from '../user/user.model'
import { BookingSlots } from '../bookingSlots/bookingSlots.model'
import { IConfirmPayment, IPaymentIntent } from './payment.interface'
import { sendBookingsNotification } from '../booking/booking.utils'

const stripe = new Stripe(config.stripe?.stripe_api_secret as string, {
  apiVersion: '2025-02-24.acacia',
  typescript: true,
})

const createPaymentIntent = async (payload: IPaymentIntent) => {
  const { booking: bookingId, account: userId } = payload

  // Check booking
  const booking = await Booking.findById(bookingId)
  if (!booking || booking.isDeleted || booking.user.toString() !== userId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid booking')
  }

  // user checked
  const user = await User.findById(userId)
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }

  // Create payment Intent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: booking.price * 100,
    currency: 'usd',
    payment_method_types: ['card'],
    metadata: {
      bookingId: bookingId.toString(),
      userId: userId.toString(),
    },
    description: `Booking payment for ${booking._id}`,
  })

  // Payment record create
  await Payment.findOneAndUpdate(
    { booking: bookingId, isPaid: false },
    {
      user: userId,
      amount: booking.price,
      paymentIntentId: paymentIntent.id,
      status: PAYMENT_STATUS.unpaid,
    },
    { upsert: true, new: true },
  )

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  }
}

const confirmPayment = async (payload: IConfirmPayment) => {
  const { paymentIntentId, booking: bookingId, user: userId } = payload

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

  if (paymentIntent.status !== 'succeeded') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Payment not succeeded')
  }

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // Payment record update
    const payment = await Payment.findOneAndUpdate(
      { paymentIntentId, isPaid: false },
      {
        isPaid: true,
        status: PAYMENT_STATUS.paid,
      },
      { new: true, session },
    )

    if (!payment) {
      throw new AppError(httpStatus.NOT_FOUND, 'Payment record not found')
    }

    // Booking confirm
    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      {
        paymentStatus: PAYMENT_STATUS.paid,
        // status: BOOKING_STATUS.confirmed,
      },
      { new: true, session },
    ).populate('slot')
    if (!booking) {
      throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
    }

    // slot booking
    await BookingSlots.findByIdAndUpdate(
      booking._id,
      { isBooked: true },
      { new: true },
    )

    // sent notify to consult
    const consult = await User.findById(booking.consult)
    if (
      consult &&
      consult?.fcmToken &&
      consult.pushNotify?.bookingAndSchedule
    ) {
      await sendBookingsNotification('pending', booking, consult, booking.slot)
    }
    
    // sent notify to admin
    await paymentNotifyToAdmin('SUCCESS', payment)
   
    await session.commitTransaction()
    return { payment, booking }
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}

const getAllPaymentsFromDB = async (query: Record<string, any>) => {
  const paymentModel = new QueryBuilder(
    Payment.find({ isDeleted: false, paymentStatus: PAYMENT_STATUS.paid }),
    query,
  )
    .search([''])
    .filter()
    .paginate()
    .sort()
    .fields()

  const data = await paymentModel.modelQuery
  const meta = await paymentModel.countTotal()

  return {
    data,
    meta,
  }
}

const getDashboardDataFromDB = async (query: Record<string, unknown>) => {}

const getAPaymentsFromDB = async (id: string) => {
  const payment = await Payment.findById(id).populate([
    { path: 'reference', select: 'user status paymentStatus' },
    { path: 'account', select: 'name email photoUrl contactNumber age' },
  ])
  if (!payment || payment?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Payment not found!')
  }

  return payment
}

const refundPayment = async (payload: any) => {
  if (!payload?.intendId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Payment intent ID is required')
  }

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const refundData: Stripe.RefundCreateParams = {
      payment_intent: payload.intendId,
      ...(payload.amount && {
        amount: payload.amount * 100,
        reason: 'requested_by_customer',
      }),
    }

    // Find and update payment status
    const payment = await Payment.findOneAndUpdate(
      { paymentIntentId: payload.intendId },
      { status: PAYMENT_STATUS.refunded, isPaid: false },
      { new: true, session },
    )
    if (!payment || payment?.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Payment record not found')
    }

    // Validate and update booking status
    const booking = await Booking.findById(payment.booking).session(session)
    if (!booking || booking?.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Booking record not found')
    }

    if (booking.status !== BOOKING_STATUS.cancelled) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Only cancelled bookings can be refunded. Please cancel the booking first.',
      )
    }

    await Booking.findByIdAndUpdate(
      payment.booking,
      { paymentStatus: PAYMENT_STATUS.refunded },
      { new: true, session },
    )

    // Process refund via Stripe
    const response = await stripe.refunds.create(refundData)

    // fatch user
    const user = await User.findById(payment.account)
    if (!user || user?.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
    }

    // Commit transaction
    await session.commitTransaction()
    session.endSession()

    // sent notify to user when payment is refund
    await paymentNotifyToUser('REFUND', payment, user)

    // sent notify to admin when payment is refund
    await paymentNotifyToAdmin('REFUND', payment)

    return response
  } catch (error: any) {
    await session.abortTransaction()
    session.endSession()
    console.error('Refund Error:', error)
    throw new AppError(
      httpStatus.BAD_REQUEST,
      error.message || 'Refund processing failed',
    )
  }
}

export const PaymentService = {
  createPaymentIntent,
  confirmPayment,
  getAllPaymentsFromDB,
  getDashboardDataFromDB,
  getAPaymentsFromDB,
  refundPayment,
}

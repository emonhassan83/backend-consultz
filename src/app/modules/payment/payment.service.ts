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
import { sendBookingsNotification } from '../booking/booking.utils'
import {
  sendNewBookingToConsultant,
  sendPaymentSuccessToUser,
} from '../../utils/emailNotify'
import { Contents } from '../contents/contents.models'
import { Chat } from '../chat/chat.models'
import { CHAT_STATUS } from '../chat/chat.constants'
import { TUser } from '../user/user.interface'

const stripe = new Stripe(config.stripe?.stripe_api_secret as string, {
  apiVersion: '2026-06-24.dahlia',
  typescript: true,
})

/* =====================================================
   🔹 CREATE PAYMENT INTENT (WITH CUSTOMER SUPPORT)
===================================================== */
const createPaymentIntent = async (payload: {
  booking: string
  account: string
}) => {
  const { booking: bookingId, account: userId } = payload

  /* ========= 1. Validate Booking ========= */
  const booking = await Booking.findById(bookingId)
  if (!booking || booking.isDeleted || booking.user.toString() !== userId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid booking')
  }

  /* ========= 2. Validate User ========= */
  const user = await User.findById(userId)
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }

  /* ========= 3. Create / Reuse Stripe Customer ========= */
  let stripeCustomerId = user.stripeCustomerId

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
    })

    stripeCustomerId = customer.id

    await User.findByIdAndUpdate(userId, {
      stripeCustomerId,
    })
  }

  const ephemeralKey = await stripe.ephemeralKeys.create(
    { customer: stripeCustomerId },
    { apiVersion: '2026-05-27.dahlia' },
  )

  /* ========= 4. Calculate Amount with VAT Breakdown ========= */
  const [platformFeeContent, consultant] = await Promise.all([
    Contents.findOne({ key: 'platformFeePercentage' }).lean(),
    User.findById(booking.consult).select('isVatRegistered vatRegistrationNumber vatPercentage'),
  ])

  const PLATFORM_VAT_RATE = 0.2
  const platformFeePercentage = platformFeeContent?.value || 0

  const isExpertVatRegistered = !!(
    consultant?.isVatRegistered && consultant?.vatRegistrationNumber
  )

  // Expert's VAT percentage from their profile (e.g., 5%)
  const expertVatPercentage = consultant?.vatPercentage || 0

  // What consultee pays
  const consultationFee = booking.price
  
  // Expert VAT calculated based on expert's VAT percentage
  const expertVat = isExpertVatRegistered
    ? parseFloat((consultationFee * (expertVatPercentage / 100)).toFixed(2))
    : 0
  
  const amount = parseFloat((consultationFee + expertVat).toFixed(2))

  // Platform breakdown
  const platformCommission = parseFloat(
    ((consultationFee * platformFeePercentage) / 100).toFixed(2),
  )
  const platformVat = parseFloat((platformCommission * PLATFORM_VAT_RATE).toFixed(2))
  const platformTotal = parseFloat((platformCommission + platformVat).toFixed(2))

  // Expert payout breakdown
  const consultAmount = parseFloat((amount - platformTotal).toFixed(2))
  const expertVatOwed = parseFloat((expertVat - platformVat).toFixed(2))
  const expertNet = parseFloat((consultAmount - expertVatOwed).toFixed(2))

  /* ========= 5. Create PaymentIntent ========= */
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency: 'gbp',
    customer: stripeCustomerId,
    payment_method_types: ['card'],
    metadata: {
      bookingId: bookingId.toString(),
      userId: userId.toString(),
    },
    description: `Booking payment for ${booking._id}`,
  })

  /* ========= 6. Save Payment ========= */
  await Payment.findOneAndUpdate(
    { booking: bookingId, isPaid: false },
    {
      account: userId,
      isExpertVatRegistered,
      consultationFee,
      consultantVat: expertVat,
      amount,
      platformCommission,
      platformVat,
      platformTotal,
      consultAmount,
      expertVatOwed,
      expertNet,
      paymentIntentId: paymentIntent.id,
      status: PAYMENT_STATUS.unpaid,
    },
    { upsert: true, returnDocument: 'after' },
  )

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    customerId: stripeCustomerId,
    ephemeralKey: ephemeralKey.secret,
  }
}

/* =====================================================
   🔹 CONFIRM PAYMENT (SECURE)
===================================================== */
const confirmPayment = async (payload: {
  paymentIntentId: string
  booking: string
  user: string
}) => {
  const { paymentIntentId, booking: bookingId, user: userId } = payload

  /* ========= 1. Verify from Stripe ========= */
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

  if (paymentIntent.status !== 'succeeded') {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Payment not successful on Stripe',
    )
  }

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    /* ========= 2. Update Payment ========= */
    const payment = await Payment.findOneAndUpdate(
      { paymentIntentId, isPaid: false },
      {
        isPaid: true,
        status: PAYMENT_STATUS.paid,
      },
      { returnDocument: 'after', session },
    )

    if (!payment) {
      throw new AppError(httpStatus.NOT_FOUND, 'Payment not found')
    }

    /* ========= 3. Update Booking ========= */
    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      {
        paymentStatus: PAYMENT_STATUS.paid,
        status: BOOKING_STATUS.pending,
      },
      { returnDocument: 'after', session },
    ).populate('slot')

    if (!booking) {
      throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
    }

    /* ========= 4. Mark Slot as Booked ========= */
    await BookingSlots.findByIdAndUpdate(
      booking.slot,
      { isBooked: true },
      { session },
    )

    /* ========= 5. Create Chat ========= */
    const existingChat = await Chat.findOne({
      booking: bookingId,
      participants: { $all: [booking.user, booking.consult] },
    }).session(session)

    if (!existingChat) {
      await Chat.create(
        [
          {
            booking: bookingId,
            participants: [booking.user, booking.consult],
            status: CHAT_STATUS.accepted,
          },
        ],
        { session },
      )
    }

    await session.commitTransaction()

    /* ========= 6. Notifications ========= */
    const [consult, user] = await Promise.all([
      User.findById(booking.consult).select('fcmToken emailNotify firstName lastName email'),
      User.findById(userId).select('emailNotify firstName lastName email')
    ])

    if (consult?.fcmToken) {
      await sendBookingsNotification('pending', booking, consult, booking.slot)
    }

    // sent expert to new booking request add
    if (consult?.emailNotify?.booking) {
      await sendNewBookingToConsultant(consult, booking, user as TUser)
    }

    // user got notification when they are paid
    if (user?.emailNotify?.payment) {
      await sendPaymentSuccessToUser(user, booking, consult as TUser)
    }

    return {
      payment,
      booking,
    }
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
    const refundData = {
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
      { returnDocument: 'after', session },
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
      { returnDocument: 'after', session },
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

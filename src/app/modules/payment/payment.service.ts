import Stripe from 'stripe'
import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import QueryBuilder from '../../builder/QueryBuilder'
import { TPayment } from './payment.interface'
import { Payment } from './payment.model'
import {
  createCheckoutSession,
  paymentNotifyToAdmin,
  paymentNotifyToUser,
} from './payment.utils'
import config from '../../config'
import { generateTransactionId } from '../../utils/generateTransctionId'
import { Booking } from '../booking/booking.models'
import mongoose, { startSession } from 'mongoose'
import { PAYMENT_STATUS } from './payment.constant'
import { BOOKING_STATUS } from '../booking/booking.constants'
import { User } from '../user/user.model'

const stripe = new Stripe(config.stripe?.stripe_api_secret as string, {
  apiVersion: '2025-02-24.acacia',
  typescript: true,
})

const checkout = async (payload: TPayment) => {
  const transactionId = generateTransactionId()
  const { account, booking: bookingId } = payload

  // here user management
  const user = await User.findById(account)
  if (!user || user?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }

  const booking = await Booking.findById(bookingId)
  if (!booking || booking?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking Not Found!')
  }

  // Check for existing unpaid payment
  let paymentData = await Payment.findOne({
    booking: bookingId,
    isPaid: false,
    account,
  })
  if (paymentData) {
    paymentData = await Payment.findByIdAndUpdate(
      paymentData._id,
      { transactionId },
      { new: true },
    )
  } else {
    payload.transactionId = transactionId
    payload.amount = booking.price
    paymentData = await Payment.create(payload)
  }

  if (!paymentData) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to create payment',
    )
  }

  const checkoutSession = await createCheckoutSession({
    // customerId: customer.id,
    product: {
      amount: paymentData?.amount,
      name: 'Booking Payment',
      quantity: 1,
    },

    paymentId: paymentData?._id,
  })

  return checkoutSession?.url
}

const confirmPayment = async (query: Record<string, any>) => {
  const { sessionId, paymentId } = query

  const session = await startSession()
  const PaymentSession = await stripe.checkout.sessions.retrieve(sessionId)
  const paymentIntentId = PaymentSession.payment_intent as string

  if (PaymentSession.status !== 'complete') {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Payment session is not completed',
    )
  }

  try {
    session.startTransaction()
    const payment = await Payment.findByIdAndUpdate(
      paymentId,
      {
        isPaid: true,
        status: PAYMENT_STATUS.paid,
        paymentIntentId: paymentIntentId,
      },
      { new: true, session },
    )
    if (!payment || payment?.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Payment Not Found!')
    }

    // Update booking payment status
    const order = await Booking.findOneAndUpdate(
      payment?.booking,
      {
        transactionId: payment?.transactionId,
        paymentStatus: PAYMENT_STATUS.paid,
        status: BOOKING_STATUS.confirmed,
      },
      { new: true, session },
    )
    if (!order || order?.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Order not found!')
    }

    // fatch user
    const user = await User.findById(payment.account)
    if (!user || user?.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
    }

    // sent notify to user when payment is success
    await paymentNotifyToUser('SUCCESS', payment, user)

    // sent notify to admin when payment is success
    await paymentNotifyToAdmin('SUCCESS', payment)

    await session.commitTransaction()
    return payment
  } catch (error: any) {
    await session.abortTransaction()
    if (paymentIntentId) {
      try {
        await stripe.refunds.create({
          payment_intent: paymentIntentId,
        })
      } catch (refundError: any) {
        console.error('Error processing refund:', refundError.message)
      }
    }
    throw new AppError(httpStatus.BAD_GATEWAY, error.message)
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
  checkout,
  confirmPayment,
  getAllPaymentsFromDB,
  getDashboardDataFromDB,
  getAPaymentsFromDB,
  refundPayment,
}

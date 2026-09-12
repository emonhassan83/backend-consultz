import Stripe from 'stripe'
import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import QueryBuilder from '../../builder/QueryBuilder'
import { Payment } from './payment.model'
import { paymentNotifyToAdmin, paymentNotifyToUser } from './payment.utils'
import config from '../../config'
import { Booking } from '../booking/booking.models'
import mongoose from 'mongoose'
import { PAYMENT_SETTLEMENT_STATUS, PAYMENT_STATUS } from './payment.constant'
import { BOOKING_STATUS } from '../booking/booking.constants'
import { User } from '../user/user.model'
import { sendBookingsNotification } from '../booking/booking.utils'
import {
  sendNewBookingToConsultant,
  sendPaymentSuccessToUser,
  sendPaymentRefundToUser,
} from '../../utils/emailNotify'
import { Chat } from '../chat/chat.models'
import { getVatRateForCountry } from '../../utils/vatRate'
import { CHAT_STATUS } from '../chat/chat.constants'
import { TUser } from '../user/user.interface'
import { sendNotification } from '../../utils/sentNotification'
import { modeType } from '../notification/notification.interface'
import { getGeneralSettingNumber } from '../contents/contents.utils'
import { PointsLogsService } from '../pointsLogs/pointsLogs.service'
import { POINTS_LOG_SOURCE, POINTS_LOG_TYPE } from '../pointsLogs/pointsLogs.constant'
import { Calling } from '../calling/calling.model'
import { RefundService } from '../refund/refund.service'

const stripe = new Stripe(config.stripe?.stripe_api_secret as string, {
  apiVersion: '2026-06-24.dahlia',
  typescript: true,
})

const formatRefunds = (refunds: any[] = []) =>
  refunds.map((refund) => ({
    amount: refund.amount,
    reason: refund.reason,
    refundedBy: refund.refundedBy,
    status: refund.status,
    stripeRefundId: refund.stripeRefundId,
    createdAt: refund.createdAt,
  }))

const getRefundSummary = (refunds: any[] = []) => {
  const formattedRefunds = formatRefunds(refunds)
  const refundedAmount = formattedRefunds
    .filter((refund: any) => refund.status === 'succeeded')
    .reduce((sum: number, refund: any) => sum + (refund.amount || 0), 0)

  return { refunds: formattedRefunds, refundedAmount }
}

const getAuthorizationExpiresAt = (paymentIntent: any): Date | null => {
  const captureBefore =
    paymentIntent?.latest_charge?.payment_method_details?.card?.capture_before

  return captureBefore ? new Date(captureBefore * 1000) : null
}

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
  const [platformFeePercentage, consultant] = await Promise.all([
    getGeneralSettingNumber('platformFeePercentage', 20),
    User.findById(booking.consult).select('country isVatRegistered vatRegistrationNumber'),
  ])

  const PLATFORM_VAT_RATE = 0.2

  const isExpertVatRegistered = !!(
    consultant?.isVatRegistered && consultant?.vatRegistrationNumber
  )

  // What consultee pays
  const consultationFee = booking.price
  
  // Expert's country-based VAT rate from jsonvat.com (live fetch)
  const expertVatRate = isExpertVatRegistered && consultant?.country
    ? await getVatRateForCountry(consultant.country)
    : null
  
  // Expert VAT calculated based on country's current VAT rate
  const expertVat = expertVatRate
    ? parseFloat((consultationFee * (expertVatRate / 100)).toFixed(2))
    : 0
  
  const amount = parseFloat((consultationFee + expertVat).toFixed(2))
  const grossBookingValue = amount

  // Platform breakdown
  const platformCommission = parseFloat(
    ((grossBookingValue * platformFeePercentage) / 100).toFixed(2),
  )
  const platformVat = parseFloat((platformCommission * PLATFORM_VAT_RATE).toFixed(2))
  const platformTotal = parseFloat((platformCommission + platformVat).toFixed(2))
  const platformTotalDeduction = platformTotal

  // Expert payout breakdown
  const consultAmount = parseFloat((amount - platformTotal).toFixed(2))
  const expertPayout = consultAmount
  const expertVatOwed = parseFloat((expertVat - platformVat).toFixed(2))
  const expertNet = parseFloat((consultAmount - expertVatOwed).toFixed(2))

  /* ========= 5. Create PaymentIntent ========= */
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency: 'gbp',
    customer: stripeCustomerId,
    payment_method_types: ['card'],
    capture_method: 'manual',
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
      grossBookingValue,
      consultationFee,
      consultantVat: expertVat,
      amount,
      platformFeePercentage,
      platformCommission,
      platformVat,
      platformTotal,
      platformTotalDeduction,
      consultAmount,
      expertPayout,
      expertVatOwed,
      expertNet,
      transactionId: paymentIntent.id,
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
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['latest_charge'],
  })

  const isAuthorizedPayment = paymentIntent.status === 'requires_capture'
  const isCapturedPayment = paymentIntent.status === 'succeeded'

  if (!isAuthorizedPayment && !isCapturedPayment) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Payment was not authorized on Stripe',
    )
  }

  const session = await mongoose.startSession()
  session.startTransaction()

  let confirmedPayment: any
  let confirmedBooking: any
  let shouldAwardFirstPaidBookingBonus = false

  try {
    /* ========= 2. Update Payment ========= */
    const payment = await Payment.findOneAndUpdate(
      { paymentIntentId, isPaid: false },
      isAuthorizedPayment
        ? {
            isPaid: false,
            status: PAYMENT_STATUS.authorized,
            settlementStatus: PAYMENT_SETTLEMENT_STATUS.authorization_held,
            transactionId:
              typeof paymentIntent.latest_charge === 'string'
                ? paymentIntent.latest_charge
                : paymentIntent.latest_charge?.id || paymentIntent.id,
            authorizedAt: new Date(),
            authorizationExpiresAt: getAuthorizationExpiresAt(paymentIntent),
          }
        : {
            isPaid: true,
            status: PAYMENT_STATUS.paid,
            settlementStatus: PAYMENT_SETTLEMENT_STATUS.pending_session,
            transactionId:
              typeof paymentIntent.latest_charge === 'string'
                ? paymentIntent.latest_charge
                : paymentIntent.latest_charge?.id || paymentIntent.id,
            capturedAt: new Date(),
          },
      { returnDocument: 'after', session },
    )

    if (!payment) {
      throw new AppError(httpStatus.NOT_FOUND, 'Payment not found')
    }

    const previousPaidBookingsCount = await Booking.countDocuments({
      user: userId,
      paymentStatus: PAYMENT_STATUS.paid,
      isDeleted: false,
      _id: { $ne: bookingId },
    }).session(session)

    shouldAwardFirstPaidBookingBonus = isCapturedPayment && previousPaidBookingsCount === 0

    /* ========= 3. Update Booking ========= */
    const booking = await Booking.findByIdAndUpdate(
      bookingId,
      {
        paymentStatus: isAuthorizedPayment
          ? PAYMENT_STATUS.authorized
          : PAYMENT_STATUS.paid,
        status: BOOKING_STATUS.pending,
      },
      { returnDocument: 'after', session },
    )

    if (!booking) {
      throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
    }

    if (shouldAwardFirstPaidBookingBonus) {
      await User.findByIdAndUpdate(
        userId,
        { $inc: { points: 300 } },
        { session },
      )
      await PointsLogsService.createPointsLog(
        {
          user: new mongoose.Types.ObjectId(userId),
          type: POINTS_LOG_TYPE.credit,
          points: 300,
          reason: 'First paid booking reward',
          source: POINTS_LOG_SOURCE.reword,
        },
        session,
      )
    }

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
    confirmedPayment = payment
    confirmedBooking = booking
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }

  /* ========= 6. Notifications ========= */
  try {
    const [consult, user] = await Promise.all([
      User.findById(confirmedBooking.consult).select('fcmToken emailNotify firstName lastName email country isVatRegistered vatRegistrationNumber'),
      User.findById(userId).select('fcmToken pushNotify emailNotify firstName lastName email')
    ])

    if (consult?.fcmToken) {
      await sendBookingsNotification(
        'pending',
        confirmedBooking,
        consult,
        consult as unknown as TUser,
        { requesterName: user?.firstName || 'a client' },
      )
    }

    // sent expert to new booking request add
    if (consult?.emailNotify?.booking) {
      await sendNewBookingToConsultant(consult, confirmedBooking, user as TUser)
    }

    // user got notification when they are paid
    if (user?.emailNotify?.payment) {
      await sendPaymentSuccessToUser(user, confirmedBooking, consult as TUser, confirmedPayment)
    }

    if (
      shouldAwardFirstPaidBookingBonus &&
      user?.fcmToken &&
      user.pushNotify?.points
    ) {
      await sendNotification([user.fcmToken], {
        receiver: user._id,
        message: 'First Consultation Booked!',
        description:
          'Congratulations! You have earned 300 points for booking your first consultation. Keep exploring!',
        reference: confirmedBooking._id as string,
        modelType: modeType.Achievement,
      })
    }
  } catch (notificationError: any) {
    console.error(
      'Payment confirmed, but post-payment notification failed:',
      notificationError?.message || notificationError,
    )
  }

  return {
    payment: confirmedPayment,
    booking: confirmedBooking,
  }
}

const getAllPaymentsFromDB = async (query: Record<string, any>) => {
  const paymentModel = new QueryBuilder(
    Payment.find({
      isDeleted: false,
      status: {
        $in: [
          PAYMENT_STATUS.authorized,
          PAYMENT_STATUS.paid,
          PAYMENT_STATUS.refunded,
          PAYMENT_STATUS.cancelled,
        ],
      },
    }),
    query,
  )
    .search([''])
    .filter()
    .paginate()
    .sort()
    .fields()

  const payments = await paymentModel.modelQuery
  const meta = await paymentModel.countTotal()
  const refundMap = await RefundService.getRefundHistoryByPayments(
    payments.map((payment: any) => payment._id),
  )
  const data = payments.map((payment: any) => {
    const raw = payment.toObject ? payment.toObject() : payment
    const { refunds, refundedAmount } = getRefundSummary(
      refundMap.get(String(raw._id)) || [],
    )
    const grossBookingValue = raw.grossBookingValue ?? raw.amount ?? 0
    return {
      ...raw,
      grossBookingValue,
      refundedAmount,
      netRevenueAfterRefund: grossBookingValue - refundedAmount,
      platformTotalDeduction:
        raw.platformTotalDeduction ?? raw.platformTotal ?? 0,
      expertPayout: raw.expertPayout ?? raw.consultAmount ?? 0,
      refunds,
    }
  })

  return {
    data,
    meta,
  }
}

const getDashboardDataFromDB = async (query: Record<string, unknown>) => {}

const getAPaymentsFromDB = async (id: string) => {
  const payment = await Payment.findById(id)
    .populate([
      {
        path: 'booking',
        select:
          '_id id user consult date startTime endTime startAt endAt sessionType sessionDuration price timezone localDate localStartTime localEndTime status paymentStatus',
        populate: [
          { path: 'user', select: '_id firstName lastName email photoUrl' },
          { path: 'consult', select: '_id firstName lastName email photoUrl' },
        ],
      },
      { path: 'account', select: '_id firstName lastName email photoUrl phoneNumber' },
    ])
    .lean()
  if (!payment || payment?.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Payment not found!')
  }

  const rawPayment: any = payment
  const refundMap = await RefundService.getRefundHistoryByPayments([rawPayment._id])
  const { refunds, refundedAmount } = getRefundSummary(
    refundMap.get(String(rawPayment._id)) || [],
  )
  const grossBookingValue = rawPayment.grossBookingValue ?? rawPayment.amount ?? 0
  const callLogs = await Calling.find({
    booking: rawPayment.booking?._id || rawPayment.booking,
    isDeleted: false,
  })
    .select('caller receiver status startedAt endedAt duration createdAt')
    .populate([
      { path: 'caller', select: '_id firstName lastName email photoUrl' },
      { path: 'receiver', select: '_id firstName lastName email photoUrl' },
    ])
    .sort({ createdAt: -1 })
    .lean()

  return {
    ...rawPayment,
    booking: rawPayment.booking
      ? { ...rawPayment.booking, id: rawPayment.booking.id ?? null }
      : rawPayment.booking,
    grossBookingValue,
    refundedAmount,
    netRevenueAfterRefund: grossBookingValue - refundedAmount,
    platformTotalDeduction:
      rawPayment.platformTotalDeduction ?? rawPayment.platformTotal ?? 0,
    expertPayout: rawPayment.expertPayout ?? rawPayment.consultAmount ?? 0,
    refunds,
    callLogs,
  }
}

const refundPayment = async (
  paymentId: string,
  payload: { type: 'full' | 'partial'; amount?: number; reason: string },
  adminId: string,
) => {
  const result = await RefundService.adminRefundPayment(paymentId, payload, adminId)
  const payment = await Payment.findById(paymentId).populate('booking')
  const user = payment?.account ? await User.findById(payment.account) : null
  const refund = result?.refund

  if (payment && user) {
    await paymentNotifyToUser('REFUND', payment, user, refund)
    await sendPaymentRefundToUser(user, payment, refund, payment.booking as any)
    await paymentNotifyToAdmin('REFUND', payment, refund)
  }

  return result
}

export const PaymentService = {
  createPaymentIntent,
  confirmPayment,
  getAllPaymentsFromDB,
  getDashboardDataFromDB,
  getAPaymentsFromDB,
  refundPayment,
}

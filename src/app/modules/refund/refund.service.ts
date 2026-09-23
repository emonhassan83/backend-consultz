import Stripe from 'stripe'
import httpStatus from 'http-status'
import mongoose, { ClientSession, Types } from 'mongoose'
import AppError from '../../errors/AppError'
import config from '../../config'
import { Booking } from '../booking/booking.models'
import { PAYMENT_STATUS as BOOKING_PAYMENT_STATUS } from '../booking/booking.constants'
import { Payment } from '../payment/payment.model'
import {
  PAYMENT_SETTLEMENT_STATUS,
  PAYMENT_STATUS,
} from '../payment/payment.constant'
import { REFUND_BY, REFUND_STATUS, TRefundBy } from './refund.constant'
import { Refund } from './refund.model'
import QueryBuilder from '../../builder/QueryBuilder'
import { User } from '../user/user.model'

const stripe = new Stripe(config.stripe?.stripe_api_secret as string, {
  apiVersion: '2026-06-24.dahlia',
  typescript: true,
})

type TFullRefundPayload = {
  paymentId?: string
  payment?: any
  reason: string
  refundedBy: TRefundBy
  session?: ClientSession
  idempotencyKey?: string
}

type TAdminRefundPayload = {
  type: 'full' | 'partial'
  amount?: number
  reason: string
}

type TRefundPayload = TFullRefundPayload & {
  type?: 'full' | 'partial'
  amount?: number
}

type TReleaseOrRefundPayload = {
  paymentId?: string
  payment?: any
  reason: string
  refundedBy: TRefundBy
  session?: ClientSession
  idempotencyKey?: string
}

const toObjectId = (value: unknown) =>
  new Types.ObjectId(String((value as any)?._id || value))

const refundPopulateOptions = [
  { path: 'user', select: '_id firstName lastName email photoUrl' },
  {
    path: 'booking',
    select:
      '_id id user consult cancelledBy status paymentStatus date startTime endTime localDate localStartTime localEndTime',
    populate: [
      { path: 'user', select: '_id firstName lastName email photoUrl' },
      { path: 'consult', select: '_id firstName lastName email photoUrl' },
    ],
  },
  {
    path: 'payment',
    select:
      '_id id paymentIntentId transactionId amount status settlementStatus createdAt',
  },
]

const formatRefundRecord = (refund: any) => ({
  ...refund,
  consultee: refund.booking?.user || refund.user || null,
  expert: refund.booking?.consult || null,
  cancelledBy: refund.booking?.cancelledBy || null,
})

const getRefundHistoryByPayments = async (paymentIds: unknown[]) => {
  const ids = paymentIds.filter(Boolean).map(toObjectId)

  if (!ids.length) {
    return new Map<string, any[]>()
  }

  const refunds = await Refund.find({ payment: { $in: ids } })
    .populate(refundPopulateOptions)
    .sort({ createdAt: -1 })
    .lean()

  return refunds.reduce((acc, refund: any) => {
    const key = String(refund.payment?._id || refund.payment)
    const current = acc.get(key) || []
    current.push(refund)
    acc.set(key, current)
    return acc
  }, new Map<string, any[]>())
}

const getARefundFromDB = async (refundId: string) => {
  const refund = await Refund.findById(refundId)
    .populate(refundPopulateOptions)
    .lean()

  if (!refund) {
    throw new AppError(httpStatus.NOT_FOUND, 'Refund not found')
  }

  return formatRefundRecord(refund)
}

const getAllRefundsFromDB = async (query: Record<string, unknown>) => {
  const { searchTerm, ...restQuery } = query
  const filter: Record<string, any> = { ...restQuery }

  if (searchTerm) {
    const term = String(searchTerm).trim()
    const searchRegex = new RegExp(term, 'i')
    const matchedUserIds = await User.find({
      isDeleted: false,
      $or: [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
      ],
    }).distinct('_id')

    filter.$or = [
      { reason: searchRegex },
      { stripeRefundId: searchRegex },
      { user: { $in: matchedUserIds } },
    ]

    if (mongoose.Types.ObjectId.isValid(term)) {
      const objectId = new mongoose.Types.ObjectId(term)
      filter.$or.push({ _id: objectId }, { payment: objectId }, { booking: objectId })
    }
  }

  const refundQuery = new QueryBuilder(
    Refund.find(filter).populate(refundPopulateOptions),
    query,
  )
    .sort()
    .paginate()
    .fields()

  const [refunds, meta] = await Promise.all([
    refundQuery.modelQuery.lean(),
    refundQuery.countTotal(),
  ])

  return {
    meta,
    data: refunds.map(formatRefundRecord),
  }
}

const round2 = (value: number) => Number((value || 0).toFixed(2))

const getSucceededRefundedAmount = async (paymentId: unknown) => {
  const summary = await Refund.aggregate([
    {
      $match: {
        payment: toObjectId(paymentId),
        status: REFUND_STATUS.succeeded,
      },
    },
    {
      $group: {
        _id: null,
        amount: { $sum: '$amount' },
      },
    },
  ])

  return round2(summary[0]?.amount || 0)
}

const assertRefundablePayment = async (payment: any) => {
  if (!payment || payment.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Payment not found')
  }

  if (payment.status === PAYMENT_STATUS.refunded) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Payment is already refunded')
  }

  if (payment.status !== PAYMENT_STATUS.paid || !payment.isPaid) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Only paid payments can be refunded',
    )
  }

  if (payment.settlementStatus === PAYMENT_SETTLEMENT_STATUS.withdrawn) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This payment has already been withdrawn and cannot be refunded automatically',
    )
  }

  if (!payment.paymentIntentId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Stripe payment intent ID is missing for this payment',
    )
  }
}

const createRefund = async ({
  paymentId,
  payment: providedPayment,
  reason,
  refundedBy,
  session,
  idempotencyKey,
  type = 'full',
  amount,
}: TRefundPayload) => {
  if (!reason?.trim()) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Refund reason is required')
  }

  const payment =
    providedPayment ||
    (session
      ? await Payment.findOne({
          _id: paymentId,
          isDeleted: false,
        }).session(session)
      : await Payment.findOne({
          _id: paymentId,
          isDeleted: false,
        }))

  await assertRefundablePayment(payment)

  const alreadyRefundedAmount = await getSucceededRefundedAmount(payment._id)
  const refundableAmount = round2((payment.amount || 0) - alreadyRefundedAmount)

  if (refundableAmount <= 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Payment is already refunded')
  }

  if (type === 'partial' && (!amount || amount <= 0)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Refund amount is required for partial refund',
    )
  }

  if (type === 'full' && amount) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Amount is not allowed for full refund',
    )
  }

  const refundAmount = round2(type === 'full' ? refundableAmount : amount || 0)

  if (refundAmount > refundableAmount) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Refund amount cannot be greater than remaining refundable amount ${refundableAmount}`,
    )
  }

  const isFullRefundAfterThis = refundAmount === refundableAmount

  const booking = session
    ? await Booking.findOne({
        _id: payment.booking,
        isDeleted: false,
      }).session(session)
    : await Booking.findOne({
        _id: payment.booking,
        isDeleted: false,
      })

  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  const refund: any = await Refund.create({
    payment: toObjectId(payment._id),
    booking: toObjectId((booking as any)._id),
    user: toObjectId((booking as any).user),
    amount: refundAmount,
    reason: reason.trim(),
    refundedBy,
    status: REFUND_STATUS.pending,
    stripeRefundId: null,
  })

  let stripeRefund: Stripe.Refund

  try {
    stripeRefund = idempotencyKey
      ? await stripe.refunds.create(
          {
            payment_intent: payment.paymentIntentId,
            amount: Math.round(refundAmount * 100),
            reason: 'requested_by_customer',
          },
          { idempotencyKey },
        )
      : await stripe.refunds.create({
          payment_intent: payment.paymentIntentId,
          amount: Math.round(refundAmount * 100),
          reason: 'requested_by_customer',
        })
  } catch (error: any) {
    await Refund.findByIdAndUpdate(refund._id, {
      status: REFUND_STATUS.failed,
      stripeRefundId: null,
    })

    console.error('Refund failed:', error?.message || error)
    throw new AppError(
      httpStatus.BAD_REQUEST,
      error?.message || 'Refund processing failed',
    )
  }

  await Refund.findByIdAndUpdate(refund._id, {
    status: REFUND_STATUS.succeeded,
    stripeRefundId: stripeRefund.id,
  })

  try {
    const updateOptions = session ? { session } : {}

    await Promise.all([
      Payment.findByIdAndUpdate(
        payment._id,
        isFullRefundAfterThis
          ? {
              status: PAYMENT_STATUS.refunded,
              settlementStatus: PAYMENT_SETTLEMENT_STATUS.refunded,
              isPaid: false,
            }
          : {
              status: PAYMENT_STATUS.paid,
              isPaid: true,
            },
        updateOptions,
      ),
      ...(isFullRefundAfterThis
        ? [
            Booking.findByIdAndUpdate(
              booking._id,
              { paymentStatus: BOOKING_PAYMENT_STATUS.refunded },
              updateOptions,
            ),
          ]
        : []),
    ])
  } catch (error: any) {
    console.error(
      `Refund ${refund._id} succeeded on Stripe but DB status update failed:`,
      error?.message || error,
    )
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Refund succeeded on Stripe but database status update failed',
    )
  }

  return {
    refund: {
      ...(refund.toObject ? refund.toObject() : refund),
      status: REFUND_STATUS.succeeded,
      stripeRefundId: stripeRefund.id,
    },
    stripeRefund,
  }
}

const createFullRefund = (payload: TFullRefundPayload) =>
  createRefund({ ...payload, type: 'full' })

const releaseAuthorization = async ({
  payment,
  reason,
  session,
  idempotencyKey,
}: {
  payment: any
  reason: string
  session?: ClientSession
  idempotencyKey?: string
}) => {
  if (!payment?.paymentIntentId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Stripe payment intent ID is missing for this payment',
    )
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(payment.paymentIntentId)

    if (intent.status === 'requires_capture') {
      if (idempotencyKey) {
        await stripe.paymentIntents.cancel(
          payment.paymentIntentId,
          { cancellation_reason: 'requested_by_customer' },
          { idempotencyKey },
        )
      } else {
        await stripe.paymentIntents.cancel(payment.paymentIntentId, {
          cancellation_reason: 'requested_by_customer',
        })
      }
    } else if (intent.status !== 'canceled') {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Payment authorization cannot be released because Stripe status is ${intent.status}`,
      )
    }
  } catch (error: any) {
    if (error instanceof AppError) throw error
    console.error('Payment authorization release failed:', error?.message || error)
    throw new AppError(
      httpStatus.BAD_REQUEST,
      error?.message || 'Payment authorization release failed',
    )
  }

  const updateOptions = session ? { session } : {}

  await Promise.all([
    Payment.findByIdAndUpdate(
      payment._id,
      {
        status: PAYMENT_STATUS.cancelled,
        settlementStatus: PAYMENT_SETTLEMENT_STATUS.authorization_released,
        isPaid: false,
      },
      updateOptions,
    ),
    Booking.findByIdAndUpdate(
      payment.booking,
      { paymentStatus: BOOKING_PAYMENT_STATUS.cancelled },
      updateOptions,
    ),
  ])

  return {
    type: 'authorization_released',
    amount: payment.amount || 0,
    reason,
    refund: null,
  }
}

const releaseOrRefundPayment = async ({
  paymentId,
  payment: providedPayment,
  reason,
  refundedBy,
  session,
  idempotencyKey,
}: TReleaseOrRefundPayload) => {
  const payment =
    providedPayment ||
    (session
      ? await Payment.findOne({ _id: paymentId, isDeleted: false }).session(session)
      : await Payment.findOne({ _id: paymentId, isDeleted: false }))

  if (!payment || payment.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Payment not found')
  }

  if (payment.status === PAYMENT_STATUS.authorized) {
    return releaseAuthorization({ payment, reason, session, idempotencyKey })
  }

  const result = await createFullRefund({
    payment,
    reason,
    refundedBy,
    session,
    idempotencyKey,
  })

  return {
    type: 'refund',
    amount: result.refund.amount,
    refund: result.refund,
    stripeRefund: result.stripeRefund,
  }
}

const adminRefundPayment = async (
  paymentId: string,
  payload: TAdminRefundPayload,
  _adminId: string,
) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const result = await createRefund({
      paymentId,
      reason: payload.reason,
      refundedBy: REFUND_BY.admin,
      session,
      type: payload.type,
      amount: payload.amount,
    })

    await session.commitTransaction()
    return result
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}

export const RefundService = {
  createRefund,
  createFullRefund,
  releaseOrRefundPayment,
  adminRefundPayment,
  getRefundHistoryByPayments,
  getARefundFromDB,
  getAllRefundsFromDB,
}

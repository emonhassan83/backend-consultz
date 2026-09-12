import { USER_ROLE, USER_STATUS } from '../user/user.constant'
import { User } from '../user/user.model'
import { Notification } from '../notification/notification.model'
import {
  getDashboardPaymentOverview,
  getUserOverview,
} from './meta.utils'
import { Withdraw } from '../withdraw/withdraw.model'
import QueryBuilder from '../../builder/QueryBuilder'
import { Payment } from '../payment/payment.model'
import { PAYMENT_STATUS } from '../payment/payment.constant'
import { getGeneralSettingNumber } from '../contents/contents.utils'
import { RefundService } from '../refund/refund.service'
import mongoose from 'mongoose'

const formatRefunds = (refunds: any[] = []) =>
  refunds.map((refund) => ({
    _id: refund._id,
    amount: refund.amount,
    reason: refund.reason,
    refundedBy: refund.refundedBy,
    status: refund.status,
    stripeRefundId: refund.stripeRefundId,
    booking: refund.booking,
    consultee: (refund.booking as any)?.user || refund.user,
    expert: (refund.booking as any)?.consult || null,
    cancelledBy: (refund.booking as any)?.cancelledBy || null,
    createdAt: refund.createdAt,
  }))

const normalizeBookingPartyInfo = (booking: any) => {
  if (!booking) return booking

  const normalized = booking.toObject ? booking.toObject() : booking

  return {
    ...normalized,
    id: normalized.id ?? null,
    consultee: normalized.user || null,
    expert: normalized.consult || null,
    cancelledBy: normalized.cancelledBy || null,
  }
}

const fetchDashboardMetaData = async (
  query: Record<string, unknown>,
  userId: string,
) => {
  const totalConsultCount = await User.countDocuments({
    role: USER_ROLE.consult,
    status: USER_STATUS.active,
    isDeleted: false,
  })

  const totalExpertCount = await User.countDocuments({
    role: USER_ROLE.expert,
    status: USER_STATUS.active,
    isDeleted: false,
  })

  const platformFeePercentage = await getGeneralSettingNumber(
    'platformFeePercentage',
    20,
  )
  const paymentOverview = await getDashboardPaymentOverview(query)

  const latestUsers = await User.find({
    role: { $ne: USER_ROLE.admin },
    isDeleted: false,
    status: USER_STATUS.active,
  })
    .sort({ createdAt: -1 })
    .limit(3)
    .select(
      '_id firstName lastName email phoneNumber photoUrl status createdAt role',
    )
    .lean()

  const notifications = await Notification.find({
    receiver: userId,
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .limit(3)
    .select('message description')
    .lean()

  return {
    totalConsultCount,
    totalExpertCount,
    platformFeePercentage,
    totalEarnings: paymentOverview.totalEarnings,
    grossBookingValue: paymentOverview.grossBookingValue,
    totalCommission: paymentOverview.totalCommission,
    platformCommission: paymentOverview.platformCommission,
    platformVat: paymentOverview.platformVat,
    platformTotalDeduction: paymentOverview.platformTotalDeduction,
    expertPayout: paymentOverview.expertPayout,
    revenueVsCommission: paymentOverview.revenueVsCommission,
    earningOverview: paymentOverview.earningOverview,
    notifications,
    latestUsers,
  }
}

const analysisReportingMetaData = async (
  query: Record<string, unknown>,
  userId: string,
) => {
  const { year, role } = query

  const validRoles = [USER_ROLE.consult, USER_ROLE.expert]
  const selectedRole =
    role && validRoles.includes(role as any) ? (role as string) : null

  const selectedYear = year
    ? parseInt(year as string, 10) || new Date().getFullYear()
    : new Date().getFullYear()

  const latestPayout = await Withdraw.find()
    .sort({ createdAt: -1 })
    .limit(4)
    .populate([
      { path: 'user', select: '_id firstName lastName email' },
      { path: 'booking', select: 'user' },
    ])
    .lean()

  const notifications = await Notification.find({
    receiver: userId,
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .limit(3)
    .select('message description date read')
    .lean()

  const userOverview = await getUserOverview(selectedYear, selectedRole)

  return {
    userOverview,
    notifications,
    latestPayout,
  }
}

const paymentTransactionMetaData = async (
  query: Record<string, unknown>,
  _userId: string,
) => {
  const { year, startDate, endDate, status, searchTerm, ...restQuery } = query

  const selectedYear = year
    ? parseInt(year as string, 10) || new Date().getFullYear()
    : new Date().getFullYear()

  const rangeStart = startDate
    ? new Date(`${String(startDate)}T00:00:00.000Z`)
    : new Date(selectedYear, 0, 1)
  const rangeEnd = endDate
    ? new Date(`${String(endDate)}T23:59:59.999Z`)
    : new Date(selectedYear, 11, 31, 23, 59, 59, 999)

  const baseFilter: Record<string, any> = {
    isDeleted: false,
    status:
      status && status !== 'all'
        ? status
        : { $in: [PAYMENT_STATUS.paid, PAYMENT_STATUS.refunded] },
    createdAt: { $gte: rangeStart, $lte: rangeEnd },
  }

  const summaryFilter: Record<string, unknown> = { ...baseFilter }
  const excludedFields = ['sort', 'limit', 'page', 'fields']

  Object.entries(restQuery).forEach(([key, value]) => {
    if (!excludedFields.includes(key)) {
      summaryFilter[key] = value
      baseFilter[key] = value
    }
  })

  if (searchTerm) {
    const term = String(searchTerm).trim()
    const terms = term.split(/\s+/).filter(Boolean)
    const searchRegex = new RegExp(term, 'i')
    const accountIds = await User.find({
      isDeleted: false,
      $or: [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        ...(terms.length > 1
          ? [
              {
                $and: terms.map((singleTerm) => {
                  const regex = new RegExp(singleTerm, 'i')
                  return {
                    $or: [
                      { firstName: regex },
                      { lastName: regex },
                      { email: regex },
                    ],
                  }
                }),
              },
            ]
          : []),
      ],
    }).distinct('_id')

    const searchOr: Record<string, unknown>[] = [
      { id: searchRegex },
      { paymentIntentId: searchRegex },
      { transactionId: searchRegex },
      { account: { $in: accountIds } },
    ]

    if (mongoose.Types.ObjectId.isValid(term)) {
      searchOr.push({ _id: new mongoose.Types.ObjectId(term) })
      searchOr.push({ booking: new mongoose.Types.ObjectId(term) })
    }

    baseFilter.$or = searchOr
    summaryFilter.$or = searchOr
  }

  const paymentQuery = new QueryBuilder(
    Payment.find(baseFilter).populate([
      {
        path: 'booking',
        select:
          '_id id user consult cancelledBy date startTime endTime startAt endAt sessionType sessionDuration price timezone localDate localStartTime localEndTime status paymentStatus',
        populate: [
          { path: 'user', select: '_id firstName lastName email photoUrl' },
          { path: 'consult', select: '_id firstName lastName email photoUrl' },
        ],
      },
      {
        path: 'account',
        select: '_id firstName lastName photoUrl',
      },
    ]),
    restQuery,
  )
    .sort()
    .paginate()
    .fields()

  const [paymentList, paymentMeta, summary] = await Promise.all([
    paymentQuery.modelQuery,
    paymentQuery.countTotal(),
    Payment.aggregate([
      { $match: summaryFilter },
      {
        $lookup: {
          from: 'refunds',
          let: { paymentId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$payment', '$$paymentId'] },
                    { $eq: ['$status', 'succeeded'] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                amount: { $sum: '$amount' },
              },
            },
          ],
          as: 'refundSummary',
        },
      },
      {
        $addFields: {
          grossForCalc: { $ifNull: ['$grossBookingValue', '$amount'] },
          refundedAmount: {
            $ifNull: [{ $arrayElemAt: ['$refundSummary.amount', 0] }, 0],
          },
        },
      },
      {
        $addFields: {
          retainedAmount: {
            $max: [0, { $subtract: ['$grossForCalc', '$refundedAmount'] }],
          },
        },
      },
      {
        $addFields: {
          retainedRatio: {
            $cond: [
              { $gt: ['$grossForCalc', 0] },
              { $divide: ['$retainedAmount', '$grossForCalc'] },
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          grossBookingValue: {
            $sum: '$grossForCalc',
          },
          refundedAmount: { $sum: '$refundedAmount' },
          platformCommission: {
            $sum: { $multiply: ['$platformCommission', '$retainedRatio'] },
          },
          platformVat: {
            $sum: { $multiply: ['$platformVat', '$retainedRatio'] },
          },
          platformTotalDeduction: {
            $sum: {
              $multiply: [
                { $ifNull: ['$platformTotalDeduction', '$platformTotal'] },
                '$retainedRatio',
              ],
            },
          },
          expertPayout: {
            $sum: {
              $multiply: [
                { $ifNull: ['$expertPayout', '$consultAmount'] },
                '$retainedRatio',
              ],
            },
          },
        },
      },
    ]),
  ])

  const summaryData = summary[0] || {
    grossBookingValue: 0,
    refundedAmount: 0,
    platformCommission: 0,
    platformVat: 0,
    platformTotalDeduction: 0,
    expertPayout: 0,
  }

  const refundMap = await RefundService.getRefundHistoryByPayments(
    paymentList.map((payment: any) => payment._id),
  )

  const normalizedPaymentList = paymentList.map((payment: any) => {
    const raw = payment.toObject ? payment.toObject() : payment
    const refunds = formatRefunds(refundMap.get(String(raw._id)) || [])
    const refundedAmount = refunds
      .filter((refund: any) => refund.status === 'succeeded')
      .reduce((sum: number, refund: any) => sum + (refund.amount || 0), 0)
    const grossBookingValue = raw.grossBookingValue ?? raw.amount ?? 0

    return {
      ...raw,
      booking: normalizeBookingPartyInfo(raw.booking),
      consultee: raw.booking?.user || null,
      expert: raw.booking?.consult || null,
      cancelledBy: raw.booking?.cancelledBy || null,
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
    meta: paymentMeta,
    data: {
      grossBookingValue: summaryData.grossBookingValue,
      refundedAmount: summaryData.refundedAmount,
      netRevenueAfterRefund:
        summaryData.grossBookingValue - summaryData.refundedAmount,
      platformCommission: summaryData.platformCommission,
      platformVat: summaryData.platformVat,
      platformTotalDeduction: summaryData.platformTotalDeduction,
      expertPayout: summaryData.expertPayout,
      paymentList: normalizedPaymentList,
    },
  }
}

export const MetaService = {
  fetchDashboardMetaData,
  analysisReportingMetaData,
  paymentTransactionMetaData,
}

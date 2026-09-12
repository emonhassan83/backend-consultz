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
  const { year, ...restQuery } = query

  const selectedYear = year
    ? parseInt(year as string, 10) || new Date().getFullYear()
    : new Date().getFullYear()

  const yearStart = new Date(selectedYear, 0, 1)
  const yearEnd = new Date(selectedYear, 11, 31, 23, 59, 59, 999)

  const baseFilter = {
    isDeleted: false,
    isPaid: true,
    status: PAYMENT_STATUS.paid,
    createdAt: { $gte: yearStart, $lte: yearEnd },
  }

  const summaryFilter: Record<string, unknown> = { ...baseFilter }
  const excludedFields = ['searchTerm', 'sort', 'limit', 'page', 'fields']

  Object.entries(restQuery).forEach(([key, value]) => {
    if (!excludedFields.includes(key)) {
      summaryFilter[key] = value
    }
  })

  const paymentQuery = new QueryBuilder(
    Payment.find(baseFilter).populate([
      {
        path: 'booking',
        select:
          '_id date startTime endTime startAt endAt sessionType sessionDuration price timezone localDate localStartTime localEndTime',
      },
      {
        path: 'account',
        select: '_id firstName lastName photoUrl',
      },
    ]),
    restQuery,
  )
    .search(['booking.sessionType'])
    .filter()
    .sort()
    .paginate()
    .fields()

  const [paymentList, paymentMeta, summary] = await Promise.all([
    paymentQuery.modelQuery,
    paymentQuery.countTotal(),
    Payment.aggregate([
      { $match: summaryFilter },
      {
        $group: {
          _id: null,
          grossBookingValue: {
            $sum: { $ifNull: ['$grossBookingValue', '$amount'] },
          },
          platformTotalDeduction: {
            $sum: { $ifNull: ['$platformTotalDeduction', '$platformTotal'] },
          },
          expertPayout: {
            $sum: { $ifNull: ['$expertPayout', '$consultAmount'] },
          },
        },
      },
    ]),
  ])

  const summaryData = summary[0] || {
    grossBookingValue: 0,
    platformTotalDeduction: 0,
    expertPayout: 0,
  }

  const normalizedPaymentList = paymentList.map((payment: any) => {
    const raw = payment.toObject ? payment.toObject() : payment

    return {
      ...raw,
      grossBookingValue: raw.grossBookingValue ?? raw.amount ?? 0,
      platformTotalDeduction:
        raw.platformTotalDeduction ?? raw.platformTotal ?? 0,
      expertPayout: raw.expertPayout ?? raw.consultAmount ?? 0,
    }
  })

  return {
    meta: paymentMeta,
    data: {
      grossBookingValue: summaryData.grossBookingValue,
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

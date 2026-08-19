import { endOfYear, startOfYear } from 'date-fns'
import { USER_ROLE, USER_STATUS } from '../user/user.constant'
import { User } from '../user/user.model'
import { PAYMENT_STATUS } from '../payment/payment.constant'
import { Payment } from '../payment/payment.model'

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
]

const getPaymentFinancialOverview = async (year: number) => {
  const yearStart = startOfYear(new Date(year, 0, 1))
  const yearEnd = endOfYear(new Date(year, 11, 31))

  const monthlyDataRaw = await Payment.aggregate([
    {
      $match: {
        createdAt: { $gte: yearStart, $lte: yearEnd },
        isPaid: true,
        status: PAYMENT_STATUS.paid,
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: { $month: '$createdAt' },
        grossBookingValue: {
          $sum: { $ifNull: ['$grossBookingValue', '$amount'] },
        },
        platformCommission: { $sum: '$platformCommission' },
        platformVat: { $sum: '$platformVat' },
        platformTotalDeduction: {
          $sum: { $ifNull: ['$platformTotalDeduction', '$platformTotal'] },
        },
        expertPayout: {
          $sum: { $ifNull: ['$expertPayout', '$consultAmount'] },
        },
      },
    },
    { $sort: { _id: 1 } },
  ])

  const monthlyData = MONTHS.map((month, index) => {
    const data = monthlyDataRaw.find((m: any) => m._id === index + 1)
    const grossBookingValue = data?.grossBookingValue || 0
    const platformCommission = data?.platformCommission || 0

    return {
      month,
      grossBookingValue,
      revenue: grossBookingValue,
      platformCommission,
      commission: platformCommission,
      platformVat: data?.platformVat || 0,
      platformTotalDeduction: data?.platformTotalDeduction || 0,
      expertPayout: data?.expertPayout || 0,
    }
  })

  return {
    totalGrossBookingValue: monthlyDataRaw.reduce(
      (sum, m) => sum + m.grossBookingValue,
      0,
    ),
    totalEarnings: monthlyDataRaw.reduce(
      (sum, m) => sum + m.grossBookingValue,
      0,
    ),
    totalPlatformCommission: monthlyDataRaw.reduce(
      (sum, m) => sum + m.platformCommission,
      0,
    ),
    totalCommission: monthlyDataRaw.reduce(
      (sum, m) => sum + m.platformCommission,
      0,
    ),
    totalPlatformVat: monthlyDataRaw.reduce((sum, m) => sum + m.platformVat, 0),
    totalPlatformTotalDeduction: monthlyDataRaw.reduce(
      (sum, m) => sum + m.platformTotalDeduction,
      0,
    ),
    totalExpertPayout: monthlyDataRaw.reduce(
      (sum, m) => sum + m.expertPayout,
      0,
    ),
    consultAmount: monthlyDataRaw.reduce((sum, m) => sum + m.expertPayout, 0),
    monthlyData,
  }
}

export const getRevenueVsCommission = async (year: number) => {
  const overview = await getPaymentFinancialOverview(year)

  return {
    totalCommission: overview.totalCommission,
    totalPlatformCommission: overview.totalPlatformCommission,
    totalPlatformVat: overview.totalPlatformVat,
    totalPlatformTotalDeduction: overview.totalPlatformTotalDeduction,
    monthlyData: overview.monthlyData,
  }
}

export const getEarningOverview = async (year: number) => {
  const overview = await getPaymentFinancialOverview(year)

  return {
    totalEarnings: overview.totalEarnings,
    grossBookingValue: overview.totalGrossBookingValue,
    consultAmount: overview.consultAmount,
    expertPayout: overview.totalExpertPayout,
    platformCommission: overview.totalPlatformCommission,
    platformVat: overview.totalPlatformVat,
    platformTotalDeduction: overview.totalPlatformTotalDeduction,
    monthlyData: overview.monthlyData.map((data) => ({
      ...data,
      total: data.grossBookingValue,
    })),
  }
}

export const getUserOverview = async (year: number, role?: string | null) => {
  const yearStart = startOfYear(new Date(year, 0, 1))
  const yearEnd = endOfYear(new Date(year, 11, 31))

  const matchConditions: any = {
    createdAt: { $gte: yearStart, $lte: yearEnd },
    status: USER_STATUS.active,
    isDeleted: false,
    role: { $nin: [USER_ROLE.admin] },
  }

  if (role) {
    matchConditions.role = role
  }

  const monthlyUsers = await User.aggregate([
    { $match: matchConditions },
    {
      $group: {
        _id: { $month: '$createdAt' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ])

  return MONTHS.map((month, index) => {
    const data = monthlyUsers.find((m: any) => m._id === index + 1)
    return {
      month,
      count: data ? data.count : 0,
    }
  })
}

import { Payment } from '../payment/payment.model';
import { PAYMENT_STATUS } from '../payment/payment.constant';
import { startOfYear, endOfYear } from 'date-fns';
import { USER_ROLE, USER_STATUS } from '../user/user.constant';
import { User } from '../user/user.model';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export const getRevenueVsCommission = async (year: number) => {
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
        revenue: { $sum: '$amount' },
        commission: { $sum: '$platformCommission' },
      },
    },
    { $sort: { _id: 1 } },
  ])

  const totalCommission = monthlyDataRaw.reduce((sum, m) => sum + m.commission, 0)

  // ✅ সব 12 মাস দেখাবে, short name দিয়ে
  const monthlyData = MONTHS.map((month, index) => {
    const data = monthlyDataRaw.find((m: any) => m._id === index + 1)
    return {
      month,
      revenue: data ? data.revenue : 0,
      commission: data ? data.commission : 0,
    }
  })

  return { totalCommission, monthlyData }
}

export const getEarningOverview = async (year: number) => {
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
        total: { $sum: '$amount' },
        consultAmount: { $sum: '$consultAmount' },
      },
    },
    { $sort: { _id: 1 } },
  ])

  const totalEarnings = monthlyDataRaw.reduce((sum, m) => sum + m.total, 0)
  const consultAmount = monthlyDataRaw.reduce((sum, m) => sum + m.consultAmount, 0)

  // ✅ সব 12 মাস দেখাবে, short name দিয়ে
  const monthlyData = MONTHS.map((month, index) => {
    const data = monthlyDataRaw.find((m: any) => m._id === index + 1)
    return {
      month,
      total: data ? data.total : 0,
    }
  })

  return { totalEarnings, consultAmount, monthlyData }
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

  // ✅ সব 12 মাস, short name
  const userOverview = MONTHS.map((month, index) => {
    const data = monthlyUsers.find((m: any) => m._id === index + 1)
    return {
      month,
      count: data ? data.count : 0,
    }
  })

  return userOverview
}
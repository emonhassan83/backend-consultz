import { USER_ROLE, USER_STATUS } from '../user/user.constant'
import { User } from '../user/user.model'
import { Notification } from '../notification/notification.model'
import {
  getEarningOverview,
  getRevenueVsCommission,
  getUserOverview,
} from './meta.utils'
import { Withdraw } from '../withdraw/withdraw.model'
import QueryBuilder from '../../builder/QueryBuilder'
import { Payment } from '../payment/payment.model'
import { PAYMENT_STATUS } from '../payment/payment.constant'

const fetchDashboardMetaData = async (
  query: Record<string, unknown>,
  userId: string,
) => {
  const { revenue_year, earning_year } = query

  // Total counts (consultants & experts)
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

  // Year selection for revenue vs commission
  const selectedRevenueYear = revenue_year
    ? parseInt(revenue_year as string, 10) || new Date().getFullYear()
    : new Date().getFullYear()

  // Year selection for earning overview
  const selectedEarningYear = earning_year
    ? parseInt(earning_year as string, 10) || new Date().getFullYear()
    : new Date().getFullYear()

  // Revenue vs Commission data (separate year)
  const revenueVsCommissionData =
    await getRevenueVsCommission(selectedRevenueYear)

  // Earning overview (separate year)
  const earningOverviewData = await getEarningOverview(selectedEarningYear)

  // Latest user find
  const latestUsers = await User.find({
    role: { $ne: USER_ROLE.admin }, // exclude admins
    isDeleted: false,
    status: USER_STATUS.active,
  })
    .sort({ createdAt: -1 }) // newest first
    .limit(3)
    .select(
      '_id firstName lastName email phoneNumber photoUrl status createdAt role',
    )
    .lean()

  // Latest notification find
  const notifications = await Notification.find({
    receiver: userId,
    isDeleted: false,
  })
    .sort({ createdAt: -1 }) // newest first
    .limit(3)
    .select('message description')
    .lean()

  return {
    totalConsultCount,
    totalExpertCount,
    totalEarnings: earningOverviewData.totalEarnings,
    totalCommission: revenueVsCommissionData.totalCommission,
    revenueVsCommission: revenueVsCommissionData.monthlyData,
    earningOverview: earningOverviewData.monthlyData,
    notifications,
    latestUsers,
  }
}

const analysisReportingMetaData = async (
  query: Record<string, unknown>,
  userId: string,
) => {
  const { year, role } = query

  // Validate role (only consult or expert allowed)
  const validRoles = [USER_ROLE.consult, USER_ROLE.expert]
  const selectedRole =
    role && validRoles.includes(role as any) ? (role as string) : null // null means both consult & expert

  // Year selection
  const selectedYear = year
    ? parseInt(year as string, 10) || new Date().getFullYear()
    : new Date().getFullYear()

  // Latest payout (4 newest withdrawals)
  const latestPayout = await Withdraw.find()
    .sort({ createdAt: -1 }) // newest first
    .limit(4)
    .populate([
      { path: 'user', select: '_id firstName lastName email' },
      { path: 'booking', select: 'user' },
    ])
    .lean()

  // Latest notifications for this user (admin or whoever)
  const notifications = await Notification.find({
    receiver: userId,
    isDeleted: false,
  })
    .sort({ createdAt: -1 }) // newest first
    .limit(3)
    .select('message description date read')
    .lean()

  // User overview: monthly registration count for selected year & role
  const userOverview = await getUserOverview(selectedYear, selectedRole)

  return {
    userOverview,
    notifications,
    latestPayout,
  }
}

const paymentTransactionMetaData = async (
  query: Record<string, unknown>,
  userId: string,   // admin-এর ID
) => {
  const { year, ...restQuery } = query;

  const selectedYear = year
    ? parseInt(year as string, 10) || new Date().getFullYear()
    : new Date().getFullYear();

  // 1. Earning Overview
  const earningOverviewData = await getEarningOverview(selectedYear);

  // 2. Notifications
  const notifications = await Notification.find({
    receiver: userId,
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .limit(3)
    .select('message description date read')
    .lean();

  // ====================== PAYMENT LIST DEBUG ======================
  console.log('Payment Query Filters:', {
    isDeleted: false,
    isPaid: true,
    status: PAYMENT_STATUS.paid,
  });

  const paymentQuery = new QueryBuilder(
    Payment.find({
      isDeleted: false,
      isPaid: true,
      status: PAYMENT_STATUS.paid,
    }).populate([
      {
        path: 'booking',
        select: 'sessionType sessionDuration price slot timezone',
        populate: { path: 'slot', select: 'date time' },
      },
      {
        path: 'account',
        select: 'firstName lastName photoUrl',
      },
    ]),
    restQuery,
  )
    .search(['booking.sessionType'])
    .filter()
    .sort()
    .paginate()
    .fields();

  const paymentList = await paymentQuery.modelQuery;
  const paymentMeta = await paymentQuery.countTotal();

  return {
    meta: paymentMeta,

    data: {
      totalEarnings: earningOverviewData.totalEarnings,
      consultAmount: earningOverviewData.consultAmount || 0,
      // earningOverview: earningOverviewData.monthlyData,
      paymentList,
      notifications,
    },
  };
};

export const MetaService = {
  fetchDashboardMetaData,
  analysisReportingMetaData,
  paymentTransactionMetaData,
}

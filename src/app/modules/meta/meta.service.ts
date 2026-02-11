import { Payment } from '../payment/payment.model';
import { PAYMENT_STATUS } from '../payment/payment.constant';
import { startOfYear, endOfYear } from 'date-fns';
import { USER_ROLE, USER_STATUS } from '../user/user.constant';
import { User } from '../user/user.model';
import { Notification } from '../notification/notification.model';

const fetchDashboardMetaData = async (
  user: any,
  query: Record<string, unknown>,
) => {
  if (user?.role !== USER_ROLE.admin) {
    throw new Error('Invalid user role!');
  }

  return await getAdminMetaData(query, user._id);
};

const getAdminMetaData = async (query: Record<string, unknown>, userId: string) => {
  const { revenue_year, earning_year } = query;

  // Total counts (consultants & experts)
  const totalConsultCount = await User.countDocuments({
    role: USER_ROLE.consult,
    status: USER_STATUS.active,
    isDeleted: false,
  });

  const totalExpertCount = await User.countDocuments({
    role: USER_ROLE.expert,
    status: USER_STATUS.active,
    isDeleted: false,
  });

  // Year selection for revenue vs commission
  const selectedRevenueYear = revenue_year
    ? parseInt(revenue_year as string, 10) || new Date().getFullYear()
    : new Date().getFullYear();

  // Year selection for earning overview
  const selectedEarningYear = earning_year
    ? parseInt(earning_year as string, 10) || new Date().getFullYear()
    : new Date().getFullYear();

  // Revenue vs Commission data (separate year)
  const revenueVsCommissionData = await getRevenueVsCommission(selectedRevenueYear);

  // Earning overview (separate year)
  const earningOverviewData = await getEarningOverview(selectedEarningYear);

  // Latest user find
  const latestUsers = await User.find({
    role: { $ne: USER_ROLE.admin },           // exclude admins
    isDeleted: false,
    status: USER_STATUS.active,
  })
    .sort({ createdAt: -1 })                   // newest first
    .limit(3)
    .select('_id firstName lastName email phoneNumber photoUrl status createdAt role')
    .lean();

    // Latest notification find
    const notifications = await Notification.find({
    receiver: userId,
    isDeleted: false,
  })
    .sort({ createdAt: -1 })                   // newest first
    .limit(3)
    .select('message description')
    .lean();

  return {
    totalConsultCount,
    totalExpertCount,
    totalEarnings: earningOverviewData.totalEarnings,
    totalCommission: revenueVsCommissionData.totalCommission,
    revinewVsCommisson: revenueVsCommissionData.monthlyData,
    earningOverview: earningOverviewData.monthlyData,
    notifications,
    latestUsers
  };
};

// Revenue vs Commission breakdown (monthly revenue & commission)
const getRevenueVsCommission = async (year: number) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const isCurrentYear = year === currentYear;

  const yearStart = startOfYear(new Date(year, 0, 1));
  const yearEnd = endOfYear(new Date(year, 11, 31));

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
        revenue: { $sum: '$amount' },              // Total paid amount
        commission: { $sum: '$platformCommission' }, // Platform commission
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const totalCommission = monthlyDataRaw.reduce((sum, m) => sum + m.commission, 0);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const filteredMonths = isCurrentYear ? months.slice(0, now.getMonth() + 1) : months;

  const monthlyData = filteredMonths.map((month, index) => {
    const data = monthlyDataRaw.find((m: any) => m._id === index + 1);
    return {
      month,
      revenue: data ? data.revenue : 0,
      commission: data ? data.commission : 0,
    };
  });

  return {
    totalCommission,
    monthlyData,
  };
};

// Monthly earning overview (total earnings per month)
const getEarningOverview = async (year: number) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const isCurrentYear = year === currentYear;

  const yearStart = startOfYear(new Date(year, 0, 1));
  const yearEnd = endOfYear(new Date(year, 11, 31));

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
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const totalEarnings = monthlyDataRaw.reduce((sum, m) => sum + m.total, 0);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const filteredMonths = isCurrentYear ? months.slice(0, now.getMonth() + 1) : months;

  const monthlyData = filteredMonths.map((month, index) => {
    const data = monthlyDataRaw.find((m: any) => m._id === index + 1);
    return {
      month,
      total: data ? data.total : 0,
    };
  });

  return {
    totalEarnings,
    monthlyData,
  };
};

export const MetaService = {
  fetchDashboardMetaData,
};
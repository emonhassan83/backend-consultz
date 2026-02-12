import { Payment } from '../payment/payment.model';
import { PAYMENT_STATUS } from '../payment/payment.constant';
import { startOfYear, endOfYear } from 'date-fns';
import { USER_ROLE, USER_STATUS } from '../user/user.constant';
import { User } from '../user/user.model';

// Revenue vs Commission breakdown (monthly revenue & commission)
export const getRevenueVsCommission = async (year: number) => {
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
export const getEarningOverview = async (year: number) => {
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

// Helper: Monthly user registration overview (year + optional role filter)
export const getUserOverview = async (year: number, role?: string | null) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const isCurrentYear = year === currentYear;

  const yearStart = startOfYear(new Date(year, 0, 1));
  const yearEnd = endOfYear(new Date(year, 11, 31));

  const matchConditions: any = {
    createdAt: { $gte: yearStart, $lte: yearEnd },
    status: USER_STATUS.active,
    isDeleted: false,
    role: { $nin: [USER_ROLE.admin] }, // exclude admin
  };

  // Apply role filter if provided
  if (role) {
    matchConditions.role = role;
  }

  // Aggregate monthly registrations
  const monthlyUsers = await User.aggregate([
    { $match: matchConditions },
    {
      $group: {
        _id: { $month: '$createdAt' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const filteredMonths = isCurrentYear ? months.slice(0, now.getMonth() + 1) : months;

  const userOverview = filteredMonths.map((month, index) => {
    const data = monthlyUsers.find((m: any) => m._id === index + 1);
    return {
      month,
      count: data ? data.count : 0,
    };
  });

  return userOverview;
};
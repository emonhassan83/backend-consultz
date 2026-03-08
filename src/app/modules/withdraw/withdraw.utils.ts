import { messages } from '../notification/notification.constant'
import { modeType } from '../notification/notification.interface'
import { sendNotification } from '../../utils/sentNotification'
import { TUser } from '../user/user.interface'
import { TWithdraw } from './withdraw.interface'
import { TWithdrawStatus, WITHDRAW_STATUS } from './withdraw.constant'
import dayjs from 'dayjs'
import { Withdraw } from './withdraw.model'
import { Types } from 'mongoose'

export const sendWithdrawNotify = async (
  action: TWithdrawStatus,
  withdraw: TWithdraw,
  user: TUser,
  note?: string
) => {
  if (!user?.fcmToken || !user.pushNotify.payment) return
  
  let message = ''
  let description = ''

  const formattedAmount = `${withdraw.amount.toFixed(2)}`

  switch (action) {
    case 'hold':
      message = messages.withdraw.hold || 'Withdrawal Request On Hold'
      description = `Your withdrawal request of ${formattedAmount} is currently on hold. We will review it soon and notify you.`
      break

    case 'proceed':
      message = messages.withdraw.proceed || 'Withdrawal Processing Started'
      description = `Your withdrawal of ${formattedAmount} has been approved and is now being processed. Funds will be transferred shortly.`
      break

    case 'completed':
      message = messages.withdraw.completed || 'Withdrawal Completed'
      description = `Your withdrawal of ${formattedAmount} has been successfully completed! Check your bank/stripe account.`
      break

    default:
      throw new Error('Invalid withdraw notification action')
  }

  const notifyPayload = {
    receiver: user._id,
    message,
    description,
    reference: withdraw._id as string,
    model_type: modeType.Withdraw,
  }

  await sendNotification([user.fcmToken], notifyPayload)
}

/**
 * Get total completed withdrawals for the current month (no year/month filter needed)
 */
export const getThisMonthWithdraw = async (userId: string): Promise<number> => {
  const currentMonthStart = dayjs().startOf('month').toDate();
  const currentMonthEnd = dayjs().endOf('month').toDate();

  const result = await Withdraw.aggregate([
    {
      $match: {
        user: new Types.ObjectId(userId),
        status: WITHDRAW_STATUS.completed,
        isDeleted: false,
        createdAt: { $gte: currentMonthStart, $lte: currentMonthEnd },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' },
      },
    },
  ]);

  return result[0]?.total || 0;
};

/**
 * Get monthly withdrawal overview for a specific year (returns array like [{month: "January", amount: 100}, ...])
 * @param userId - Consultant's user ID
 * @param year - Year to filter (defaults to current year)
 */
export const getWithdrawMonthlyOverview = async (
  userId: string,
  year?: number
): Promise<Array<{ month: string; amount: number }>> => {
  const selectedYear = year || dayjs().year();
  const yearStart = dayjs(`${selectedYear}-01-01`).startOf('year').toDate();
  const yearEnd = dayjs(`${selectedYear}-12-31`).endOf('year').toDate();

  const monthlyData = await Withdraw.aggregate([
    {
      $match: {
        user: new Types.ObjectId(userId),
        status: WITHDRAW_STATUS.completed,
        isDeleted: false,
        createdAt: { $gte: yearStart, $lte: yearEnd },
      },
    },
    {
      $group: {
        _id: { $month: '$createdAt' },
        amount: { $sum: '$amount' },
      },
    },
    {
      $project: {
        month: {
          $switch: {
            branches: [
              { case: { $eq: ['$_id', 1] }, then: 'January' },
              { case: { $eq: ['$_id', 2] }, then: 'February' },
              { case: { $eq: ['$_id', 3] }, then: 'March' },
              { case: { $eq: ['$_id', 4] }, then: 'April' },
              { case: { $eq: ['$_id', 5] }, then: 'May' },
              { case: { $eq: ['$_id', 6] }, then: 'June' },
              { case: { $eq: ['$_id', 7] }, then: 'July' },
              { case: { $eq: ['$_id', 8] }, then: 'August' },
              { case: { $eq: ['$_id', 9] }, then: 'September' },
              { case: { $eq: ['$_id', 10] }, then: 'October' },
              { case: { $eq: ['$_id', 11] }, then: 'November' },
              { case: { $eq: ['$_id', 12] }, then: 'December' },
            ],
            default: 'Unknown',
          },
        },
        amount: 1,
        _id: 0,
      },
    },
    { $sort: { _id: 1 } }, // Sort by internal month number
  ]);

  return monthlyData;
};
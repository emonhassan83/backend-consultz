import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import QueryBuilder from '../../builder/QueryBuilder'
import { Withdraw } from './withdraw.model'
import { TWithdrawStatus, WITHDRAW_STATUS } from './withdraw.constant'
import {
  getThisMonthWithdraw,
  getWithdrawMonthlyOverview,
  sendWithdrawNotify,
} from './withdraw.utils'
import { User } from '../user/user.model'
import mongoose from 'mongoose'
import { Booking } from '../booking/booking.models'
import { Payment } from '../payment/payment.model'
import { sendWithdrawStatusChangeEmail } from '../../utils/emailNotify'
import dayjs from 'dayjs'
import {
  PAYMENT_SETTLEMENT_STATUS,
  PAYMENT_STATUS as PAYMENT_COLLECTION_STATUS,
} from '../payment/payment.constant'

const getExpertWithdrawalBalances = async (userId: string) => {
  const bookings = await Booking.find({
    consult: userId,
    isDeleted: false,
  })
    .select('_id')
    .lean()

  const bookingIds = bookings.map((booking) => booking._id)

  if (bookingIds.length === 0) {
    return {
      availableBalance: 0,
      pendingBalance: 0,
      pendingClearsOn: null as Date | null,
    }
  }

  const payments = await Payment.find({
    booking: { $in: bookingIds },
    isPaid: true,
    status: PAYMENT_COLLECTION_STATUS.paid,
    isDeleted: false,
    settlementStatus: {
      $in: [
        PAYMENT_SETTLEMENT_STATUS.cleared,
        PAYMENT_SETTLEMENT_STATUS.held,
      ],
    },
  } as any)
    .select('expertPayout consultAmount amount settlementStatus holdUntil')
    .lean()

  let availableBalance = 0
  let pendingBalance = 0
  let pendingClearsOn: Date | null = null

  for (const payment of payments) {
    const amount =
      payment.expertPayout || payment.consultAmount || payment.amount || 0

    if (payment.settlementStatus === PAYMENT_SETTLEMENT_STATUS.cleared) {
      availableBalance += amount
      continue
    }

    if (payment.settlementStatus === PAYMENT_SETTLEMENT_STATUS.held) {
      pendingBalance += amount
      if (
        payment.holdUntil &&
        (!pendingClearsOn || payment.holdUntil < pendingClearsOn)
      ) {
        pendingClearsOn = payment.holdUntil
      }
    }
  }

  return {
    availableBalance: Number(availableBalance.toFixed(2)),
    pendingBalance: Number(pendingBalance.toFixed(2)),
    pendingClearsOn,
  }
}

// Test purpose-এ withdraw request তৈরি
const addWithdraw = async (payload: { booking: string }, userId: string) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // Validate user
    const user = await User.findById(userId)
    if (!user || user.isDeleted) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'Only consultants can create withdrawal requests',
      )
    }

    // check booking
    const booking = await Booking.findOne({
      _id: payload.booking,
      consult: userId,
      isDeleted: false,
    }).session(session)
    if (!booking) {
      throw new AppError(httpStatus.NOT_FOUND, 'Booking not found or not yours')
    }

    // Booking of payment found
    const payment = await Payment.findOne({
      booking: (booking._id).toString(),
      isPaid: true,
      status: PAYMENT_COLLECTION_STATUS.paid,
      isDeleted: false,
    }).session(session)
    if (!payment) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'No paid payment found for this booking',
      )
    }

    if (payment.settlementStatus === PAYMENT_SETTLEMENT_STATUS.held) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Funds are still on hold until ${payment.holdUntil?.toISOString() || 'the configured hold period ends'}`,
      )
    }

    if (payment.settlementStatus !== PAYMENT_SETTLEMENT_STATUS.cleared) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Funds are not cleared for withdrawal yet',
      )
    }

    // consultAmount find
    const consultAmount = payment.expertPayout || payment.consultAmount || payment.amount
    if (consultAmount <= 0) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'No amount available for withdrawal',
      )
    }

    // check (duplicate prevent)
    const existingWithdraw = await Withdraw.findOne({
      booking: (booking._id).toString(),
      user: userId,
      isDeleted: false,
    }).session(session)

    if (existingWithdraw) {
      throw new AppError(
        httpStatus.CONFLICT,
        'Withdrawal request already exists for this booking',
      )
    }

    // new withdraw request check
    const [withdraw] = await Withdraw.create(
      [
        {
          user: userId,
          booking: (booking._id).toString(),
          amount: consultAmount,
          status: WITHDRAW_STATUS.proceed,
          proceedAt: new Date(),
        },
      ],
      { session },
    )

    payment.settlementStatus = PAYMENT_SETTLEMENT_STATUS.withdrawn
    payment.withdrawnAt = new Date()
    await payment.save({ session })

    await session.commitTransaction()

    return {
      withdraw,
      message: `Withdrawal request of $${consultAmount} created successfully (pending)`,
    }
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}

const getAllWithdrawsFromDB = async (query: Record<string, unknown>) => {
  const WithdrawQuery = new QueryBuilder(
    Withdraw.find().populate([
      { path: 'user', select: 'firstName lastName email photoUrl' },
    ]),
    query,
  )
    .search([])
    .filter()
    .sort()
    .paginate()
    .fields()

  const result = await WithdrawQuery.modelQuery
  const meta = await WithdrawQuery.countTotal()

  return {
    meta,
    result,
  }
}

const getConsultWithdrawsFromDB = async (
  query: Record<string, unknown>,
  userId: string,
) => {
  const expert = await User.findById(userId)
  if (!expert || expert.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'Expert profile not found!')
  }

  const selectedYear = query.year
    ? parseInt(query.year as string, 10)
    : new Date().getFullYear()

  const thisMonthWithdraw = await getThisMonthWithdraw(userId)
  const balances = await getExpertWithdrawalBalances(userId)

  const withdrawOverview = await getWithdrawMonthlyOverview(userId, selectedYear)

  // year filter এর date range
  const yearStart = new Date(`${selectedYear}-01-01`)
  const yearEnd = new Date(`${selectedYear + 1}-01-01`)

  // QueryBuilder এ যাওয়ার আগে custom fields delete করো
  const listQuery = { ...query }
  delete listQuery.year
  delete listQuery.month

  const withdrawQuery = new QueryBuilder(
    Withdraw.find({
      user: userId,
      createdAt: { $gte: yearStart, $lt: yearEnd },
    })
      .populate([
        {
          path: 'booking',
          select: 'sessionType user',
          populate: { path: 'user', select: 'firstName lastName' },
        },
      ])
      .sort({ createdAt: -1 }),
    listQuery,
  )
    .filter()
    .sort()
    .paginate()
    .fields()

  const result = await withdrawQuery.modelQuery
  const meta = await withdrawQuery.countTotal()

  return {
    meta,
    result: {
      ...balances,
      thisMonthWithdraw,
      withdrawOverview,
      withdrawList: result,
    },
  }
}

const getAWithdrawFromDB = async (id: string) => {
  const result = await Withdraw.findById(id).populate([
    { path: 'user', select: 'firstName lastName email photoUrl' },
    {
      path: 'booking',
      populate: [
        {
          path: 'user',
          select: 'firstName lastName email photoUrl',
        },
      ],
    },
  ])
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Withdraw not found')
  }

  return result
}

const updateWithdrawFromDB = async (
  id: string,
  payload: { status: TWithdrawStatus; note?: string }
) => {
  const { status, note } = payload;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const withdraw = await Withdraw.findById(id).session(session);
    if (!withdraw) {
      throw new AppError(httpStatus.NOT_FOUND, 'Withdraw not found');
    }

    const currentStatus = withdraw.status;

    // Validate allowed status transitions
    if (currentStatus === WITHDRAW_STATUS.completed) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Completed withdrawals cannot be updated');
    }

    // Case 1: proceed → hold → clear proceedAt
    if (currentStatus === WITHDRAW_STATUS.proceed && status === WITHDRAW_STATUS.hold) {
      withdraw.proceedAt = undefined;
      withdraw.status = WITHDRAW_STATUS.hold;
    }

    // Case 2: hold → proceed → set proceedAt = now + 3 days
    else if (currentStatus === WITHDRAW_STATUS.hold && status === WITHDRAW_STATUS.proceed) {
      const now = new Date();
      const proceedAtDate = dayjs(now).add(3, 'day').toDate();

      withdraw.proceedAt = proceedAtDate;
      withdraw.status = WITHDRAW_STATUS.proceed;
    }

    // Other status changes (e.g., rejected, etc.) → just update status
    else {
      withdraw.status = status;
    }


    await withdraw.save({ session });

    // Send notification to user
    const user = await User.findById(withdraw.user).session(session);
    if (user) {
      await sendWithdrawNotify(status, withdraw, user, note);
    }

    // Send email to user about status change
    if (user && user.emailNotify?.payment) {
      await sendWithdrawStatusChangeEmail(user, withdraw, status);
    }

    // Optional: Log admin action (if you have AuditLog model)
    // await AuditLog.create({ action: 'update_withdraw', adminId, withdrawId: id, oldStatus: currentStatus, newStatus: status, note });

    await session.commitTransaction();

    return withdraw;
  } catch (error) {
    await session.abortTransaction();
    throw error instanceof AppError
      ? error
      : new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update withdraw status');
  } finally {
    session.endSession();
  }
};

export const WithdrawService = {
  addWithdraw,
  getAllWithdrawsFromDB,
  getConsultWithdrawsFromDB,
  getAWithdrawFromDB,
  updateWithdrawFromDB,
}

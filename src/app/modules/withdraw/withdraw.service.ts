import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import QueryBuilder from '../../builder/QueryBuilder'
import { Withdraw } from './withdraw.model'
import { TWithdrawStatus, WITHDRAW_STATUS } from './withdraw.constant'
import { sendWithdrawNotify } from './withdraw.utils'
import { User } from '../user/user.model'
import mongoose from 'mongoose'
import { Booking } from '../booking/booking.models'
import { Payment } from '../payment/payment.model'

// Test purpose-এ withdraw request তৈরি
const addWithdraw = async (payload: { booking: string }, userId: string) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Validate user
    const user = await User.findById(userId);
    if (!user || user.isDeleted) {
      throw new AppError(httpStatus.FORBIDDEN, 'Only consultants can create withdrawal requests');
    }

    // check booking
    const booking = await Booking.findOne({
      _id: payload.booking,
      consult: userId,
      isDeleted: false,
    }).session(session);
    if (!booking) {
      throw new AppError(httpStatus.NOT_FOUND, 'Booking not found or not yours');
    }

    // Booking of payment found
    const payment = await Payment.findOne({
      booking: booking._id,
      isPaid: true,
      isDeleted: false,
    }).session(session);
    if (!payment) {
      throw new AppError(httpStatus.BAD_REQUEST, 'No paid payment found for this booking');
    }

    // consultAmount find
    const consultAmount = payment.consultAmount || payment.amount;
    if (consultAmount <= 0) {
      throw new AppError(httpStatus.BAD_REQUEST, 'No amount available for withdrawal');
    }

    // check (duplicate prevent)
    const existingWithdraw = await Withdraw.findOne({
      booking: booking._id,
      user: userId,
      isDeleted: false,
    }).session(session);

    if (existingWithdraw) {
      throw new AppError(httpStatus.CONFLICT, 'Withdrawal request already exists for this booking');
    }

    // new withdraw request check
    const [withdraw] = await Withdraw.create(
      [{
        user: userId,
        booking: booking._id,
        amount: consultAmount,
        status: WITHDRAW_STATUS.proceed,
      }],
      { session },
    );

    await session.commitTransaction();

    return {
      withdraw,
      message: `Withdrawal request of $${consultAmount} created successfully (pending)`,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

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
        {
          path: 'slot',
          select: 'date time',
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
  payload: { status: TWithdrawStatus },
) => {
  const { status } = payload

  const withdraw = await Withdraw.findById(id)
  if (!withdraw) {
    throw new AppError(httpStatus.NOT_FOUND, 'Withdraw not found')
  }

  const result = await Withdraw.findByIdAndUpdate(
    id,
    { status },
    {
      new: true,
    },
  )
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Withdraw status not updated')
  }

  // send notify to user
  const user = await User.findById(withdraw.user)
  if (user) {
    await sendWithdrawNotify(status, withdraw, user)
  }

  return result
}

export const WithdrawService = {
  addWithdraw,
  getAllWithdrawsFromDB,
  getAWithdrawFromDB,
  updateWithdrawFromDB,
}

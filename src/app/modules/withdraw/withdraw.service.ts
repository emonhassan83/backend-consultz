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
import {
  sendWithdrawCompletedEmail,
  sendWithdrawStatusChangeEmail,
} from '../../utils/emailNotify'
import dayjs from 'dayjs'
import {
  PAYMENT_SETTLEMENT_STATUS,
  PAYMENT_STATUS as PAYMENT_COLLECTION_STATUS,
} from '../payment/payment.constant'
import { WithdrawManualHoldLog } from '../withdrawManualHoldLog/withdrawManualHoldLog.model'

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
        'Only experts can create withdrawal requests',
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
      message: `Withdrawal request of £${consultAmount} created successfully (pending)`,
    }
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    session.endSession()
  }
}

const getAllWithdrawsFromDB = async (query: Record<string, unknown>) => {
  const page = Number(query.page) || 1
  const limit = Number(query.limit) || 10
  const skip = (page - 1) * limit
  const matchStage: Record<string, any> = { isDeleted: false }

  if (query.status) {
    matchStage.status = query.status
  }

  const startDate = query.startDate || query.dateFrom
  const endDate = query.endDate || query.dateTo

  if (startDate || endDate) {
    matchStage.createdAt = {}
    if (startDate) {
      matchStage.createdAt.$gte = dayjs(String(startDate)).startOf('day').toDate()
    }
    if (endDate) {
      matchStage.createdAt.$lte = dayjs(String(endDate)).endOf('day').toDate()
    }
  }

  const searchTerm = String(query.searchTerm || '').trim()
  const searchRegex = searchTerm ? new RegExp(searchTerm, 'i') : null

  const sortField = String(query.sort || '-createdAt')
  const sortDirection = sortField.startsWith('-') ? -1 : 1
  const sortKey = sortField.replace(/^-/, '') || 'createdAt'

  const pipeline: any[] = [
    { $match: matchStage },
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'bookings',
        localField: 'booking',
        foreignField: '_id',
        as: 'booking',
      },
    },
    { $unwind: { path: '$booking', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        withdrawObjectId: { $toString: '$_id' },
        bookingObjectId: { $toString: '$booking._id' },
      },
    },
  ]

  if (searchRegex) {
    pipeline.push({
      $match: {
        $or: [
          { id: searchRegex },
          { withdrawObjectId: searchRegex },
          { 'booking.id': searchRegex },
          { bookingObjectId: searchRegex },
          { 'user.firstName': searchRegex },
          { 'user.lastName': searchRegex },
          { 'user.email': searchRegex },
        ],
      },
    })
  }

  pipeline.push(
    {
      $project: {
        id: 1,
        user: {
          _id: '$user._id',
          firstName: '$user.firstName',
          lastName: '$user.lastName',
          email: '$user.email',
          photoUrl: '$user.photoUrl',
        },
        booking: {
          _id: '$booking._id',
          id: { $ifNull: ['$booking.id', null] },
          sessionType: '$booking.sessionType',
          date: '$booking.date',
          startTime: '$booking.startTime',
          endTime: '$booking.endTime',
          localDate: '$booking.localDate',
          localStartTime: '$booking.localStartTime',
          localEndTime: '$booking.localEndTime',
          status: '$booking.status',
          paymentStatus: '$booking.paymentStatus',
        },
        amount: 1,
        stripeTransferId: 1,
        status: 1,
        proceedAt: 1,
        isDeleted: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
    { $sort: { [sortKey]: sortDirection } },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        meta: [{ $count: 'total' }],
      },
    },
  )

  const aggregateResult = await Withdraw.aggregate(pipeline)
  const result = aggregateResult[0]?.data || []
  const total = aggregateResult[0]?.meta?.[0]?.total || 0
  const meta = {
    page,
    limit,
    total,
    totalPage: Math.ceil(total / limit),
  }

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
          select: 'id sessionType user',
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

  const manualHoldLogs = await WithdrawManualHoldLog.find({
    withdraw: result._id,
  })
    .populate({ path: 'admin', select: '_id firstName lastName email photoUrl' })
    .populate({ path: 'payment', select: '_id id transactionId settlementStatus isManualHold' })
    .sort({ createdAt: -1 })
    .lean()

  return {
    ...(result.toObject ? result.toObject() : result),
    manualHoldLogs,
  }
}

const manualHoldWithdrawFromDB = async (
  withdrawId: string,
  payload: { reason: string },
  adminId: string,
) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const withdraw = await Withdraw.findById(withdrawId).session(session)
    if (!withdraw || withdraw.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Withdraw not found')
    }

    if (withdraw.status === WITHDRAW_STATUS.completed) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Completed withdrawals cannot be held',
      )
    }

    const [payment, consultant] = await Promise.all([
      Payment.findOne({ booking: withdraw.booking, isDeleted: false }).session(
        session,
      ),
      User.findById(withdraw.user).session(session),
    ])

    if (!payment) {
      throw new AppError(httpStatus.NOT_FOUND, 'Payment not found')
    }

    if (!consultant || consultant.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Consultant not found')
    }

    if (
      payment.status === PAYMENT_COLLECTION_STATUS.refunded ||
      payment.status === PAYMENT_COLLECTION_STATUS.cancelled ||
      payment.settlementStatus === PAYMENT_SETTLEMENT_STATUS.refunded
    ) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Refunded or cancelled payments cannot be held',
      )
    }

    if (payment.isManualHold && withdraw.status === WITHDRAW_STATUS.hold) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Withdraw is already on manual hold')
    }

    const previousWithdrawStatus = withdraw.status
    const previousSettlementStatus = payment.settlementStatus

    withdraw.status = WITHDRAW_STATUS.hold
    withdraw.proceedAt = undefined
    payment.isManualHold = true
    payment.settlementStatus = PAYMENT_SETTLEMENT_STATUS.held

    await Promise.all([withdraw.save({ session }), payment.save({ session })])

    const [auditLog] = await (WithdrawManualHoldLog as any).create(
      [
        {
          withdraw: withdraw._id,
          payment: payment._id,
          booking: withdraw.booking,
          admin: adminId,
          action: 'manual_hold',
          reason: payload.reason.trim(),
          previousWithdrawStatus,
          newWithdrawStatus: withdraw.status,
          previousSettlementStatus,
          newSettlementStatus: payment.settlementStatus,
        },
      ],
      { session },
    )

    await session.commitTransaction()

    await Promise.allSettled([
      sendWithdrawNotify(WITHDRAW_STATUS.hold, withdraw, consultant, payload.reason),
      consultant.emailNotify?.payment
        ? sendWithdrawStatusChangeEmail(consultant, withdraw, WITHDRAW_STATUS.hold)
        : Promise.resolve(),
    ])

    return { withdraw, auditLog }
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction()
    }
    throw error
  } finally {
    session.endSession()
  }
}

const manualReleaseWithdrawFromDB = async (
  withdrawId: string,
  payload: { reason: string },
  adminId: string,
) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const withdraw = await Withdraw.findById(withdrawId).session(session)
    if (!withdraw || withdraw.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Withdraw not found')
    }

    if (withdraw.status === WITHDRAW_STATUS.completed) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Completed withdrawals cannot be released',
      )
    }

    const [payment, consultant, latestHoldLog] = await Promise.all([
      Payment.findOne({ booking: withdraw.booking, isDeleted: false }).session(
        session,
      ),
      User.findById(withdraw.user).session(session),
      WithdrawManualHoldLog.findOne({
        withdraw: withdraw._id,
        action: 'manual_hold',
      })
        .sort({ createdAt: -1 })
        .session(session),
    ])

    if (!payment) {
      throw new AppError(httpStatus.NOT_FOUND, 'Payment not found')
    }

    if (!consultant || consultant.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Consultant not found')
    }

    if (!payment.isManualHold) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Payment is not on manual hold')
    }

    const previousWithdrawStatus = withdraw.status
    const previousSettlementStatus = payment.settlementStatus
    let newSettlementStatus: PAYMENT_SETTLEMENT_STATUS =
      (latestHoldLog?.previousSettlementStatus as PAYMENT_SETTLEMENT_STATUS) ||
      PAYMENT_SETTLEMENT_STATUS.withdrawn

    if (
      newSettlementStatus === PAYMENT_SETTLEMENT_STATUS.held &&
      payment.holdUntil &&
      payment.holdUntil <= new Date()
    ) {
      newSettlementStatus = PAYMENT_SETTLEMENT_STATUS.cleared
      payment.clearedAt = new Date()
    }

    withdraw.status = WITHDRAW_STATUS.proceed
    withdraw.proceedAt = new Date()
    payment.isManualHold = false
    payment.settlementStatus = newSettlementStatus

    await Promise.all([withdraw.save({ session }), payment.save({ session })])

    const [auditLog] = await (WithdrawManualHoldLog as any).create(
      [
        {
          withdraw: withdraw._id,
          payment: payment._id,
          booking: withdraw.booking,
          admin: adminId,
          action: 'manual_release',
          reason: payload.reason.trim(),
          previousWithdrawStatus,
          newWithdrawStatus: withdraw.status,
          previousSettlementStatus,
          newSettlementStatus,
        },
      ],
      { session },
    )

    await session.commitTransaction()

    await Promise.allSettled([
      sendWithdrawNotify(WITHDRAW_STATUS.proceed, withdraw, consultant, payload.reason),
      consultant.emailNotify?.payment
        ? sendWithdrawStatusChangeEmail(consultant, withdraw, WITHDRAW_STATUS.proceed)
        : Promise.resolve(),
    ])

    return { withdraw, auditLog }
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction()
    }
    throw error
  } finally {
    session.endSession()
  }
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

    const consultant = await User.findById(withdraw.user).session(session);
    const booking = await Booking.findById(withdraw.booking)
      .populate('user')
      .session(session);

    // Optional: Log admin action (if you have AuditLog model)
    // await AuditLog.create({ action: 'update_withdraw', adminId, withdrawId: id, oldStatus: currentStatus, newStatus: status, note });

    await session.commitTransaction();

    if (consultant) {
      await sendWithdrawNotify(status, withdraw, consultant, note).catch((err) =>
        console.error(`Withdraw notify failed for consultant ${consultant._id}:`, err),
      );

      if (status === WITHDRAW_STATUS.completed) {
        const booker = booking?.user as any;

        if (booker && consultant.emailNotify?.payment) {
          await sendWithdrawCompletedEmail(
            consultant,
            withdraw,
            booking as any,
            booker,
          ).catch((err) =>
            console.error(`Withdraw email failed for consultant ${consultant._id}:`, err),
          );
        }
      } else if (consultant.emailNotify?.payment) {
        await sendWithdrawStatusChangeEmail(consultant, withdraw, status).catch((err) =>
          console.error(`Withdraw status email failed for consultant ${consultant._id}:`, err),
        );
      }
    }

    return withdraw;
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
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
  manualHoldWithdrawFromDB,
  manualReleaseWithdrawFromDB,
  updateWithdrawFromDB,
}

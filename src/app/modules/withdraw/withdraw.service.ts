import httpStatus from 'http-status'
import AppError from '../../errors/AppError'
import QueryBuilder from '../../builder/QueryBuilder'
import { Withdraw } from './withdraw.model'
import { TWithdrawStatus, WITHDRAW_STATUS } from './withdraw.constant'
import { sendWithdrawNotify } from './withdraw.utils'
import { User } from '../user/user.model'
import cron from 'node-cron'
import mongoose from 'mongoose'
import { Contents } from '../contents/contents.models'
import { Booking } from '../booking/booking.models'
import dayjs from 'dayjs'
import StripeService from '../../class/stripe/stripe'

// Transfer Job Started at 12:00 AM UK time
export const transferAmountCron = () => {
  cron.schedule(
    '0 0 * * *',
    async () => {
      console.log('Daily Withdraw Transfer Job Started at 12:00 AM UK time')

      const session = await mongoose.startSession()
      session.startTransaction()

      try {
        // 1. From Contents to paymentHoldDays
        const contents = await Contents.findOne({ isDeleted: false }).lean()
        const holdDays = contents?.paymentHoldDays || 7 // default fallback

        // 2. All proceed withdraw find
        const pendingWithdraws = await Withdraw.find({
          status: WITHDRAW_STATUS.proceed,
          isDeleted: false,
        }).session(session)

        for (const withdraw of pendingWithdraws) {
          // 3. find booking
          const booking = await Booking.findById(withdraw.booking).session(
            session,
          )
          if (!booking) continue

          // 4. Withdraw request holdDays calculate
          const requestDate = dayjs(withdraw.createdAt)
          const holdEndDate = requestDate.add(holdDays, 'day')

          if (dayjs().isAfter(holdEndDate, 'day')) {
            // 5. consultant Stripe Connected Account check
            const consultant = await User.findById(booking.consult).session(
              session,
            )
            if (!consultant || !consultant.stripeAccountId) {
              console.warn(
                `No Stripe account for consultant ${booking.consult}`,
              )
              continue
            }

            // 6. Stripe-transfer
            try {
              const transfer = await StripeService.transfer(
                withdraw.amount * 100, // cents-এ
                consultant.stripeAccountId,
                'usd',
              )

              // 7. Withdraw update
              withdraw.status = WITHDRAW_STATUS.completed
              withdraw.stripeTransferId = transfer.id
              await withdraw.save({ session })

              // 8. sent notification
              await sendWithdrawNotify(
                WITHDRAW_STATUS.completed,
                withdraw,
                consultant,
              )

              console.log(
                `Transferred $${withdraw.amount} to ${consultant.stripeAccountId}`,
              )
            } catch (transferError: any) {
              console.error(
                `Transfer failed for withdraw ${withdraw._id}:`,
                transferError.message,
              )
              // optional: status = 'failed'
            }
          }
        }

        await session.commitTransaction()
        console.log('Daily Withdraw Transfer Job Completed')
      } catch (error) {
        await session.abortTransaction()
        console.error('Daily Withdraw Transfer Job Failed:', error)
      } finally {
        session.endSession()
      }
    },
    {
      timezone: 'Europe/London', // UK time (BST/GMT)
    },
  )
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
  getAllWithdrawsFromDB,
  getAWithdrawFromDB,
  updateWithdrawFromDB,
}

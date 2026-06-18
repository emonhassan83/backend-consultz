import dayjs from 'dayjs'
import mongoose from 'mongoose'
import { Booking } from '../modules/booking/booking.models'
import { User } from '../modules/user/user.model'
import { Withdraw } from '../modules/withdraw/withdraw.model'
import { WITHDRAW_STATUS } from '../modules/withdraw/withdraw.constant'
import StripeService from '../class/stripe/stripe'
import { sendWithdrawNotify } from '../modules/withdraw/withdraw.utils'
import emailSender from '../utils/emailSender'
import { sendWithdrawCompletedEmail } from '../utils/emailNotify'
import { sendNotification } from '../utils/sentNotification'
import { modeType } from '../modules/notification/notification.interface'

export const dailyWithdrawTransferJob = async (): Promise<void> => {
  console.log('Daily Withdraw Transfer Job Started at 12:00 AM UK time')
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const pendingWithdraws = await Withdraw.find({
      status: { $in: [WITHDRAW_STATUS.proceed, WITHDRAW_STATUS.hold] },
      isDeleted: false,
      proceedAt: { $exists: true },
    }).session(session)

    console.log(`Found ${pendingWithdraws.length} pending withdrawals to process`)

    const postCommitTasks: (() => Promise<void>)[] = []

    for (const withdraw of pendingWithdraws) {
      if (
        withdraw.status === WITHDRAW_STATUS.proceed &&
        !dayjs().isAfter(withdraw.proceedAt)
      ) {
        console.log(`Withdraw ${withdraw._id} not yet eligible (proceedAt: ${withdraw.proceedAt})`)
        continue
      }

      const booking = await Booking.findById(withdraw.booking)
        .populate('slot user')
        .session(session)

      if (!booking) {
        console.warn(`Booking not found for withdraw ${withdraw._id}`)
        continue
      }

      const consultant = await User.findById(booking.consult).session(session)

      if (!consultant) {
        console.warn(`Consultant not found for booking ${booking._id}`)
        continue
      }

      if (!consultant.stripeAccountId) {
        if (withdraw.status !== WITHDRAW_STATUS.hold) {
          withdraw.status = WITHDRAW_STATUS.hold
          await withdraw.save({ session })
        }

        console.warn(`Still no Stripe account for consultant ${consultant._id} — withdraw ${withdraw._id} remains on hold`)

        postCommitTasks.push(async () => {
          if (consultant.fcmToken && consultant.pushNotify?.payment) {
            await sendNotification([consultant.fcmToken], {
              receiver: consultant._id,
              message: 'Action Required: Connect Your Stripe Account',
              description: 'Your withdrawal is on hold. Please connect your Stripe account to receive your earnings.',
              reference: withdraw._id,
              modelType: modeType.Payment,
            })
          }

          if (consultant.email && consultant.emailNotify?.payment) {
            await emailSender(
              consultant.email,
              'Withdrawal On Hold – Stripe Connection Required',
              `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                  <h2 style="color: #333;">Withdrawal On Hold</h2>
                  <p style="color: #555;">Dear ${consultant.firstName},</p>
                  <p style="color: #555;">Your withdrawal request of <strong>$${withdraw.amount.toFixed(2)}</strong> is still on hold.</p>
                  <p style="color: #555;">Please connect your Stripe account through the Consultz app to receive your earnings.</p>
                  <ul style="color: #555; line-height: 1.6;">
                    <li><strong>Amount:</strong> $${withdraw.amount.toFixed(2)}</li>
                    <li><strong>Status:</strong> On Hold</li>
                    <li><strong>Reason:</strong> Stripe account not connected</li>
                  </ul>
                  <p style="color: #555;">Best regards,<br/><strong>Consultz Team</strong></p>
                  <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #999;">
                    <p>© ${new Date().getFullYear()} Consultz App. All rights reserved.</p>
                  </div>
                </div>
              `,
            ).catch((err) =>
              console.error(`Hold email failed for consultant ${consultant._id}:`, err),
            )
          }
        })

        continue
      }

      try {
        console.log(`Processing withdraw ${withdraw._id} (was: ${withdraw.status}) — Stripe now connected`)

        const transfer = await StripeService.transfer(
          withdraw.amount * 100,
          consultant.stripeAccountId,
          'usd',
        )

        withdraw.status = WITHDRAW_STATUS.completed
        withdraw.stripeTransferId = transfer.id
        await withdraw.save({ session })

        console.log(`Transferred $${withdraw.amount} to ${consultant.stripeAccountId} for withdraw ${withdraw._id}`)

        const booker = await User.findById(booking.user).session(session)

        postCommitTasks.push(async () => {
          await sendWithdrawNotify(WITHDRAW_STATUS.completed, withdraw, consultant)
        })

        if (booker && consultant.emailNotify?.payment) {
          postCommitTasks.push(async () => {
            await sendWithdrawCompletedEmail(consultant, withdraw, booking, booker)
          })
        }
      } catch (transferError: any) {
        console.error(`Transfer failed for withdraw ${withdraw._id}:`, transferError.message)
      }
    }

    await session.commitTransaction()
    console.log('Daily Withdraw Transfer Job Completed')

    await Promise.allSettled(postCommitTasks.map((task) => task()))
  } catch (error) {
    await session.abortTransaction()
    console.error('Daily Withdraw Transfer Job Failed:', error)
  } finally {
    session.endSession()
  }
}
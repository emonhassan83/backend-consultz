import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import mongoose from 'mongoose'
import { Booking } from '../modules/booking/booking.models'
import { Payment } from '../modules/payment/payment.model'
import { User } from '../modules/user/user.model'
import { Withdraw } from '../modules/withdraw/withdraw.model'
import { WITHDRAW_STATUS } from '../modules/withdraw/withdraw.constant'
import StripeService from '../class/stripe/stripe'
import { sendWithdrawNotify } from '../modules/withdraw/withdraw.utils'
import emailSender from '../utils/emailSender'
import { sendWithdrawCompletedEmail } from '../utils/emailNotify'
import { sendNotification } from '../utils/sentNotification'
import { modeType } from '../modules/notification/notification.interface'
import { withdrawOnHoldTemplate } from '../templates/withdraw.templates'

dayjs.extend(utc)
dayjs.extend(timezone)

export const dailyWithdrawTransferJob = async (): Promise<void> => {
  console.log('Daily Withdraw Transfer Job Started')

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // Fetch all withdrawals that are either pending or on hold
    const pendingWithdraws = await Withdraw.find({
      status: { $in: [WITHDRAW_STATUS.proceed, WITHDRAW_STATUS.hold] },
      isDeleted: false,
      proceedAt: { $exists: true },
    }).session(session)

    console.log(`Found ${pendingWithdraws.length} withdrawals to process`)

    // Queue tasks to run after session commit (email/push must not block transaction)
    const postCommitTasks: (() => Promise<void>)[] = []

    for (const withdraw of pendingWithdraws) {
      // For "proceed" status — check if proceedAt has passed in UTC
      // For "hold" status — skip this check (proceedAt already passed, Stripe was missing then)
      if (
        withdraw.status === WITHDRAW_STATUS.proceed &&
        !dayjs.utc().isAfter(dayjs.utc(withdraw.proceedAt))
      ) {
        console.log(
          `Withdraw ${withdraw._id} not yet eligible (proceedAt: ${withdraw.proceedAt})`,
        )
        continue
      }

      // Fetch booking with user (booker) populated. Dynamic bookings no longer
      // have a Booking.slot schema path.
      const booking = await Booking.findById(withdraw.booking)
        .populate('user')
        .session(session)

      if (!booking) {
        console.warn(`Booking not found for withdraw ${withdraw._id}`)
        continue
      }

      const payment = await Payment.findOne({
        booking: withdraw.booking,
        isDeleted: false,
      })
        .select('isManualHold')
        .session(session)

      if (payment?.isManualHold) {
        console.log(`Withdraw ${withdraw._id} is manually held; skipping transfer.`)
        continue
      }

      // Fetch consultant separately for fresh data (not from booking populate)
      const consultant = await User.findById(booking.consult).session(session)

      if (!consultant) {
        console.warn(`Consultant not found for booking ${booking._id}`)
        continue
      }

      // Stripe account not connected — put on hold and notify
      if (!consultant.stripeAccountId) {
        if (withdraw.status !== WITHDRAW_STATUS.hold) {
          withdraw.status = WITHDRAW_STATUS.hold
          await withdraw.save({ session })
        }

        console.warn(
          `No Stripe account for consultant ${consultant._id} — withdraw ${withdraw._id} on hold`,
        )

        // Capture for closure — avoid stale reference in async task
        const capturedConsultant = consultant
        const capturedWithdraw = withdraw

        postCommitTasks.push(async () => {
          // Push notification to consultant
          if (capturedConsultant.fcmToken && capturedConsultant.pushNotify?.payment) {
            await sendNotification([capturedConsultant.fcmToken], {
              receiver: capturedConsultant._id,
              message: 'Action Required: Connect Your Stripe Account',
              description:
                'Your withdrawal is on hold. Please connect your Stripe account to receive your earnings.',
              reference: capturedWithdraw._id,
              modelType: modeType.Payment,
            }).catch((err) =>
              console.error(`Push failed for consultant ${capturedConsultant._id}:`, err),
            )
          }

          // ✅ Email via template — no inline HTML in job files
          if (capturedConsultant.email && capturedConsultant.emailNotify?.payment) {
            await emailSender(
              capturedConsultant.email,
              'Withdrawal On Hold – Stripe Connection Required',
              withdrawOnHoldTemplate(
                capturedConsultant as any,
                capturedWithdraw as any,
              ),
            ).catch((err) =>
              console.error(
                `Hold email failed for consultant ${capturedConsultant._id}:`,
                err,
              ),
            )
          }
        })

        continue
      }

      // Stripe is connected — attempt transfer
      try {
        console.log(
          `Processing withdraw ${withdraw._id} (status: ${withdraw.status}) — Stripe connected`,
        )

        const transfer = await StripeService.transfer(
          withdraw.amount * 100,
          consultant.stripeAccountId,
          'gbp',
        )

        // Mark withdrawal as completed
        withdraw.status = WITHDRAW_STATUS.completed
        withdraw.stripeTransferId = transfer.id
        await withdraw.save({ session })

        console.log(
          `Transferred £${withdraw.amount} to ${consultant.stripeAccountId} for withdraw ${withdraw._id}`,
        )

        const booker = booking.user as any

        // Capture for closures
        const capturedConsultant = consultant
        const capturedWithdraw = withdraw
        const capturedBooking = booking
        const capturedBooker = booker

        // Queue push notification (post-commit)
        postCommitTasks.push(async () => {
          await sendWithdrawNotify(
            WITHDRAW_STATUS.completed,
            capturedWithdraw,
            capturedConsultant,
          ).catch((err) =>
            console.error(
              `Withdraw notify failed for consultant ${capturedConsultant._id}:`,
              err,
            ),
          )
        })

        // Queue completion email (post-commit)
        if (capturedBooker && capturedConsultant.emailNotify?.payment) {
          postCommitTasks.push(async () => {
            await sendWithdrawCompletedEmail(
              capturedConsultant,
              capturedWithdraw,
              capturedBooking,
              capturedBooker,
            ).catch((err) =>
              console.error(
                `Withdraw email failed for consultant ${capturedConsultant._id}:`,
                err,
              ),
            )
          })
        }
      } catch (transferError: any) {
        console.error(
          `Stripe transfer failed for withdraw ${withdraw._id}:`,
          transferError.message,
        )
        // Do not throw — continue processing remaining withdrawals
      }
    }

    await session.commitTransaction()
    console.log('Daily Withdraw Transfer Job Completed')

    // Fire all queued push/email tasks after commit
    await Promise.allSettled(postCommitTasks.map((task) => task()))
  } catch (error) {
    await session.abortTransaction()
    console.error('Daily Withdraw Transfer Job Failed:', error)
  } finally {
    session.endSession()
  }
}

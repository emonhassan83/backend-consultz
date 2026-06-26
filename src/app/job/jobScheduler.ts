import cron from 'node-cron'
import { dailyWithdrawTransferJob } from './dailyWithdrawTransfer.job'
import { dailyReviewReminderJob } from './dailyReviewReminder.job'
import { expertReliabilityRewardJob } from './expertReliabilityReward.job'
import { expertResponseTimeRewardJob } from './expertResponseTimeReward.job'
import { timeSensitiveNotificationsJob } from './timeSensitiveNotifications.job'
import { autoMarkNotRespondedJob } from './autoMarkNotResponded.job'
import { sessionCompleteCheckJob } from './sessionCompleteCheck.job'

// All cron schedules run in UTC — booking-level timezones are handled inside each job
const CRON_TIMEZONE = 'UTC'

// Running-flag guards prevent overlapping executions if a job runs longer than its interval
let withdrawJobRunning = false
let reviewReminderJobRunning = false
let reliabilityRewardJobRunning = false
let responseTimeRewardJobRunning = false
let timeSensitiveJobRunning = false
let notRespondedJobRunning = false
let sessionCompleteJobRunning = false

export const initializeCronJobs = () => {
  console.log('🕒 Starting background jobs...')

  // 1. Daily withdraw transfer — runs at midnight UTC
  // Processes all pending/hold withdrawals and transfers via Stripe
  cron.schedule(
    '0 0 * * *',
    async () => {
      if (withdrawJobRunning) return
      withdrawJobRunning = true
      try {
        await dailyWithdrawTransferJob()
      } catch (err) {
        console.error('❌ Withdraw transfer job error:', err)
      } finally {
        withdrawJobRunning = false
      }
    },
    { timezone: CRON_TIMEZONE },
  )

  // 2. Daily review reminder — runs at midnight UTC
  // Reminds users to leave a review for sessions completed 24–48 hours ago
  cron.schedule(
    '0 0 * * *',
    async () => {
      if (reviewReminderJobRunning) return
      reviewReminderJobRunning = true
      try {
        await dailyReviewReminderJob()
      } catch (err) {
        console.error('❌ Review reminder job error:', err)
      } finally {
        reviewReminderJobRunning = false
      }
    },
    { timezone: CRON_TIMEZONE },
  )

  // 3. Expert reliability reward — runs at midnight UTC
  // Awards 300 points to experts with zero no-shows in the last 30 days
  cron.schedule(
    '0 0 * * *',
    async () => {
      if (reliabilityRewardJobRunning) return
      reliabilityRewardJobRunning = true
      try {
        await expertReliabilityRewardJob()
      } catch (err) {
        console.error('❌ Reliability reward job error:', err)
      } finally {
        reliabilityRewardJobRunning = false
      }
    },
    { timezone: CRON_TIMEZONE },
  )

  // 4. Expert response time reward — runs every Sunday at midnight UTC
  // Awards 50 points to experts with 80%+ fast responses this week
  cron.schedule(
    '0 0 * * 0',
    async () => {
      if (responseTimeRewardJobRunning) return
      responseTimeRewardJobRunning = true
      try {
        await expertResponseTimeRewardJob()
      } catch (err) {
        console.error('❌ Response time reward job error:', err)
      } finally {
        responseTimeRewardJobRunning = false
      }
    },
    { timezone: CRON_TIMEZONE },
  )

  // 5. Time-sensitive notifications — runs every 5 minutes
  // Sends 10-min reminders and join-call notifications per booking timezone
  cron.schedule(
    '*/5 * * * *',
    async () => {
      if (timeSensitiveJobRunning) return
      timeSensitiveJobRunning = true
      try {
        await timeSensitiveNotificationsJob()
      } catch (err) {
        console.error('❌ Time-sensitive notifications job error:', err)
      } finally {
        timeSensitiveJobRunning = false
      }
    },
    { timezone: CRON_TIMEZONE },
  )

  // 6. Auto-mark not responded — runs at midnight UTC
  // Marks confirmed bookings as not_responded if 24h has passed (per booking timezone)
  // Also frees the slot and issues a Stripe refund
  cron.schedule(
    '0 0 * * *',
    async () => {
      if (notRespondedJobRunning) return
      notRespondedJobRunning = true
      try {
        await autoMarkNotRespondedJob()
      } catch (err) {
        console.error('❌ Auto-mark not responded job error:', err)
      } finally {
        notRespondedJobRunning = false
      }
    },
    { timezone: CRON_TIMEZONE },
  )

  // 7. Session complete check — runs every minute
  // Auto-completes running bookings whose sessionDuration has elapsed
  // and creates a withdraw request for the expert (fallback for missed socket events)
  cron.schedule(
    '* * * * *',
    async () => {
      if (sessionCompleteJobRunning) return
      sessionCompleteJobRunning = true
      try {
        await sessionCompleteCheckJob()
      } catch (err) {
        console.error('❌ Session complete check job error:', err)
      } finally {
        sessionCompleteJobRunning = false
      }
    },
    { timezone: CRON_TIMEZONE },
  )

  console.log('✅ All background jobs initialized successfully')
}
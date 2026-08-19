import cron from 'node-cron'
import { autoMarkNotRespondedJob } from './autoMarkNotResponded.job'
import { dailyReviewReminderJob } from './dailyReviewReminder.job'
import { dailyWithdrawTransferJob } from './dailyWithdrawTransfer.job'
import { expertReliabilityRewardJob } from './expertReliabilityReward.job'
import { expertResponseTimeRewardJob } from './expertResponseTimeReward.job'
import { paymentSettlementClearJob } from './paymentSettlementClear.job'
import { pendingBookingReminderJob } from './pendingBookingReminder.job'
import { sessionCompleteCheckJob } from './sessionCompleteCheck.job'
import { timeSensitiveNotificationsJob } from './timeSensitiveNotifications.job'

const CRON_TIMEZONE = 'UTC'

let withdrawJobRunning = false
let reviewReminderJobRunning = false
let reliabilityRewardJobRunning = false
let responseTimeRewardJobRunning = false
let timeSensitiveJobRunning = false
let notRespondedJobRunning = false
let sessionCompleteJobRunning = false
let pendingBookingReminderJobRunning = false
let paymentSettlementClearJobRunning = false

const scheduleGuardedJob = (
  schedule: string,
  isRunningGetter: () => boolean,
  setRunning: (value: boolean) => void,
  job: () => Promise<void>,
  errorLabel: string,
) => {
  cron.schedule(
    schedule,
    async () => {
      if (isRunningGetter()) return
      setRunning(true)
      try {
        await job()
      } catch (err) {
        console.error(`${errorLabel}:`, err)
      } finally {
        setRunning(false)
      }
    },
    { timezone: CRON_TIMEZONE },
  )
}

export const initializeCronJobs = () => {
  console.log('Starting background jobs...')

  scheduleGuardedJob(
    '0 0 * * *',
    () => withdrawJobRunning,
    (value) => {
      withdrawJobRunning = value
    },
    dailyWithdrawTransferJob,
    'Withdraw transfer job error',
  )

  scheduleGuardedJob(
    '0 0 * * *',
    () => reviewReminderJobRunning,
    (value) => {
      reviewReminderJobRunning = value
    },
    dailyReviewReminderJob,
    'Review reminder job error',
  )

  scheduleGuardedJob(
    '0 0 * * *',
    () => reliabilityRewardJobRunning,
    (value) => {
      reliabilityRewardJobRunning = value
    },
    expertReliabilityRewardJob,
    'Reliability reward job error',
  )

  scheduleGuardedJob(
    '0 0 * * 0',
    () => responseTimeRewardJobRunning,
    (value) => {
      responseTimeRewardJobRunning = value
    },
    expertResponseTimeRewardJob,
    'Response time reward job error',
  )

  scheduleGuardedJob(
    '* * * * *',
    () => timeSensitiveJobRunning,
    (value) => {
      timeSensitiveJobRunning = value
    },
    timeSensitiveNotificationsJob,
    'Time-sensitive notifications job error',
  )

  scheduleGuardedJob(
    '* * * * *',
    () => notRespondedJobRunning,
    (value) => {
      notRespondedJobRunning = value
    },
    autoMarkNotRespondedJob,
    'Auto-mark not responded job error',
  )

  scheduleGuardedJob(
    '* * * * *',
    () => sessionCompleteJobRunning,
    (value) => {
      sessionCompleteJobRunning = value
    },
    sessionCompleteCheckJob,
    'Session complete check job error',
  )

  scheduleGuardedJob(
    '* * * * *',
    () => pendingBookingReminderJobRunning,
    (value) => {
      pendingBookingReminderJobRunning = value
    },
    pendingBookingReminderJob,
    'Pending booking reminder job error',
  )

  scheduleGuardedJob(
    '* * * * *',
    () => paymentSettlementClearJobRunning,
    (value) => {
      paymentSettlementClearJobRunning = value
    },
    paymentSettlementClearJob,
    'Payment settlement clear job error',
  )

  console.log('All background jobs initialized successfully')
}

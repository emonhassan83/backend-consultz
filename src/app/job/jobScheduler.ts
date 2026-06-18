import cron from 'node-cron'
import { dailyWithdrawTransferJob } from './dailyWithdrawTransfer.job'
import { dailyReviewReminderJob } from './dailyReviewReminder.job'
import { expertReliabilityRewardJob } from './expertReliabilityReward.job'
import { expertResponseTimeRewardJob } from './expertResponseTimeReward.job'
import { timeSensitiveNotificationsJob } from './timeSensitiveNotifications.job'
import { autoMarkNotRespondedJob } from './autoMarkNotResponded.job'

const TIMEZONE = 'Asia/Dhaka'

let withdrawJobRunning = false
let reviewReminderJobRunning = false
let reliabilityRewardJobRunning = false
let responseTimeRewardJobRunning = false
let timeSensitiveJobRunning = false
let notRespondedJobRunning = false

export const initializeCronJobs = () => {
  console.log('🕒 Starting background jobs...')

  // 1. Daily withdraw transfer (midnight)
  cron.schedule('0 0 * * *', async () => {
    if (withdrawJobRunning) return
    withdrawJobRunning = true
    try {
      await dailyWithdrawTransferJob()
    } catch (err) {
      console.error('❌ Withdraw transfer job error:', err)
    } finally {
      withdrawJobRunning = false
    }
  }, { timezone: TIMEZONE })

  // 2. Daily review reminder (midnight)
  cron.schedule('0 0 * * *', async () => {
    if (reviewReminderJobRunning) return
    reviewReminderJobRunning = true
    try {
      await dailyReviewReminderJob()
    } catch (err) {
      console.error('❌ Review reminder job error:', err)
    } finally {
      reviewReminderJobRunning = false
    }
  }, { timezone: TIMEZONE })

  // 3. Expert reliability reward (midnight)
  cron.schedule('0 0 * * *', async () => {
    if (reliabilityRewardJobRunning) return
    reliabilityRewardJobRunning = true
    try {
      await expertReliabilityRewardJob()
    } catch (err) {
      console.error('❌ Reliability reward job error:', err)
    } finally {
      reliabilityRewardJobRunning = false
    }
  }, { timezone: TIMEZONE })

  // 4. Expert response time reward (every Sunday midnight)
  cron.schedule('0 0 * * 0', async () => {
    if (responseTimeRewardJobRunning) return
    responseTimeRewardJobRunning = true
    try {
      await expertResponseTimeRewardJob()
    } catch (err) {
      console.error('❌ Response time reward job error:', err)
    } finally {
      responseTimeRewardJobRunning = false
    }
  }, { timezone: TIMEZONE })

  // 5. Time-sensitive notifications (every 5 min)
  cron.schedule('*/5 * * * *', async () => {
    if (timeSensitiveJobRunning) return
    timeSensitiveJobRunning = true
    try {
      await timeSensitiveNotificationsJob()
    } catch (err) {
      console.error('❌ Time-sensitive notifications job error:', err)
    } finally {
      timeSensitiveJobRunning = false
    }
  }, { timezone: TIMEZONE })

  // 6. Auto-mark not responded (midnight)
  cron.schedule('0 0 * * *', async () => {
    if (notRespondedJobRunning) return
    notRespondedJobRunning = true
    try {
      await autoMarkNotRespondedJob()
    } catch (err) {
      console.error('❌ Auto-mark not responded job error:', err)
    } finally {
      notRespondedJobRunning = false
    }
  }, { timezone: TIMEZONE })

  console.log('✅ All background jobs initialized successfully')
}
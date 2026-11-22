// Pure helpers for post reports (QA #68). No DB imports, so they can be unit tested.
import {
  FEED_MODERATION_STATUS,
  TFeedModerationStatus,
} from '../feed/feed.constant'

type TStatus = TFeedModerationStatus | null | undefined

// Statuses where the post is still visible, so a new report needs admin review
const STILL_VISIBLE: (TStatus)[] = [
  null,
  undefined,
  FEED_MODERATION_STATUS.activate,
  FEED_MODERATION_STATUS.warn_user,
  FEED_MODERATION_STATUS.pending_review,
]

/** Moderation status after a new report. Hidden/removed posts keep theirs. */
export const getStatusAfterReport = (current: TStatus): TStatus =>
  STILL_VISIBLE.includes(current) ? FEED_MODERATION_STATUS.pending_review : current

/** Moderation status after a reporter withdraws their report. */
export const getStatusAfterReportWithdrawn = (
  current: TStatus,
  remainingReports: number,
): TStatus =>
  current === FEED_MODERATION_STATUS.pending_review && remainingReports <= 0
    ? null
    : current

export const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const truncate = (value: unknown, max = 200) => {
  const text = String(value ?? '').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export const buildAdminReportMessage = (params: {
  reporterName: string
  authorName: string
  reason: string
}) => ({
  message: 'New report on a post',
  description: `${params.reporterName} reported ${params.authorName}'s post: "${truncate(params.reason, 150)}"`,
})

/** Recipients for admin report emails: ADMIN_NOTIFY_EMAIL list, else the admins' own emails. */
export const getAdminAlertRecipients = (
  configured: string | null | undefined,
  adminEmails: (string | null | undefined)[],
): string[] => {
  const fromConfig = (configured || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
  const list = fromConfig.length
    ? fromConfig
    : adminEmails.map((e) => (e || '').trim()).filter(Boolean)
  return Array.from(new Set(list.map((e) => e.toLowerCase())))
}

export const FEED_STATUS = {
  active: 'active',
  restrict: 'restrict',
} as const

export const FEED_MODERATION_ACTION = {
  restrict: 'restrict',
  activate: 'activate',
  remove: 'remove',
  warn_user: 'warn_user',
  suspend_user: 'suspend_user',
} as const

// Stored moderation status: an admin action, or pending_review after a
// report (#68). pending_review is not an action, so the moderation endpoint
// still only accepts FEED_MODERATION_ACTION.
export const FEED_MODERATION_STATUS = {
  ...FEED_MODERATION_ACTION,
  pending_review: 'pending_review',
} as const

export type TFeedStatus = keyof typeof FEED_STATUS
export type TFeedModerationStatus = keyof typeof FEED_MODERATION_STATUS
export type TFeedModerationAction = keyof typeof FEED_MODERATION_ACTION

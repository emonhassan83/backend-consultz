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

export type TFeedStatus = keyof typeof FEED_STATUS
export type TFeedModerationAction = keyof typeof FEED_MODERATION_ACTION

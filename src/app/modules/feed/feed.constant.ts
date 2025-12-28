export const FEED_STATUS = {
  active: 'active',
  restrict: 'restrict',
} as const

export type TFeedStatus = keyof typeof FEED_STATUS
export const GENERAL_KEYS = [
  'paymentHoldDays',
  'platformFeePercentage',
  'supportContract',
  'supportEmail',
  'consulteeReschedulingTime',
  'expertReschedulingTime',
  'consulteeCancellationTime',
  'expertCancellationTime',
] as const

export const LEGACY_GENERAL_KEY_MAP = {
  reschedulingTime: 'consulteeReschedulingTime',
  cancellationTime: 'consulteeCancellationTime',
} as const

export const DEFAULT_GENERAL_CONTENTS: Partial<
  Record<(typeof GENERAL_KEYS)[number], unknown>
> = {
  paymentHoldDays: 7,
  platformFeePercentage: 20,
  consulteeReschedulingTime: 60,
  expertReschedulingTime: 60,
  consulteeCancellationTime: 60,
  expertCancellationTime: 60,
}

export const ALLOWED_KEYS = [
  ...GENERAL_KEYS,
  ...Object.keys(LEGACY_GENERAL_KEY_MAP),
  'tramsAndCondition',
  'privacyAndPolicy',
] as const

export const POLICY_TIME_KEYS = [
  'consulteeReschedulingTime',
  'expertReschedulingTime',
  'consulteeCancellationTime',
  'expertCancellationTime',
] as const

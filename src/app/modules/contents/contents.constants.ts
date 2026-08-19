export const GENERAL_KEYS = [
  'paymentHoldDays',
  "platformFeePercentage",
  'supportContract',
  'supportEmail',
  'reschedulingTime',
  'cancellationTime',
] as const;

export const DEFAULT_GENERAL_CONTENTS: Partial<Record<(typeof GENERAL_KEYS)[number], unknown>> = {
  paymentHoldDays: 7,
  platformFeePercentage: 20,
  reschedulingTime: 60,
  cancellationTime: 60,
}

export const ALLOWED_KEYS = [
  ...GENERAL_KEYS,
  'tramsAndCondition',
  'privacyAndPolicy',
] as const;

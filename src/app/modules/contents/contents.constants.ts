export const GENERAL_KEYS = [
  'paymentHoldDays',
  "platformFeePercentage",
  'supportContract',
  'supportEmail',
] as const;

export const ALLOWED_KEYS = [
  ...GENERAL_KEYS,
  'tramsAndCondition',
  'privacyAndPolicy',
] as const;

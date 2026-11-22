export const USER_ROLE = {
  admin: 'admin',
  expert: 'expert',
  consult: 'consult',
} as const

export const DAY_MAP = {
  sun: 'sun',
  mon: 'mon',
  tue: 'tue',
  wed: 'wed',
  thu: 'thu',
  fri: 'fri',
  sat: 'sat',
} as const

export const REGISTER_WITH = {
  google: 'google',
  apple: 'apple',
  linkedin: 'linkedin',
  credentials: 'credentials',
} as const

// Minimum age for every account (consultee and expert) — QA #5
export const MIN_AGE = 18
export const MAX_AGE = 120

// Expert intro video (QA #31). Duration is checked in the app; the backend has no ffprobe.
export const INTRO_VIDEO_MAX_MB = 50
export const INTRO_VIDEO_MAX_SECONDS = 120
export const INTRO_VIDEO_MIME_TYPES: readonly string[] = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
]

export const USER_STATUS = {
  pending: 'pending',
  active: 'active',
  warning: 'warning',
  blocked: 'blocked',
} as const

export const registerWith = [
  REGISTER_WITH.google,
  REGISTER_WITH.apple,
  REGISTER_WITH.credentials,
]

export const DEVICE_TYPE = {
  android: 'android',
  ios: 'ios',
} as const

export type TDaysMap = keyof typeof DAY_MAP
export type TRegisterWith = keyof typeof REGISTER_WITH
export type TUserRole = keyof typeof USER_ROLE
export type TUserStatus = keyof typeof USER_STATUS
export type TDeviceType = keyof typeof DEVICE_TYPE

export const UserSearchableFields = ['name']

// Property & Real Estate Related category
export const INVESTMENT_SKILLS = [
  'Real Estate',
  'Property Law',
  'Investment',
  'Real Estate Development',
  'Buy-to-Let Strategy',
  'HMO Management',
  'Rent-to-Rent',
  'Property Sourcing',
  'Property Negotiation',
  'Deal Packaging',
  'Property Lead Generation',
  'Investor Marketing',
  'Property Systems',
  'Real Estate Marketing',
]

export const PROPERTY_SKILLS = [
  'Property Strategy & Portfolio',
  'Deal Making',
  'Rental Strategies',
  'Finance & Funding',
  'Joint Ventures & Partnerships',
  'Property Business Growth',
  'Property Marketing & Lead Generation',
]

// Fields PUT /users/update-profile must never set (mass assignment). Each has
// its own flow (OTP, vat-info, admin, points, ...) or is system-managed.
// A deny-list, not an allow-list: the app also sets fields such as
// isProfileSetup through this endpoint.
export const PROFILE_PROTECTED_FIELDS = [
  '_id',
  'id',
  'role',
  'status',
  'registerWith',
  'isDeleted',
  'expireAt',
  'email',
  'pendingEmail',
  'phoneNumber',
  'pendingPhoneNumber',
  'password',
  'passwordChangedAt',
  'needsPasswordChange',
  'verification',
  'isPhoneOtpVerified',
  'isEmailVerified',
  'termsAcceptedAt',
  'introVideoUrl',
  'points',
  'level',
  'advisingTime',
  'avgRating',
  'ratingCount',
  'balance',
  'isTopExpert',
  'following',
  'followers',
  'referralCode',
  'referredBy',
  'pendingReferralReward',
  'attributedExpert',
  'attributedAt',
  'stripeAccountId',
  'stripeCustomerId',
  'country',
  'vatRegistrationNumber',
  'isVatRegistered',
  'profileCompletionBonusClaimed',
  'socialProofBonusClaimed',
  'lastNoShowBonusAt',
  'warnings',
  'warningCount',
  'lastWarnedAt',
  'lastLogAt',
  'createdAt',
  'updatedAt',
] as const

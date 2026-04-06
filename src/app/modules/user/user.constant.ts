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

export const USER_STATUS = {
  pending: 'pending',
  active: 'active',
  blocked: 'blocked',
} as const

export const registerWith = [
  REGISTER_WITH.google,
  REGISTER_WITH.linkedin,
  REGISTER_WITH.credentials,
]

export type TDaysMap = keyof typeof DAY_MAP
export type TRegisterWith = keyof typeof REGISTER_WITH
export type TUserRole = keyof typeof USER_ROLE
export type TUserStatus = keyof typeof USER_STATUS

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

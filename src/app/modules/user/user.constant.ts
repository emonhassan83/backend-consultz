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
export const PROPERTY_EXPERTISE = [
  'Property Investment & Development',
  'Property Strategy',
  'Buy to Let',
  'HMOs',
  'Rent to Rent',
  'Property Deal Sourcing',
  'Property Negotiation',
  'Deal Structuring',
  'Property Lead Generation',
  'Property Deal Pipelines',
  'Property CRM Setup',
  'Investor Branding',
  'Deal Packaging',
  'Property Social Media Marketing',
]

export const PROPERTY_SKILLS = [
  'Property Investment',
  'Real Estate',
  'Property Law',
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
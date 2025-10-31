export const USER_ROLE = {
  admin: 'admin',
  expert: 'expert',
  consult: 'consult',
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

export type TRegisterWith = keyof typeof REGISTER_WITH
export type TUserRole = keyof typeof USER_ROLE
export type TUserStatus = keyof typeof USER_STATUS

export const UserSearchableFields = ['id', 'name', 'email', 'status']

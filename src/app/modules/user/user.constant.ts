export const USER_ROLE = {
  admin: 'admin',
  expert: 'expert',
  consult: 'consult',
} as const

export const REGISTER_WITH = {
  google: 'google',
  apple: 'apple',
  credentials: 'credentials',
} as const

export const USER_STATUS = {
  pending: 'pending',
  active: 'active',
  blocked: 'blocked',
} as const

export const registerWith = [
  REGISTER_WITH.google,
  REGISTER_WITH.apple,
  REGISTER_WITH.credentials,
]

export type TRegisterWith = keyof typeof USER_ROLE
export type TUserRole = keyof typeof USER_ROLE
export type TUserStatus = keyof typeof USER_STATUS

export const UserSearchableFields = ['id', 'name', 'email', 'status']

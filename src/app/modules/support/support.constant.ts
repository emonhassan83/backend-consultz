export const SUPPORT_STATUS = {
  pending: 'pending',
  respond: 'respond',
} as const

export const AUDIENCE = {
  consult: 'consult',
  expert: 'expert',
} as const

export type TSupportStatus = keyof typeof SUPPORT_STATUS
export type TAudience = keyof typeof AUDIENCE

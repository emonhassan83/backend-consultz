export const SUPPORT_STATUS = {
  pending: 'pending',
  respond: 'respond',
} as const

export type TSupportStatus = keyof typeof SUPPORT_STATUS

export const APPEAL_STATUS = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
} as const

export type TAppealStatus = keyof typeof APPEAL_STATUS

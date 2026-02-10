export const AGORA_ROLE = 'publisher';

export const CALLING_STATUS = {
  PENDING: 'pending',
  RINGING: 'ringing',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  COMPLETED: 'completed',
  MISSED: 'missed',
  CANCELLED: 'cancelled',
} as const;

export type TCallingStatus = keyof typeof CALLING_STATUS;
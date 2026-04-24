export const AGORA_ROLE = 'publisher';

export const CALLING_STATUS = {
  pending: 'pending',
  ringing: 'ringing',
  accepted: 'accepted',
  rejected: 'rejected',
  ended: 'ended',
  completed: 'completed',
  missed: 'missed',
  cancelled: 'cancelled',
} as const;

export type TCallingStatus = keyof typeof CALLING_STATUS;
export const REPORT_STATUS = {
  pending: 'pending',
  approved: 'approved',
  denied: 'denied',
} as const;

export type TReportStatus = keyof typeof REPORT_STATUS;

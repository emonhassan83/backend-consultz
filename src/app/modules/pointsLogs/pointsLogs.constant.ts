export const POINTS_LOG_TYPE = {
  credit: 'credit',
  debit: 'debit',
} as const

export const POINTS_LOG_SOURCE = {
  manual_adjustment: 'manual_adjustment',
  reword: 'reword',
} as const

export type TPointsLogType = keyof typeof POINTS_LOG_TYPE
export type TPointsLogSource = keyof typeof POINTS_LOG_SOURCE

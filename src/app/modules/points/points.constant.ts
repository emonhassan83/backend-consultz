export const POINTS_AUDIENCE = {
  expert: 'expert',
  consult: 'consult',
  both: 'both',
} as const

export type TPointsAudience = keyof typeof POINTS_AUDIENCE

export const POINTS_REWARD_KEY = {
  profile_complete: 'profile_complete',
  stripe_connect: 'stripe_connect',
  phone_verify: 'phone_verify',
  admin_approval: 'admin_approval',
  social_links: 'social_links',
  referral_referrer: 'referral_referrer',
  referral_invitee: 'referral_invitee',
  session_completed: 'session_completed',
  weekly_bonus: 'weekly_bonus',
  five_star_review: 'five_star_review',
  monthly_rating_bonus: 'monthly_rating_bonus',
  no_show_bonus: 'no_show_bonus',
  fast_response_bonus: 'fast_response_bonus',
  expert_link_first_paid: 'expert_link_first_paid',
} as const

export type TPointsRewardKey = keyof typeof POINTS_REWARD_KEY

export type TPointsRuleConditions = {
  minSessions?: number
  minReviews?: number
  windowDays?: number
  responsePct?: number
  responseMinutes?: number
  minRequests?: number
  deferUntil?: string
  onlyDuringAvailability?: boolean
  minAvgRating?: number
}

export type TPointsRuleSeed = {
  key: TPointsRewardKey
  points: number
  enabled: boolean
  audience: TPointsAudience
  conditions: TPointsRuleConditions
}

export const DEFAULT_POINTS_RULES: TPointsRuleSeed[] = [
  {
    key: POINTS_REWARD_KEY.profile_complete,
    points: 150,
    enabled: true,
    audience: POINTS_AUDIENCE.both,
    conditions: {},
  },
  {
    key: POINTS_REWARD_KEY.stripe_connect,
    points: 100,
    enabled: true,
    audience: POINTS_AUDIENCE.expert,
    conditions: {},
  },
  {
    key: POINTS_REWARD_KEY.phone_verify,
    points: 50,
    enabled: true,
    audience: POINTS_AUDIENCE.both,
    conditions: {},
  },
  {
    key: POINTS_REWARD_KEY.admin_approval,
    points: 150,
    enabled: true,
    audience: POINTS_AUDIENCE.expert,
    conditions: {},
  },
  {
    key: POINTS_REWARD_KEY.social_links,
    points: 50,
    enabled: true,
    audience: POINTS_AUDIENCE.expert,
    conditions: {},
  },
  {
    key: POINTS_REWARD_KEY.referral_referrer,
    points: 500,
    enabled: true,
    audience: POINTS_AUDIENCE.both,
    conditions: { deferUntil: 'first_paid_session' },
  },
  {
    key: POINTS_REWARD_KEY.referral_invitee,
    points: 500,
    enabled: true,
    audience: POINTS_AUDIENCE.both,
    conditions: { deferUntil: 'first_paid_session' },
  },
  {
    key: POINTS_REWARD_KEY.session_completed,
    points: 100,
    enabled: true,
    audience: POINTS_AUDIENCE.both,
    conditions: {},
  },
  {
    key: POINTS_REWARD_KEY.weekly_bonus,
    points: 300,
    enabled: true,
    audience: POINTS_AUDIENCE.expert,
    conditions: { minSessions: 5 },
  },
  {
    key: POINTS_REWARD_KEY.five_star_review,
    points: 0,
    enabled: false,
    audience: POINTS_AUDIENCE.expert,
    conditions: {},
  },
  {
    key: POINTS_REWARD_KEY.monthly_rating_bonus,
    points: 500,
    enabled: true,
    audience: POINTS_AUDIENCE.expert,
    conditions: { minReviews: 5, windowDays: 30, minAvgRating: 4.7 },
  },
  {
    key: POINTS_REWARD_KEY.no_show_bonus,
    points: 300,
    enabled: true,
    audience: POINTS_AUDIENCE.expert,
    conditions: { minSessions: 5, windowDays: 30 },
  },
  {
    key: POINTS_REWARD_KEY.fast_response_bonus,
    points: 50,
    enabled: true,
    audience: POINTS_AUDIENCE.expert,
    conditions: {
      responsePct: 80,
      responseMinutes: 30,
      minRequests: 3,
      onlyDuringAvailability: true,
    },
  },
  {
    key: POINTS_REWARD_KEY.expert_link_first_paid,
    points: 200,
    enabled: true,
    audience: POINTS_AUDIENCE.expert,
    conditions: {},
  },
]

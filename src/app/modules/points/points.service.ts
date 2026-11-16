import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import httpStatus from 'http-status'
import mongoose, { Types } from 'mongoose'
import AppError from '../../errors/AppError'
import { sendNotification } from '../../utils/sentNotification'
import { modeType } from '../notification/notification.interface'
import { POINTS_LOG_SOURCE, POINTS_LOG_TYPE } from '../pointsLogs/pointsLogs.constant'
import { PointsLog } from '../pointsLogs/pointsLogs.model'
import { PointsLogsService } from '../pointsLogs/pointsLogs.service'
import { SettingsLogsService } from '../settingsLogs/settingsLogs.service'
import { USER_ROLE, USER_STATUS } from '../user/user.constant'
import { User } from '../user/user.model'
import {
  DEFAULT_POINTS_RULES,
  POINTS_AUDIENCE,
  POINTS_REWARD_KEY,
} from './points.constant'
import { TAwardByKeyPayload, TPointsRule } from './points.interface'
import { PointsRule } from './points.model'
import { getUserPointsSummary } from './points.utils'

dayjs.extend(isoWeek)

const getRuleByKey = async (key: string) => {
  const rule = await PointsRule.findOne({ key })
  if (!rule) {
    throw new AppError(httpStatus.NOT_FOUND, `Points rule "${key}" not found`)
  }
  return rule
}

const getAllRulesFromDB = async () => {
  return PointsRule.find().sort({ key: 1 }).lean()
}

const getRuleFromDB = async (key: string) => {
  return getRuleByKey(key)
}

const updateRuleFromDB = async (
  currentKey: string,
  payload: Partial<Pick<TPointsRule, 'key' | 'points' | 'audience' | 'conditions'>>,
  adminId: string,
) => {
  const rule = await getRuleByKey(currentKey)
  const before = rule.toObject()

  if (payload.key && payload.key !== rule.key) {
    const exists = await PointsRule.findOne({ key: payload.key })
    if (exists) {
      throw new AppError(httpStatus.CONFLICT, `Points rule key "${payload.key}" already exists`)
    }
    rule.key = payload.key
  }

  if (payload.points !== undefined) {
    if (payload.points < 0) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Points cannot be negative')
    }
    rule.points = payload.points
  }

  if (payload.audience) {
    if (!Object.values(POINTS_AUDIENCE).includes(payload.audience)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid audience')
    }
    rule.audience = payload.audience
  }

  if (payload.conditions !== undefined) {
    rule.conditions = payload.conditions || {}
  }

  await rule.save()

  await SettingsLogsService.createSettingsLogs([
    {
      key: `points.rule.${before.key}`,
      previousValue: {
        key: before.key,
        points: before.points,
        audience: before.audience,
        conditions: before.conditions,
        enabled: before.enabled,
      },
      newValue: {
        key: rule.key,
        points: rule.points,
        audience: rule.audience,
        conditions: rule.conditions,
        enabled: rule.enabled,
      },
      changedBy: new Types.ObjectId(adminId),
    } as any,
  ])

  return rule
}

const toggleRuleEnabledFromDB = async (
  key: string,
  enabled: boolean,
  adminId: string,
) => {
  const rule = await getRuleByKey(key)
  const previous = rule.enabled
  rule.enabled = enabled
  await rule.save()

  await SettingsLogsService.createSettingsLogs([
    {
      key: `points.rule.${key}.enabled`,
      previousValue: previous,
      newValue: enabled,
      changedBy: new Types.ObjectId(adminId),
    } as any,
  ])

  return rule
}

const getUserSummaryFromDB = async (userId: string) => {
  const user = await User.findById(userId).select('_id points role firstName lastName')
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }

  const summary = await getUserPointsSummary(userId)
  return {
    user: {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      points: user.points || 0,
    },
    ...summary,
  }
}

const setAttributionFromDB = async (
  userId: string,
  expertRef: string,
) => {
  const user = await User.findById(userId)
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }

  if (user.attributedExpert) {
    return {
      attributedExpert: user.attributedExpert,
      attributedAt: user.attributedAt,
      alreadySet: true,
    }
  }

  const expert = await User.findOne({
    referralCode: expertRef.trim(),
    role: USER_ROLE.expert,
    isDeleted: false,
  })

  if (!expert) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid expert referral code')
  }

  if (String(expert._id) === String(user._id)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Cannot attribute yourself')
  }

  user.attributedExpert = expert._id
  user.attributedAt = new Date()
  await user.save()

  return {
    attributedExpert: user.attributedExpert,
    attributedAt: user.attributedAt,
    alreadySet: false,
  }
}

const applyExpertRefOnRegister = async (
  userId: string,
  expertRef?: string,
  session?: mongoose.ClientSession,
) => {
  if (!expertRef?.trim()) return null

  const userQuery = User.findById(userId)
  if (session) userQuery.session(session)
  const user = await userQuery
  if (!user || user.attributedExpert) return null

  const expertQuery = User.findOne({
    referralCode: expertRef.trim(),
    role: USER_ROLE.expert,
    isDeleted: false,
  })
  if (session) expertQuery.session(session)
  const expert = await expertQuery
  if (!expert || String(expert._id) === String(user._id)) return null

  user.attributedExpert = expert._id
  user.attributedAt = new Date()
  await user.save(session ? { session } : undefined)
  return expert._id
}

const hasAwardedReward = async (
  userId: Types.ObjectId | string,
  rewardKey: string,
  extra: Record<string, unknown> = {},
  session?: mongoose.ClientSession,
) => {
  const filter: Record<string, unknown> = {
    user:
      typeof userId === 'string' ? new Types.ObjectId(userId) : userId,
    rewardKey,
    type: POINTS_LOG_TYPE.credit,
    ...extra,
  }
  const query = PointsLog.findOne(filter).select('_id')
  if (session) query.session(session)
  return Boolean(await query.lean())
}

const getRuleOrNull = async (key: string) => PointsRule.findOne({ key })

const awardByKey = async ({
  userId,
  key,
  reason,
  meta,
  session,
  skipPush = false,
}: TAwardByKeyPayload) => {
  const rule = await PointsRule.findOne({ key })
  if (!rule || !rule.enabled || !rule.points || rule.points <= 0) {
    return null
  }

  const userQuery = User.findById(userId)
  if (session) userQuery.session(session)
  const user = await userQuery
  if (!user || user.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }

  await User.findByIdAndUpdate(
    user._id,
    { $inc: { points: rule.points } },
    session ? { session } : undefined,
  )

  await PointsLogsService.createPointsLog(
    {
      user: user._id,
      type: POINTS_LOG_TYPE.credit,
      points: rule.points,
      reason: reason || `Reward: ${key}`,
      source: POINTS_LOG_SOURCE.reword,
      rewardKey: key,
      meta: meta || undefined,
    },
    session,
  )

  const description = `You earned ${rule.points} points. ${reason || key}`

  if (!skipPush && !session && user.fcmToken && user.pushNotify?.points) {
    await sendNotification([user.fcmToken], {
      receiver: user._id,
      message: 'Points earned!',
      description,
      reference: String(user._id),
      modelType: modeType.Achievement,
    }).catch((err) =>
      console.error(`Points push failed for user ${user._id}:`, err),
    )
  }

  return {
    userId: user._id,
    rewardKey: key,
    points: rule.points,
    fcmToken: user.fcmToken,
    pushEnabled: Boolean(user.pushNotify?.points),
    description,
  }
}

const settlePendingReferralRewards = async (
  inviteeUserId: Types.ObjectId | string,
  session?: mongoose.ClientSession,
) => {
  const inviteeQuery = User.findById(inviteeUserId)
  if (session) inviteeQuery.session(session)
  const invitee = await inviteeQuery
  if (!invitee?.pendingReferralReward || !invitee.referredBy) {
    return
  }

  if (
    invitee.role === USER_ROLE.expert &&
    invitee.status !== USER_STATUS.active
  ) {
    return
  }

  const already = await hasAwardedReward(
    invitee._id,
    POINTS_REWARD_KEY.referral_invitee,
    {},
    session,
  )
  if (already) {
    invitee.pendingReferralReward = false
    await invitee.save(session ? { session } : undefined)
    return
  }

  await awardByKey({
    userId: invitee._id,
    key: POINTS_REWARD_KEY.referral_invitee,
    reason: 'Referral reward after first paid session',
    meta: { referredUserId: invitee.referredBy },
    session,
    skipPush: Boolean(session),
  })

  await awardByKey({
    userId: invitee.referredBy,
    key: POINTS_REWARD_KEY.referral_referrer,
    reason: 'Referral reward for inviting a user who completed first paid session',
    meta: { referredUserId: invitee._id },
    session,
    skipPush: Boolean(session),
  })

  invitee.pendingReferralReward = false
  await invitee.save(session ? { session } : undefined)
}

const settleExpertLinkFirstPaid = async (
  customerId: Types.ObjectId | string,
  expertId: Types.ObjectId | string,
  bookingId: Types.ObjectId | string,
  session?: mongoose.ClientSession,
) => {
  if (String(customerId) === String(expertId)) return

  const customerQuery = User.findById(customerId).select(
    'attributedExpert isDeleted',
  )
  if (session) customerQuery.session(session)
  const customer = await customerQuery
  if (
    !customer ||
    customer.isDeleted ||
    !customer.attributedExpert ||
    String(customer.attributedExpert) !== String(expertId)
  ) {
    return
  }

  const already = await hasAwardedReward(
    expertId,
    POINTS_REWARD_KEY.expert_link_first_paid,
    { 'meta.referredUserId': new Types.ObjectId(String(customerId)) },
    session,
  )
  if (already) return

  await awardByKey({
    userId: expertId,
    key: POINTS_REWARD_KEY.expert_link_first_paid,
    reason: 'First paid booking from attributed customer via expert link',
    meta: {
      bookingId,
      referredUserId: customerId,
      expertId,
    },
    session,
    skipPush: Boolean(session),
  })
}

const getCurrentIsoWeekWindow = () => {
  const start = dayjs().startOf('isoWeek').toDate()
  const end = dayjs().endOf('isoWeek').toDate()
  return { start, end }
}

const seedDefaultRules = async () => {
  const bulkOps = DEFAULT_POINTS_RULES.map((rule) => ({
    updateOne: {
      filter: { key: rule.key },
      update: {
        $setOnInsert: {
          key: rule.key,
          points: rule.points,
          enabled: rule.enabled,
          audience: rule.audience,
          conditions: rule.conditions,
        },
      },
      upsert: true,
    },
  }))

  await PointsRule.bulkWrite(bulkOps)
  return PointsRule.find().sort({ key: 1 }).lean()
}

export const PointsService = {
  getAllRulesFromDB,
  getRuleFromDB,
  updateRuleFromDB,
  toggleRuleEnabledFromDB,
  getUserSummaryFromDB,
  setAttributionFromDB,
  applyExpertRefOnRegister,
  awardByKey,
  hasAwardedReward,
  getRuleOrNull,
  settlePendingReferralRewards,
  settleExpertLinkFirstPaid,
  getCurrentIsoWeekWindow,
  seedDefaultRules,
}

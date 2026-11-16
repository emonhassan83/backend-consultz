import dayjs from 'dayjs'
import mongoose from 'mongoose'
import { PointsLog } from '../pointsLogs/pointsLogs.model'
import { POINTS_LOG_TYPE } from '../pointsLogs/pointsLogs.constant'

export const getLast90DaysPointsByUsers = async (
  userIds: Array<string | mongoose.Types.ObjectId>,
) => {
  if (!userIds.length) {
    return new Map<string, number>()
  }

  const objectIds = userIds.map((id) =>
    typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id,
  )
  const since = dayjs().subtract(90, 'day').toDate()

  const rows = await PointsLog.aggregate([
    {
      $match: {
        user: { $in: objectIds },
        type: POINTS_LOG_TYPE.credit,
        createdAt: { $gte: since },
      },
    },
    {
      $group: {
        _id: '$user',
        points: { $sum: '$points' },
      },
    },
  ])

  const map = new Map<string, number>()
  for (const row of rows) {
    map.set(String(row._id), Number(row.points || 0))
  }
  return map
}

export const getUserPointsSummary = async (userId: string) => {
  const since = dayjs().subtract(90, 'day').toDate()
  const objectId = new mongoose.Types.ObjectId(userId)

  const [lifetime, last90, breakdown] = await Promise.all([
    PointsLog.aggregate([
      { $match: { user: objectId } },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$points' },
        },
      },
    ]),
    PointsLog.aggregate([
      {
        $match: {
          user: objectId,
          type: POINTS_LOG_TYPE.credit,
          createdAt: { $gte: since },
        },
      },
      { $group: { _id: null, total: { $sum: '$points' } } },
    ]),
    PointsLog.aggregate([
      {
        $match: {
          user: objectId,
          type: POINTS_LOG_TYPE.credit,
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: '$rewardKey',
          total: { $sum: '$points' },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]),
  ])

  const credit = lifetime.find((row) => row._id === POINTS_LOG_TYPE.credit)?.total || 0
  const debit = lifetime.find((row) => row._id === POINTS_LOG_TYPE.debit)?.total || 0

  return {
    lifetimeCredits: credit,
    lifetimeDebits: debit,
    netFromLogs: credit - debit,
    last90DaysCredits: last90[0]?.total || 0,
    breakdownLast90Days: breakdown.map((row) => ({
      rewardKey: row._id || 'unknown',
      total: row.total,
      count: row.count,
    })),
  }
}

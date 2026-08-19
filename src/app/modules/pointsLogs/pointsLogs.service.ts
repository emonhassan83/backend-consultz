import QueryBuilder from '../../builder/QueryBuilder'
import { PointsLog } from './pointsLogs.model'
import { TPointsLog } from './pointsLogs.interface'

const createPointsLog = async (payload: TPointsLog, session?: any) => {
  const [log] = await PointsLog.create([payload], session ? { session } : {})
  return log
}

const getUserPointsLogsFromDB = async (
  userId: string,
  query: Record<string, unknown>,
) => {
  const pointsLogQuery = new QueryBuilder(
    PointsLog.find({ user: userId }).populate([
      { path: 'user', select: '_id firstName lastName email photoUrl role points' },
    ]),
    query,
  )
    .filter()
    .sort()
    .paginate()
    .fields()

  const data = await pointsLogQuery.modelQuery
  const meta = await pointsLogQuery.countTotal()

  return { data, meta }
}

export const PointsLogsService = {
  createPointsLog,
  getUserPointsLogsFromDB,
}

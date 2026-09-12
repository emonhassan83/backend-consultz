import QueryBuilder from '../../builder/QueryBuilder'
import { SettingsLog } from './settingsLogs.model'
import { TSettingsLog } from './settingsLogs.interface'

const createSettingsLogs = async (payload: TSettingsLog[]) => {
  if (!payload.length) return []
  return SettingsLog.insertMany(payload)
}

const getSettingsLogsFromDB = async (query: Record<string, unknown>) => {
  const { startDate, endDate, ...restQuery } = query

  const filter: Record<string, any> = {}

  if (startDate || endDate) {
    filter.createdAt = {}
    if (startDate) {
      filter.createdAt.$gte = new Date(`${String(startDate)}T00:00:00.000Z`)
    }
    if (endDate) {
      filter.createdAt.$lte = new Date(`${String(endDate)}T23:59:59.999Z`)
    }
  }

  const settingsLogQuery = new QueryBuilder(
    SettingsLog.find(filter).populate({
      path: 'changedBy',
      select: '_id firstName lastName email photoUrl role',
    }),
    restQuery,
  )
    .filter()
    .sort()
    .paginate()
    .fields()

  const data = await settingsLogQuery.modelQuery
  const meta = await settingsLogQuery.countTotal()

  return { data, meta }
}

export const SettingsLogsService = {
  createSettingsLogs,
  getSettingsLogsFromDB,
}

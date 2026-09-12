import httpStatus from 'http-status'
import { Contents } from './contents.models'
import AppError from '../../errors/AppError'
import { DEFAULT_GENERAL_CONTENTS, GENERAL_KEYS } from './contents.constants'
import { SettingsLogsService } from '../settingsLogs/settingsLogs.service'

const validateGeneralSettingValue = (key: string, value: any) => {
  if (key === 'paymentHoldDays') {
    const numberValue = Number(value)
    if (!Number.isFinite(numberValue) || numberValue < 1) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Payment hold days must be at least 1',
      )
    }
  }

  if (key === 'platformFeePercentage') {
    const numberValue = Number(value)
    if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 100) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Platform fee percentage must be between 0 and 100',
      )
    }
  }
}

// Get single content by key
const getContent = async (key: string) => {
  if (!key) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Key is required')
  }

  // Get from database
  const content = await Contents.findOne({ key }).select('-__v').lean()
  if (!content) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      `Content with key "${key}" not found`,
    )
  }

  return content
}

// Get all general contents
const getGeneralContents = async () => {
  // Get from database
  const contents = await Contents.find({ key: { $in: GENERAL_KEYS } }).select('-__v').lean()

  const contentByKey = new Map(contents.map((content) => [content.key, content]))

  return GENERAL_KEYS.map((key) => {
    const existingContent = contentByKey.get(key)
    if (existingContent) return existingContent

    return {
      key,
      value: DEFAULT_GENERAL_CONTENTS[key] ?? null,
    }
  })
}

// Create or update single content
const createOrUpdate = async (key: string, payload: any, changedBy?: string) => {
  if (!key || key === 'generals') {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Key is required and cannot be "generals"',
    )
  }

  validateGeneralSettingValue(key, payload.value ?? payload)
  const newValue = payload.value ?? payload
  const isGeneralKey = GENERAL_KEYS.includes(key as any)
  const existingContent = isGeneralKey
    ? await Contents.findOne({ key }).select('value').lean()
    : null
  const previousValue =
    existingContent?.value ?? DEFAULT_GENERAL_CONTENTS[key as keyof typeof DEFAULT_GENERAL_CONTENTS] ?? null

  // Update database
  const content = await Contents.findOneAndUpdate(
    { key },
    { key, value: newValue, name: payload.name },
    { returnDocument: 'after', upsert: true },
  ).select('-__v')

  if (
    changedBy &&
    isGeneralKey &&
    JSON.stringify(previousValue) !== JSON.stringify(newValue)
  ) {
    await SettingsLogsService.createSettingsLogs([
      {
        key,
        previousValue,
        newValue,
        changedBy: changedBy as any,
      },
    ])
  }

  return content
}

// Update multiple general contents
const updateGenerals = async (payload: Record<string, any>, changedBy?: string) => {
  const validKeys = GENERAL_KEYS.filter(key => payload[key] !== undefined)

  if (validKeys.length === 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'No valid general content keys provided',
    )
  }

  validKeys.forEach((key) => validateGeneralSettingValue(key, payload[key]))

  const previousContents = await Contents.find({
    key: { $in: validKeys },
  }).select('key value').lean()
  const previousValueByKey = new Map(
    previousContents.map((content) => [content.key, content.value]),
  )

  // Update database
  const updates = validKeys.map(key =>
    Contents.findOneAndUpdate(
      { key },
      { value: payload[key] },
      { upsert: true, returnDocument: 'after' },
    ).select('-__v'),
  )

  const updatedContents = await Promise.all(updates)

  if (changedBy) {
    const logs = validKeys
      .map((key) => {
        const previousValue =
          previousValueByKey.get(key) ??
          DEFAULT_GENERAL_CONTENTS[key as keyof typeof DEFAULT_GENERAL_CONTENTS] ??
          null
        const newValue = payload[key]

        if (JSON.stringify(previousValue) === JSON.stringify(newValue)) {
          return null
        }

        return {
          key,
          previousValue,
          newValue,
          changedBy: changedBy as any,
        }
      })
      .filter(Boolean) as any[]

    await SettingsLogsService.createSettingsLogs(logs)
  }

  return {
    message: `Updated ${validKeys.length} general contents`,
    data: updatedContents,
  }
}

export const contentsService = {
  getContent,
  getGeneralContents,
  createOrUpdate,
  updateGenerals
}

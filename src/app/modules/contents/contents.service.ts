import httpStatus from 'http-status'
import { Contents } from './contents.models'
import AppError from '../../errors/AppError'
import { DEFAULT_GENERAL_CONTENTS, GENERAL_KEYS } from './contents.constants'

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
const createOrUpdate = async (key: string, payload: any) => {
  if (!key || key === 'generals') {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Key is required and cannot be "generals"',
    )
  }

  // Update database
  const content = await Contents.findOneAndUpdate(
    { key },
    { key, value: payload.value ?? payload, name: payload.name },
    { returnDocument: 'after', upsert: true },
  ).select('-__v')

  return content
}

// Update multiple general contents
const updateGenerals = async (payload: Record<string, any>) => {
  const validKeys = GENERAL_KEYS.filter(key => payload[key] !== undefined)

  if (validKeys.length === 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'No valid general content keys provided',
    )
  }

  // Update database
  const updates = validKeys.map(key =>
    Contents.findOneAndUpdate(
      { key },
      { value: payload[key] },
      { upsert: true, returnDocument: 'after' },
    ).select('-__v'),
  )

  const updatedContents = await Promise.all(updates)

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

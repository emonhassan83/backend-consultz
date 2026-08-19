import { Contents } from './contents.models'
import { DEFAULT_GENERAL_CONTENTS, GENERAL_KEYS } from './contents.constants'

type TGeneralKey = (typeof GENERAL_KEYS)[number]

export const getGeneralSettingNumber = async (
  key: TGeneralKey,
  fallback = 0,
) => {
  const content = await Contents.findOne({ key }).select('value').lean()
  const defaultValue = DEFAULT_GENERAL_CONTENTS[key] ?? fallback
  const numericValue = Number(content?.value ?? defaultValue)

  return Number.isFinite(numericValue) ? numericValue : fallback
}

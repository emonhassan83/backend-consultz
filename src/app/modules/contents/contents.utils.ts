import { Contents } from './contents.models'
import {
  DEFAULT_GENERAL_CONTENTS,
  GENERAL_KEYS,
  LEGACY_GENERAL_KEY_MAP,
} from './contents.constants'

type TGeneralKey = (typeof GENERAL_KEYS)[number]
type TLegacyGeneralKey = keyof typeof LEGACY_GENERAL_KEY_MAP

const LEGACY_FALLBACK_KEYS: Partial<Record<TGeneralKey, string>> = {
  consulteeCancellationTime: 'cancellationTime',
  expertCancellationTime: 'cancellationTime',
  consulteeReschedulingTime: 'reschedulingTime',
  expertReschedulingTime: 'reschedulingTime',
}

export const resolveGeneralSettingKey = (key: string): string =>
  LEGACY_GENERAL_KEY_MAP[key as TLegacyGeneralKey] || key

export const normalizeGeneralSettingsPayload = (
  payload: Record<string, any>,
) => {
  const next = { ...payload }

  ;(Object.keys(LEGACY_GENERAL_KEY_MAP) as TLegacyGeneralKey[]).forEach(
    (legacyKey) => {
      const mappedKey = LEGACY_GENERAL_KEY_MAP[legacyKey]
      if (next[legacyKey] !== undefined && next[mappedKey] === undefined) {
        next[mappedKey] = next[legacyKey]
      }
      delete next[legacyKey]
    },
  )

  return next
}

export const getGeneralSettingNumber = async (
  key: TGeneralKey,
  fallback = 0,
) => {
  const content = await Contents.findOne({ key }).select('value').lean()
  if (content?.value !== undefined && content?.value !== null) {
    const numericValue = Number(content.value)
    if (Number.isFinite(numericValue)) return numericValue
  }

  const legacyKey = LEGACY_FALLBACK_KEYS[key]
  if (legacyKey) {
    const legacyContent = await Contents.findOne({ key: legacyKey })
      .select('value')
      .lean()
    const legacyValue = Number(legacyContent?.value)
    if (Number.isFinite(legacyValue)) return legacyValue
  }

  const defaultValue = DEFAULT_GENERAL_CONTENTS[key] ?? fallback
  const numericDefault = Number(defaultValue)
  return Number.isFinite(numericDefault) ? numericDefault : fallback
}

export const getPartyPolicyMinutes = async (
  party: 'consultee' | 'consultant',
  action: 'cancellation' | 'rescheduling',
) => {
  const key: TGeneralKey =
    party === 'consultee'
      ? action === 'cancellation'
        ? 'consulteeCancellationTime'
        : 'consulteeReschedulingTime'
      : action === 'cancellation'
        ? 'expertCancellationTime'
        : 'expertReschedulingTime'

  return getGeneralSettingNumber(key, 60)
}

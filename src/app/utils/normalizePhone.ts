/**
 * Phone numbers are stored and compared as `+` followed by digits only, so
 * `+44 7700 163907`, `+44-7700-163907` and `0044 7700163907` are the same
 * number (QA #12).
 */
export const normalizePhone = (phone?: string | null): string => {
  const trimmed = (phone ?? '').trim()
  if (!trimmed) return ''

  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')

  // International `00` prefix is the same as `+`
  if (!hasPlus && digits.startsWith('00')) {
    return `+${digits.slice(2)}`
  }

  return hasPlus ? `+${digits}` : digits
}

export const PHONE_ALREADY_EXISTS_MESSAGE =
  'An account with this phone number already exists. Please log in instead.'

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

// E.164 allows at most 15 digits; shorter than 6 is never a real number
const MIN_PHONE_DIGITS = 6
const MAX_PHONE_DIGITS = 15
const PHONE_ALLOWED_CHARS = /^[+\d\s\-().]+$/

/**
 * Why this phone number can't be used, or null if it can (#12). Counts digits
 * after normalizing, so `+44 7700 163 907` and `0044-7700-163907` are valid
 * even though they are longer than 15 characters.
 */
export const getPhoneError = (phone?: string | null): string | null => {
  const trimmed = (phone ?? '').trim()
  if (!trimmed || !PHONE_ALLOWED_CHARS.test(trimmed)) {
    return 'Please enter a valid phone number.'
  }
  const digits = normalizePhone(trimmed).replace(/\D/g, '').length
  if (digits < MIN_PHONE_DIGITS) {
    return `Phone number must have at least ${MIN_PHONE_DIGITS} digits.`
  }
  if (digits > MAX_PHONE_DIGITS) {
    return `Phone number can have at most ${MAX_PHONE_DIGITS} digits.`
  }
  return null
}

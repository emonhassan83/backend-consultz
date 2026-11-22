/* eslint-disable @typescript-eslint/no-explicit-any */
import httpStatus from 'http-status'
import { TGenericErrorResponse } from '../interface/error'

/** Field names from a Mongo E11000 error, without exposing the values. */
export const getDuplicateFields = (err: any): string[] => {
  const fromPattern = Object.keys(err?.keyPattern ?? {})
  if (fromPattern.length) return fromPattern
  const fromValue = Object.keys(err?.keyValue ?? {})
  if (fromValue.length) return fromValue

  // Older drivers: "... index: email_1 dup key: { email: ... }"
  const match = String(err?.message ?? '').match(/index:\s+(\S+?)_-?\d/)
  return match ? [match[1]] : []
}

const handleDuplicateError = (err: any): TGenericErrorResponse => {
  const fields = getDuplicateFields(err)
  const indexName = String(err?.message ?? '').match(/index:\s+(\S+)/)?.[1]

  // Log the index so a stale unique index can be found from server logs (#14).
  // Values are not logged: they can be emails or phone numbers.
  console.error('[DuplicateKeyError]', {
    index: indexName ?? null,
    keyPattern: err?.keyPattern ?? null,
  })

  const label = fields.length ? fields.join(', ') : 'Value'
  const message = `${label} already exists`

  return {
    statusCode: httpStatus.CONFLICT,
    message,
    errorSources: [{ path: fields[0] ?? '', message }],
  }
}

export default handleDuplicateError

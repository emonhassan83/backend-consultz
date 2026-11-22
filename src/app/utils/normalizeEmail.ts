/**
 * Emails are stored and compared in lowercase so `Test@x.com` and
 * `test@x.com` are the same account.
 */
export const normalizeEmail = (email?: string | null): string =>
  (email ?? '').trim().toLowerCase()

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Case-insensitive exact-match filter. Used only as a fallback for accounts
 * that were stored with mixed-case emails before normalization was added
 * (see src/app/seeder/migrateLowercaseEmails.ts). It can't use the email index.
 */
export const emailCaseInsensitiveFilter = (email: string) => ({
  email: { $regex: `^${escapeRegex(normalizeEmail(email))}$`, $options: 'i' },
})

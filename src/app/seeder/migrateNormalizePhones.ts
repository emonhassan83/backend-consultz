/**
 * One-off migration: store every user phone number as `+` followed by digits
 * (QA #12), e.g. `+44 7700-163907` -> `+447700163907`.
 *
 *   npm run migrate:normalize-phones            -> dry run, only reports
 *   npm run migrate:normalize-phones -- --apply -> writes the changes
 *
 * Only the format changes, so it is safe to run more than once: a second run
 * finds nothing to update. `phoneNumber` and `pendingPhoneNumber` are both
 * covered, on deleted users too.
 *
 * It also reports, without changing them:
 *  - numbers owned by more than one live, verified account (duplicates that
 *    existed before the #12 check; resolve them by hand);
 *  - numbers with no country code (no leading `+` or `00`), which can't be
 *    turned into an international number automatically.
 */
import mongoose from 'mongoose'
import config from '../config'
import { User } from '../modules/user/user.model'
import { normalizePhone } from '../utils/normalizePhone'

const apply = process.argv.includes('--apply')

const run = async () => {
  await mongoose.connect(config.database_url as string)
  console.log(`Connected. Mode: ${apply ? 'APPLY' : 'DRY RUN'}`)

  const users = await User.collection
    .find(
      {
        $or: [
          { phoneNumber: { $type: 'string', $ne: '' } },
          { pendingPhoneNumber: { $type: 'string', $ne: '' } },
        ],
      },
      {
        projection: {
          _id: 1,
          email: 1,
          phoneNumber: 1,
          pendingPhoneNumber: 1,
          isDeleted: 1,
          isPhoneOtpVerified: 1,
          isEmailVerified: 1,
        },
      },
    )
    .toArray()

  let updated = 0
  const owners = new Map<string, string[]>()
  const noCountryCode: string[] = []

  for (const u of users) {
    const $set: Record<string, string> = {}

    for (const field of ['phoneNumber', 'pendingPhoneNumber'] as const) {
      const stored = u[field]
      if (typeof stored !== 'string' || !stored) continue

      const normalized = normalizePhone(stored)
      // Nothing usable in the stored value (no digits): leave it for a manual check
      if (!normalized || normalized === '+') {
        console.log(`${u._id}: ${field} "${stored}" has no digits, skipped`)
        continue
      }
      if (stored !== normalized) $set[field] = normalized
    }

    const phone = $set.phoneNumber ?? u.phoneNumber
    if (typeof phone === 'string' && phone) {
      if (!phone.startsWith('+')) {
        noCountryCode.push(`${u._id} (${u.email}): ${phone}`)
      }
      // Same rule as findPhoneOwner: live and verified accounts own their number
      if (!u.isDeleted && (u.isPhoneOtpVerified || u.isEmailVerified)) {
        owners.set(phone, [...(owners.get(phone) ?? []), `${u._id} (${u.email})`])
      }
    }

    if (!Object.keys($set).length) continue

    for (const [field, value] of Object.entries($set)) {
      console.log(`${u._id}: ${field} "${u[field]}" -> "${value}"`)
    }
    if (apply) {
      await User.collection.updateOne({ _id: u._id }, { $set })
    }
    updated++
  }

  console.log(`\nChecked: ${users.length}`)
  console.log(`${apply ? 'Updated' : 'Would update'}: ${updated}`)

  const duplicates = [...owners].filter(([, group]) => group.length > 1)
  if (duplicates.length) {
    console.log(
      `\n⚠️  Numbers owned by more than one verified account (not changed, fix manually): ${duplicates.length}`,
    )
    duplicates.forEach(([phone, group]) =>
      console.log(`  - ${phone}: ${group.join(' | ')}`),
    )
  }

  if (noCountryCode.length) {
    console.log(
      `\n⚠️  Numbers without a country code (format kept, fix manually): ${noCountryCode.length}`,
    )
    noCountryCode.forEach((line) => console.log(`  - ${line}`))
  }
}

run()
  .catch((error) => {
    console.error('❌ Migration failed:', error)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())

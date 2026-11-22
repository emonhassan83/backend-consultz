/**
 * One-off migration: store every user email in lowercase (QA #4).
 *
 *   npm run migrate:lowercase-emails            -> dry run, only reports
 *   npm run migrate:lowercase-emails -- --apply -> writes the changes
 *
 * If two accounts differ only by case (e.g. `Test@x.com` and `test@x.com`)
 * they are reported as conflicts and left untouched; resolve them by hand.
 * Login keeps working without this migration (case-insensitive fallback),
 * but running it lets every lookup use the email index.
 */
import mongoose from 'mongoose'
import config from '../config'
import { User } from '../modules/user/user.model'
import { normalizeEmail } from '../utils/normalizeEmail'

const apply = process.argv.includes('--apply')

const run = async () => {
  await mongoose.connect(config.database_url as string)
  console.log(`Connected. Mode: ${apply ? 'APPLY' : 'DRY RUN'}`)

  const users = await User.collection
    .find({}, { projection: { _id: 1, email: 1, isDeleted: 1 } })
    .toArray()

  const byNormalized = new Map<string, typeof users>()
  for (const u of users) {
    const key = normalizeEmail(u.email)
    byNormalized.set(key, [...(byNormalized.get(key) ?? []), u])
  }

  let updated = 0
  const conflicts: string[] = []

  for (const [normalized, group] of byNormalized) {
    if (group.length > 1) {
      conflicts.push(
        `${normalized}: ${group
          .map((u) => `${u._id} (${u.email}${u.isDeleted ? ', deleted' : ''})`)
          .join(' | ')}`,
      )
      continue
    }

    const [u] = group
    if (u.email === normalized) continue

    console.log(`${u._id}: "${u.email}" -> "${normalized}"`)
    if (apply) {
      await User.collection.updateOne({ _id: u._id }, { $set: { email: normalized } })
    }
    updated++
  }

  console.log(`\n${apply ? 'Updated' : 'Would update'}: ${updated}`)
  if (conflicts.length) {
    console.log(`\n⚠️  Conflicts (not changed, fix manually): ${conflicts.length}`)
    conflicts.forEach((c) => console.log(`  - ${c}`))
  }
}

run()
  .catch((error) => {
    console.error('❌ Migration failed:', error)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())

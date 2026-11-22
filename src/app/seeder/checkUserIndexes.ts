/**
 * Check for stale unique indexes that block referral sign-ups (QA #14).
 *
 *   npm run check:indexes             -> dry run, only reports
 *   npm run check:indexes -- --drop   -> drops stale unique referral indexes
 *
 * "Stale" means the index exists in MongoDB but not in the Mongoose schema.
 * A unique index on a referral field (e.g. `referredBy_1`) lets the first
 * referral through and fails every later one with E11000 ("... already
 * exists"). Only those are dropped; every other index is only reported.
 */
import mongoose, { Model } from 'mongoose'
import config from '../config'
import { User } from '../modules/user/user.model'
import { PointsLog } from '../modules/pointsLogs/pointsLogs.model'

const drop = process.argv.includes('--drop')

// `user` / `rewardKey` are PointsLog fields: a unique index on them would
// block repeat referral rewards to the same referrer.
const REFERRAL_FIELDS = new Set([
  'referredBy',
  'referralCode',
  'attributedExpert',
  'attributedAt',
  'pendingReferralReward',
  'user',
  'rewardKey',
])

const checkModel = async (model: Model<any>) => {
  const name = model.collection.collectionName
  const indexes = await model.collection.indexes()
  const { toDrop } = await model.diffIndexes()
  const stale = new Set(toDrop)

  console.log(`\n== ${name}`)
  for (const index of indexes) {
    const flags = [
      index.unique ? 'unique' : null,
      index.sparse ? 'sparse' : null,
      index.partialFilterExpression ? 'partial' : null,
      stale.has(index.name as string) ? 'NOT IN SCHEMA' : null,
    ].filter(Boolean)
    console.log(
      `  ${index.name}  ${JSON.stringify(index.key)}${flags.length ? `  [${flags.join(', ')}]` : ''}`,
    )
  }

  const toRemove = indexes.filter(
    (index) =>
      index.unique &&
      stale.has(index.name as string) &&
      Object.keys(index.key).some((field) => REFERRAL_FIELDS.has(field)),
  )

  if (!toRemove.length) {
    console.log('  ✅ No stale unique referral index')
    return 0
  }

  for (const index of toRemove) {
    if (drop) {
      await model.collection.dropIndex(index.name as string)
      console.log(`  🗑️  Dropped ${index.name}`)
    } else {
      console.log(`  ⚠️  Stale unique referral index: ${index.name} (run with --drop)`)
    }
  }
  return toRemove.length
}

const run = async () => {
  await mongoose.connect(config.database_url as string)
  console.log(`Connected. Mode: ${drop ? 'DROP' : 'DRY RUN'}`)

  let found = 0
  for (const model of [User, PointsLog] as Model<any>[]) {
    found += await checkModel(model)
  }

  console.log(
    `\n${drop ? 'Dropped' : 'Found'}: ${found} stale unique referral index(es)`,
  )
}

run()
  .catch((error) => {
    console.error('❌ Index check failed:', error)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())

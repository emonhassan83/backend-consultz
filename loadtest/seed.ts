/* Seeds the throwaway load-test DB using the real models from src/.
 * Run: npx ts-node --transpile-only loadtest/seed.ts
 * Writes loadtest/results/fixtures.json (ids, emails, pre-signed access tokens). */
import fs from 'fs'
import path from 'path'
import mongoose from 'mongoose'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

const LOAD_URL = 'mongodb://localhost:27098/consultz_load?replicaSet=rs0&directConnection=true'
const ACCESS_SECRET = 'loadtest_access_secret_not_real' // must match start-server.sh
const PASSWORD = 'Passw0rd!'
const N_CONSULT = 200
const N_EXPERT = 50
const N_FEEDS = 500
const N_REPORTS = 100
const N_REF_USERS = 8000
const SALT = 12

const url = process.env.LOAD_DATABASE_URL || LOAD_URL
if (!url.includes('localhost:27098')) {
  console.error('REFUSING: database URL does not contain localhost:27098')
  process.exit(1)
}
// Make the app-side config (imported by the models) point at the same DB
process.env.DATABASE_URL = url
process.env.JWT_ACCESS_SECRET = ACCESS_SECRET
process.env.BCRYPT_SALT_ROUNDS = String(SALT)

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { User } = require('../src/app/modules/user/user.model')
const { Feed } = require('../src/app/modules/feed/feed.model')
const { ContentMeta } = require('../src/app/modules/contentMeta/contentMeta.model')
const { Report } = require('../src/app/modules/report/report.models')
const { USER_ROLE } = require('../src/app/modules/user/user.constant')

const sign = (u: any) =>
  jwt.sign({ _id: String(u._id), email: u.email, role: u.role }, ACCESS_SECRET, { expiresIn: '1d' })

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const bufferRules = (step: number) => [15, 30, 60].map((d) => ({ duration: d, buffer: step * (d / 15) }))

const base = (i: number, role: string, prefix: string) => ({
  firstName: `${prefix}${i}`,
  lastName: 'Load',
  email: `${prefix}${i}@loadtest.test`,
  password: '', // filled with the shared hash below
  dob: '1990-01-01',
  phoneNumber: `+4477009${String(100000 + i + (role === 'expert' ? 50000 : 0) + (prefix === 'ref' ? 20000 : 0)).padStart(6, '0')}`,
  role,
  status: 'active',
  isEmailVerified: true,
  isPhoneOtpVerified: true,
  isProfileSetup: true,
  termsAcceptedAt: new Date(),
  registerWith: 'credentials',
  timeZone: 'Europe/London',
  country: 'GB',
  expireAt: null, // TTL index would delete the user after 60 min otherwise
})

async function main() {
  await mongoose.connect(url)
  console.log('connected to load DB')
  await mongoose.connection.dropDatabase()
  await Promise.all([User.init(), Feed.init(), ContentMeta.init(), Report.init()])

  const hash = bcrypt.hashSync(PASSWORD, SALT)
  const t0 = Date.now()

  const admin = await User.create({
    ...base(1, USER_ROLE.admin, 'admin'),
    email: 'admin@loadtest.test',
    phoneNumber: '+447700900001',
    password: hash,
    firstName: 'Load',
    role: USER_ROLE.admin,
  })
  // admin created via create() so the pre-save hook hashes; we then overwrite with the same hash
  await User.updateOne({ _id: admin._id }, { password: hash })

  const consultDocs = Array.from({ length: N_CONSULT }, (_, i) => ({
    ...base(i, USER_ROLE.consult, 'consult'),
    password: hash,
  }))
  const expertDocs = Array.from({ length: N_EXPERT }, (_, i) => {
    const rate = 60 + Math.round((i / (N_EXPERT - 1)) * 90)
    return {
      ...base(i, USER_ROLE.expert, 'expert'),
      password: hash,
      hourlyRate: rate,
      isVatRegistered: false,
      sessionDurations: [
        { type: 'Discussion', duration: 30, offeredPrice: rate / 2, isOffered: true },
        { type: 'Deep Dive', duration: 60, offeredPrice: rate, isOffered: true },
      ],
      bookingRules: { minNotice: 2, bookingHorizonDays: 60, slotBufferStep: 5, bufferRules: bufferRules(5) },
      availability: DAYS.map((day) => ({ day, slots: [{ from: '08:00', to: '20:00' }] })),
      bio: `Load test expert ${i}`,
      headline: `Expert ${i}`,
      expertise: ['Real Estate'],
      skills: ['Investment'],
      languages: ['English'],
      isTopExpert: i < 10,
      avgRating: 4 + (i % 10) / 10,
      ratingCount: 10 + i,
    }
  })
  const refDocs = Array.from({ length: N_REF_USERS }, (_, i) => ({
    ...base(i, USER_ROLE.consult, 'ref'),
    password: hash,
  }))

  const consults = await User.insertMany(consultDocs, { ordered: false })
  const experts = await User.insertMany(expertDocs, { ordered: false })
  const refUsers = await User.insertMany(refDocs, { ordered: false, rawResult: false })
  console.log(`users: consult=${consults.length} expert=${experts.length} ref=${refUsers.length}`)

  const feedMetas = await ContentMeta.insertMany(
    Array.from({ length: N_FEEDS }, () => ({ like: 0, comment: 0 })),
  )
  const feedDocs = feedMetas.map((meta: any, i: number) => ({
    author: experts[i % N_EXPERT]._id,
    contentMeta: meta._id,
    content: [],
    description: `Load test post ${i}`,
    status: 'active',
    moderationStatus: i < N_REPORTS ? 'pending_review' : null,
    isDeleted: false,
  }))
  const feeds = await Feed.insertMany(feedDocs, { ordered: false })
  console.log(`feeds=${feeds.length}`)

  // Seeded reports: consultee i reports feed i (reporters 0..99). The POST /reports load
  // uses reporters 100..199 so every load request is a unique (reporter, feed) pair.
  const reports = Array.from({ length: N_REPORTS }, (_, i) => ({
    author: consults[i]._id,
    feed: feeds[i]._id,
    feedAuthor: feeds[i].author,
    reason: 'Load test seeded report',
  }))
  await Report.insertMany(reports, { ordered: false })

  const fixtures = {
    generatedAt: new Date().toISOString(),
    database: url,
    password: PASSWORD,
    counts: { consult: N_CONSULT, expert: N_EXPERT, feeds: N_FEEDS, reports: N_REPORTS, refUsers: N_REF_USERS },
    admin: { id: String(admin._id), email: admin.email, token: sign(admin) },
    consultees: consults.map((u: any) => ({ id: String(u._id), email: u.email, token: sign(u) })),
    experts: experts.map((u: any) => ({
      id: String(u._id), email: u.email, token: sign(u), referralCode: u.referralCode, hourlyRate: u.hourlyRate,
    })),
    refUsers: refUsers.map((u: any) => ({ id: String(u._id), email: u.email, token: sign(u) })),
    feeds: feeds.map((f: any) => ({ id: String(f._id), author: String(f.author) })),
    reportedFeedIds: feeds.slice(0, N_REPORTS).map((f: any) => String(f._id)),
    bookings: [] as Array<{ id: string; userIndex: number }>,
  }
  fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true })
  fs.writeFileSync(path.join(__dirname, 'results', 'fixtures.json'), JSON.stringify(fixtures))
  console.log(`fixtures written; seed took ${Date.now() - t0} ms`)
  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error('seed failed', err)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})

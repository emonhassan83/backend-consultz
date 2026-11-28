/* Load runner (autocannon 7, in-process). Usage:
 *   node loadtest/run.js main            scenario matrix at 10 and 50 connections, 20s each
 *   node loadtest/run.js stress          ramp 10..400 connections on 4 endpoints, 15s each
 *   node loadtest/run.js profile a,b,c   20s at 50 conns with Mongo profiler on, per scenario id
 *   node loadtest/run.js list            print scenario ids
 * Requires the API running on 127.0.0.1:5099 and loadtest/results/fixtures.json. */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const autocannon = require('./node_modules/autocannon')

const RES = path.join(__dirname, 'results')
const FX = JSON.parse(fs.readFileSync(path.join(RES, 'fixtures.json'), 'utf8'))
const BASE = 'http://127.0.0.1:5099'
const API = BASE + '/api/v1'
const MARKERS = path.join(RES, 'markers.jsonl')
const LOAD_DB_URL = 'mongodb://localhost:27098/consultz_load?replicaSet=rs0&directConnection=true'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Runs mongosh inside the throwaway container only (never the .env database)
const mongo = (js) => {
  if (!LOAD_DB_URL.includes('localhost:27098')) throw new Error('not the load DB')
  return execFileSync('docker', ['exec', 'consultz-loadtest', 'mongosh', '--quiet', 'consultz_load', '--eval', js], { encoding: 'utf8' })
}

// Small JSON POST helper for setup hooks (node http, explicit Content-Length)
const httpPost = (urlPath, body) => new Promise((resolve, reject) => {
  const req = require('http').request(BASE + urlPath, {
    method: 'POST', agent: false,
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
  }, (res) => {
    let data = ''
    res.setEncoding('utf8')
    res.on('data', (d) => { data += d })
    res.on('end', () => resolve(data))
  })
  req.on('error', reject)
  req.end(body)
})

const c = (i) => FX.consultees[i % FX.consultees.length]
const e = (i) => FX.experts[i % FX.experts.length]
const JSON_CT = { 'content-type': 'application/json' }
const AUTH = (tok) => ({ authorization: tok })
const dayOffset = (d) => new Date(Date.now() + d * 86400e3).toISOString().slice(0, 10)
const MP_BOUNDARY = 'XLOADB'

// Each scenario: method, path(i), headers(i), body(i), optional pre hook
const scenarios = [
  { id: 'health-categories', method: 'GET', path: () => '/api/v1/categories', headers: () => ({}) },
  { id: 'auth-login-ok', method: 'POST', path: () => '/api/v1/auth/login', headers: () => JSON_CT,
    body: (i) => JSON.stringify({ email: c(i).email, password: FX.password }) },
  { id: 'auth-login-wrong-password', method: 'POST', path: () => '/api/v1/auth/login', headers: () => JSON_CT,
    body: (i) => JSON.stringify({ email: c(i).email, password: 'WrongPass1' }) },
  { id: 'auth-forget-password', method: 'POST', path: () => '/api/v1/auth/forget-password', headers: () => JSON_CT,
    body: (i) => JSON.stringify({ email: c(i).email }) },
  { id: 'otp-send-email', method: 'POST', path: () => '/api/v1/otp/send-otp-in-email', headers: () => JSON_CT,
    body: (i) => JSON.stringify({ email: c(i).email }) },
  { id: 'otp-verify-wrong', method: 'POST', path: () => '/api/v1/otp/verify-with-email',
    headers: () => ({ ...JSON_CT, authorization: FX.otpToken }), body: () => JSON.stringify({ otp: '0000' }),
    // The verify token expires after 5 minutes, so mint a fresh one before each run
    pre: async () => {
      const body = JSON.stringify({ email: FX.consultees[0].email })
      const raw = await httpPost('/api/v1/otp/send-otp-in-email', body)
      FX.otpToken = JSON.parse(raw).data.token
    } },
  { id: 'users-my-profile', method: 'GET', path: () => '/api/v1/users/my-profile', headers: (i) => AUTH(c(i).token) },
  { id: 'users-get-expert-by-id', method: 'GET', path: (i) => `/api/v1/users/${e(i).id}`, headers: (i) => AUTH(c(i).token) },
  { id: 'users-admin-list', method: 'GET', path: () => '/api/v1/users?page=1&limit=20', headers: () => AUTH(FX.admin.token) },
  { id: 'users-update-profile-bio', method: 'PUT', path: () => '/api/v1/users/update-profile',
    headers: (i) => ({ ...AUTH(e(i).token), 'content-type': `multipart/form-data; boundary=${MP_BOUNDARY}` }),
    body: (i) => `--${MP_BOUNDARY}\r\nContent-Disposition: form-data; name="data"\r\n\r\n{"bio":"load bio ${i}"}\r\n--${MP_BOUNDARY}--\r\n` },
  { id: 'users-public-top-experts', method: 'GET', path: () => '/api/v1/users/public/top-experts?page=1&limit=10', headers: () => ({}) },
  { id: 'users-public-interest-experts', method: 'GET', path: () => '/api/v1/users/public/interest-experts?page=1&limit=10', headers: () => ({}) },
  { id: 'users-register-unique', method: 'POST', path: () => '/api/v1/users/register', headers: () => JSON_CT,
    body: (i) => JSON.stringify({ firstName: 'Load', lastName: 'Reg', email: `reg.${Date.now()}.${i}@loadtest.test`,
      password: 'Passw0rd!', confirmPass: 'Passw0rd!', dob: '1990-01-01', phoneNumber: `+44790${String(i + 1000000).padStart(7, '0')}` }),
    // Remove users registered by earlier runs so phone and email stay unique
    pre: () => mongo('db.users.deleteMany({email: /^reg[.]/}).deletedCount') },
  { id: 'referral-use-code', method: 'PATCH', path: () => '/api/v1/users/use-referral-code',
    headers: (i) => ({ ...AUTH(FX.refUsers[i % FX.refUsers.length].token), ...JSON_CT }),
    body: (i) => JSON.stringify({ referralCode: e(i).referralCode }),
    // Reset the referral state of the 8000 ref users so each run starts with unused referrals
    pre: () => mongo('db.users.updateMany({email: /^ref[0-9]+@/}, {$unset: {referredBy: "", attributedExpert: "", attributedAt: "", pendingReferralReward: ""}}).modifiedCount') },
  { id: 'bookings-create', method: 'POST', path: () => '/api/v1/bookings', headers: (i) => ({ ...AUTH(c(i).token), ...JSON_CT }),
    body: (i) => {
      const d = i % 2 ? 30 : 60
      return JSON.stringify({ consult: e(i).id, date: dayOffset(3 + (i % 45)), startTime: `${String(8 + (i % 9)).padStart(2, '0')}:00`,
        sessionType: d === 30 ? 'discussion' : 'deep_drive', sessionDuration: d,
        mainQuestion: 'load test', challengeQuestion: 'load test', backgroundQuestion: 'load test' })
    } },
  { id: 'payments-checkout', method: 'POST', path: () => '/api/v1/payments/checkout',
    headers: (i) => ({ ...AUTH(FX.consultees[FX.bookings[i % FX.bookings.length].userIndex].token), ...JSON_CT }),
    body: (i) => JSON.stringify({ booking: FX.bookings[i % FX.bookings.length].id }) },
  { id: 'feeds-active-feed', method: 'GET', path: () => '/api/v1/feeds/active-feed?page=1&limit=10', headers: (i) => AUTH(c(i).token) },
  { id: 'feeds-get-by-id', method: 'GET', path: (i) => `/api/v1/feeds/${FX.feeds[i % FX.feeds.length].id}`, headers: (i) => AUTH(c(i).token) },
  { id: 'feeds-admin-pending-review', method: 'GET', path: () => '/api/v1/feeds?moderationStatus=pending_review&limit=10', headers: () => AUTH(FX.admin.token) },
  { id: 'reports-create-unique', method: 'POST', path: () => '/api/v1/reports', headers: (i) => ({ ...AUTH(c(100 + (i % 100)).token), ...JSON_CT }),
    // (reporter, feed) pair is unique for every i below 50,000 (100 reporters x 500 feeds)
    body: (i) => JSON.stringify({ feed: FX.feeds[Math.floor(i / 100) % FX.feeds.length].id, reason: 'load test report' }),
    // Remove reports from earlier runs so every (reporter, feed) pair is new
    pre: () => mongo('db.reports.deleteMany({reason: "load test report"}).deletedCount') },
  { id: 'notifications-admin', method: 'GET', path: () => '/api/v1/notifications', headers: () => AUTH(FX.admin.token) },
  { id: 'users-change-status-warning', method: 'PATCH', path: () => '/api/v1/users/change-status', headers: () => ({ ...AUTH(FX.admin.token), ...JSON_CT }),
    body: (i) => JSON.stringify({ userId: c(i).id, status: i % 2 ? 'warning' : 'active', reason: 'load test' }) },
  { id: 'reports-admin-list', method: 'GET', path: () => '/api/v1/reports?page=1&limit=10', headers: () => AUTH(FX.admin.token) },
]

const STRESS_IDS = ['users-my-profile', 'users-get-expert-by-id', 'feeds-active-feed', 'auth-login-ok']
const STRESS_LEVELS = [10, 50, 100, 200, 400]
const byId = (id) => scenarios.find((s) => s.id === id)

const pctOf = (lat, key) => (lat && lat[key] !== undefined ? lat[key] : null)

const DUR_OVERRIDE = Number(process.env.LOAD_DURATION) || null

async function runOne({ id, method, pathFn, headersFn, bodyFn, pre, connections, duration = 20, group }) {
  if (DUR_OVERRIDE) duration = DUR_OVERRIDE
  if (pre) await pre()
  let i = 0
  const statusCounts = {}
  const samples = {}
  const req = {
    method,
    setupRequest: (r) => {
      const n = i++
      r.path = pathFn(n)
      r.headers = headersFn(n)
      if (bodyFn) r.body = bodyFn(n)
      return r
    },
    onResponse: (status, body) => {
      statusCounts[status] = (statusCounts[status] || 0) + 1
      if (status >= 300 && !samples[status]) samples[status] = String(body).slice(0, 300)
    },
  }
  // Initial values so autocannon has a valid request before setupRequest runs
  req.path = pathFn(0)
  req.headers = headersFn(0)
  if (bodyFn) req.body = bodyFn(0)

  const start = Date.now()
  const result = await autocannon({ url: BASE, connections, pipelining: 1, duration, requests: [req] })
  const end = Date.now()
  fs.appendFileSync(MARKERS, JSON.stringify({ group, id, connections, start, end }) + '\n')

  const out = {
    group, id, method, connections, pipelining: 1, durationS: duration, startedAt: start, endedAt: end,
    requestsPerSec: { mean: result.requests.average, total: result.requests.total, sent: result.requests.sent },
    latencyMs: {
      p50: pctOf(result.latency, 'p50'), p90: pctOf(result.latency, 'p90'), p97_5: pctOf(result.latency, 'p97_5'),
      p99: pctOf(result.latency, 'p99'), max: pctOf(result.latency, 'max'), mean: pctOf(result.latency, 'average'),
    },
    statusCounts,
    non2xx: result.non2xx,
    errors: result.errors,
    timeouts: result.timeouts,
    samples,
    raw: { latency: result.latency, requests: result.requests },
  }
  fs.writeFileSync(path.join(RES, `${group}__${id}__c${connections}.json`), JSON.stringify(out, null, 2))
  console.log(`[${group}] ${id} c=${connections} rps=${out.requestsPerSec.mean} p50=${out.latencyMs.p50} p99=${out.latencyMs.p99} total=${out.requestsPerSec.total} non2xx=${result.non2xx} err=${result.errors} to=${result.timeouts} codes=${JSON.stringify(statusCounts)}`)
  return out
}

async function assertAlive() {
  const r = await fetch(API + '/categories').catch(() => null)
  if (!r || r.status !== 200) throw new Error('server not responding on 5099')
}

async function main() {
  const mode = process.argv[2] || 'main'
  if (mode === 'list') return scenarios.forEach((s) => console.log(s.id))

  if (mode === 'main' || mode === 'all') {
    for (const s of scenarios) {
      for (const conn of [10, 50]) {
        await assertAlive()
        try {
          await runOne({ group: 'main', id: s.id, method: s.method, pathFn: s.path, headersFn: s.headers, bodyFn: s.body, pre: s.pre, connections: conn })
        } catch (err) {
          console.log(`[main] ${s.id} c=${conn} FAILED: ${err && err.message}`)
        }
        await sleep(2000)
      }
    }
  }

  if (mode === 'stress' || mode === 'all') {
    for (const id of STRESS_IDS) {
      const s = byId(id)
      for (const conn of STRESS_LEVELS) {
        await assertAlive()
        let r
        try {
          r = await runOne({ group: 'stress', id: s.id, method: s.method, pathFn: s.path, headersFn: s.headers, bodyFn: s.body, pre: s.pre, connections: conn, duration: 15 })
        } catch (err) {
          console.log(`  stress ${id} c=${conn} FAILED: ${err && err.message} -> STOP RAMP`)
          break
        }
        const total = Math.max(r.requestsPerSec.total, 1)
        const bad = (r.non2xx || 0) + (r.errors || 0) + (r.timeouts || 0)
        const errRate = bad / total
        const stop = errRate > 0.05 || (r.latencyMs.p99 || 0) > 5000
        console.log(`  stress ${id} c=${conn} errRate=${(errRate * 100).toFixed(2)}% p99=${r.latencyMs.p99}${stop ? '  -> STOP RAMP' : ''}`)
        if (stop) break
        await sleep(2000)
      }
    }
  }

  if (mode === 'profile') {
    const ids = (process.argv[3] || '').split(',').filter(Boolean)
    for (const id of ids) {
      const s = byId(id)
      await assertAlive()
      mongo('db.setProfilingLevel(0); db.system.profile.drop(); db.createCollection("system.profile", {capped: true, size: 8388608}); db.setProfilingLevel(1, {slowms: 20}).ok')
      await runOne({ group: 'profile', id: s.id, method: s.method, pathFn: s.path, headersFn: s.headers, bodyFn: s.body, pre: s.pre, connections: 50, duration: 20 })
      const prof = mongo(
        'db.setProfilingLevel(0); JSON.stringify({ byShape: db.system.profile.aggregate([' +
        '{$group: {_id: {ns: "$ns", op: "$op", plan: "$planSummary"}, count: {$sum: 1}, maxMillis: {$max: "$millis"}, avgMillis: {$avg: "$millis"}, maxDocsExamined: {$max: "$docsExamined"}, maxKeysExamined: {$max: "$keysExamined"}}},' +
        '{$sort: {maxMillis: -1}}, {$limit: 25}]).toArray(), ' +
        'slowest: db.system.profile.find({}, {ns: 1, op: 1, millis: 1, planSummary: 1, docsExamined: 1, keysExamined: 1, nreturned: 1, "command.filter": 1, "command.sort": 1}).sort({millis: -1}).limit(20).toArray() })'
      )
      fs.writeFileSync(path.join(RES, `profile__${id}.json`), prof)
      console.log(`profile written for ${id}`)
    }
  }
}

main().catch((err) => { console.error('RUN FAILED', err); process.exit(1) })

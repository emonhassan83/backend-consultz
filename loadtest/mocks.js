/* Loaded with `node -r ./loadtest/mocks.js ...` BEFORE the app.
 * Replaces external SDKs with in-process fakes (no network), counts calls,
 * and writes process metrics once per second to results/proc-metrics.jsonl. */
'use strict'
const Module = require('module')
const path = require('path')
const fs = require('fs')
const { monitorEventLoopDelay } = require('perf_hooks')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const counters = { email: 0, stripe: 0, twilio: 0, firebase: 0 }
globalThis.__loadMocks = counters

// Generic deep fake: any property is a callable that resolves after ~30ms
// to a plausible object. `then` is never provided, so it is safe to await.
let seq = 0
function deepFake(label, kind) {
  const make = (name) => {
    const target = function () {}
    return new Proxy(target, {
      get(_t, prop) {
        if (prop === 'then' || typeof prop === 'symbol') return undefined
        return make(`${name}.${String(prop)}`)
      },
      apply(_t, _this, args) {
        counters[kind]++
        const n = ++seq
        return sleep(30).then(() => {
          const first = args[0]
          const id = typeof first === 'string' && /^[a-z]{2,4}_/.test(first) ? first : `${label}_mock_${n}`
          const amount = first && typeof first === 'object' && first.amount ? first.amount : 0
          return {
            id,
            object: name,
            client_secret: `${id}_secret_mock`,
            secret: `ek_mock_${n}`,
            url: 'https://mock.invalid/checkout',
            status: 'requires_payment_method',
            amount,
            currency: 'gbp',
            metadata: (first && first.metadata) || {},
            customer: first && first.customer ? first.customer : `cus_mock_${n}`,
            data: [],
            livemode: false,
          }
        })
      },
    })
  }
  return make(label)
}

// ---- nodemailer ----
const nodemailerMock = {
  createTransport() {
    return {
      sendMail: async () => {
        counters.email++
        await sleep(20)
        return { messageId: 'mock' }
      },
      verify: async () => true,
    }
  },
}
nodemailerMock.default = nodemailerMock
nodemailerMock.__esModule = true

// ---- stripe (class; exported as module.exports and .default) ----
class StripeMock {
  constructor() {
    const self = this
    return new Proxy(this, {
      get(t, prop) {
        if (prop in t || typeof prop === 'symbol' || prop === 'then') return t[prop]
        const ns = deepFake(`stripe_${String(prop)}`, 'stripe')
        t[prop] = ns
        return ns
      },
    })
  }
}
const StripeExport = StripeMock
StripeExport.default = StripeMock
StripeExport.__esModule = true

// ---- twilio ----
const twilioMock = function twilio() {
  return new Proxy(
    {},
    {
      get(t, prop) {
        if (prop === 'then' || typeof prop === 'symbol') return undefined
        if (!(prop in t)) t[prop] = deepFake(`twilio_${String(prop)}`, 'twilio')
        return t[prop]
      },
    },
  )
}
twilioMock.default = twilioMock

// ---- firebase-admin ----
const messagingMock = {
  getMessaging() {
    const count = (arg) => (Array.isArray(arg?.tokens) ? arg.tokens.length : 1)
    const mk = (result) => async (msg) => {
      counters.firebase++
      await sleep(15)
      return result(msg)
    }
    return {
      send: mk(() => `projects/mock/messages/${++seq}`),
      sendEach: mk((msgs) => ({ successCount: (msgs || []).length, failureCount: 0, responses: (msgs || []).map(() => ({ success: true, messageId: `m${++seq}` })) })),
      sendEachForMulticast: mk((m) => ({ successCount: count(m), failureCount: 0, responses: [] })),
    }
  },
}
const appMock = {
  initializeApp: () => ({ name: '[DEFAULT]' }),
  cert: (x) => x,
  getApps: () => [],
  getApp: () => ({ name: '[DEFAULT]' }),
}
messagingMock.__esModule = true
appMock.__esModule = true

// ---- agora-access-token (real impl is pure crypto, left as-is) ----

const mocked = {
  nodemailer: nodemailerMock,
  stripe: StripeExport,
  twilio: twilioMock,
  'firebase-admin/app': appMock,
  'firebase-admin/messaging': messagingMock,
}

const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(mocked, request)) {
    return mocked[request]
  }
  return originalLoad.apply(this, arguments)
}


// voipService reads certs/AuthKey_<id>.p8 at import time. Serve a throwaway
// P-256 key for that path so nothing is written into the repo.
const crypto = require('crypto')
const realReadFileSync = fs.readFileSync
let fakeApnsKey = null
fs.readFileSync = function (file, ...rest) {
  if (typeof file === 'string' && /AuthKey_[^\/]*.p8$/.test(file) && !fs.existsSync(file)) {
    if (!fakeApnsKey) {
      fakeApnsKey = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
        .privateKey.export({ type: 'pkcs8', format: 'pem' })
    }
    return fakeApnsKey
  }
  return realReadFileSync.call(this, file, ...rest)
}

// ---- process metrics, 1 line per second ----
const resultsDir = path.join(__dirname, 'results')
fs.mkdirSync(resultsDir, { recursive: true })
const metricsFile = path.join(resultsDir, 'proc-metrics.jsonl')
const eld = monitorEventLoopDelay({ resolution: 10 })
eld.enable()
let prevCpu = process.cpuUsage()
const timer = setInterval(() => {
  const mem = process.memoryUsage()
  const cpu = process.cpuUsage(prevCpu)
  prevCpu = process.cpuUsage()
  const p99 = eld.count > 0 ? eld.percentile(99) / 1e6 : 0
  const max = eld.count > 0 ? eld.max / 1e6 : 0
  eld.reset()
  const line = {
    t: Date.now(),
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    cpuUserMs: cpu.user / 1000,
    cpuSystemMs: cpu.system / 1000,
    eventLoopDelayP99: Number(p99.toFixed(2)),
    eventLoopDelayMax: Number(max.toFixed(2)),
    mocks: { ...counters },
  }
  fs.appendFile(metricsFile, JSON.stringify(line) + '\n', () => {})
}, 1000)
timer.unref()

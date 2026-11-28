// Setup phase (server must be running): pre-creates bookings via the real
// POST /bookings for the checkout scenario, and fetches an OTP token for the
// OTP-verify scenario. Writes results/fixtures.json in place.
const fs = require('fs')
const path = require('path')
const FX = path.join(__dirname, 'results', 'fixtures.json')
const fx = JSON.parse(fs.readFileSync(FX, 'utf8'))
const B = 'http://127.0.0.1:5099/api/v1'
const BOOKINGS_PER_CONSULT = Number(process.env.BOOKINGS_PER_CONSULT || 5)

const dayOffset = (d) => new Date(Date.now() + d * 86400e3).toISOString().slice(0, 10)
const post = async (p, body, token) => {
  const r = await fetch(B + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: token } : {}) },
    body: JSON.stringify(body),
  })
  return { status: r.status, json: await r.json().catch(() => null) }
}

;(async () => {
  // OTP token for verify-with-email scenario
  const otp = await post('/otp/send-otp-in-email', { email: fx.consultees[0].email })
  if (otp.status !== 200) throw new Error('send-otp failed ' + otp.status)
  fx.otpToken = otp.json.data.token

  // Bookings: consultee i books BOOKINGS_PER_CONSULT sessions with rotating experts
  const jobs = []
  let k = 0
  for (let i = 0; i < fx.consultees.length; i++) {
    for (let j = 0; j < BOOKINGS_PER_CONSULT; j++) {
      jobs.push({ userIndex: i, n: k++ })
    }
  }
  fx.bookings = []
  let created = 0, failed = 0, firstFail = null
  const CONC = 20
  let cursor = 0
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++]
      const expert = fx.experts[job.n % fx.experts.length]
      const duration = job.n % 2 ? 30 : 60
      const hour = 8 + (job.n % 9)
      const r = await post('/bookings', {
        consult: expert.id,
        date: dayOffset(3 + (job.n % 45)),
        startTime: `${String(hour).padStart(2, '0')}:00`,
        sessionType: duration === 30 ? 'discussion' : 'deep_drive',
        sessionDuration: duration,
        mainQuestion: 'load test',
        challengeQuestion: 'load test',
        backgroundQuestion: 'load test',
      }, fx.consultees[job.userIndex].token)
      if (r.status === 201) {
        created++
        fx.bookings.push({ id: r.json.data._id, userIndex: job.userIndex })
      } else {
        failed++
        if (!firstFail) firstFail = `${r.status} ${JSON.stringify(r.json).slice(0, 200)}`
      }
    }
  }))
  fs.writeFileSync(FX, JSON.stringify(fx))
  console.log(`bookings created=${created} failed=${failed}${firstFail ? ' firstFail=' + firstFail : ''}; otpToken set`)
})().catch((e) => { console.error(e); process.exit(1) })

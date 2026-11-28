// One request per planned endpoint, to confirm request shapes before load.
const fx = require('./results/fixtures.json')
const B = 'http://127.0.0.1:5099/api/v1'
const c0 = fx.consultees[0], e0 = fx.experts[0], ex = fx.experts[1]
const dateStr = new Date(Date.now() + 3 * 86400e3).toISOString().slice(0, 10)
const call = async (name, method, path, token, body, raw) => {
  const headers = {}
  if (token) headers.authorization = token
  if (body !== undefined && !raw) headers['content-type'] = 'application/json'
  const r = await fetch(B + path, { method, headers, body: body === undefined ? undefined : (raw ? body : JSON.stringify(body)) })
  const txt = await r.text()
  console.log(`${r.status} ${method} ${path} [${name}] ${txt.slice(0, 220)}`)
  return { status: r.status, txt }
}
;(async () => {
  await call('health', 'GET', '/categories')
  await call('login ok', 'POST', '/auth/login', null, { email: c0.email, password: fx.password })
  await call('login bad', 'POST', '/auth/login', null, { email: c0.email, password: 'WrongPass1' })
  await call('forget', 'POST', '/auth/forget-password', null, { email: c0.email })
  await call('otp send email', 'POST', '/otp/send-otp-in-email', null, { email: c0.email })
  await call('otp verify wrong', 'POST', '/otp/verify-with-email', null, { otp: '0000' })
  await call('my-profile', 'GET', '/users/my-profile', c0.token)
  await call('user by id expert', 'GET', `/users/${ex.id}`, c0.token)
  await call('users admin', 'GET', '/users?page=1&limit=10', fx.admin.token)
  await call('top experts public', 'GET', '/users/public/top-experts')
  await call('update-profile', 'PUT', '/users/update-profile', e0.token,
    '--XB\r\nContent-Disposition: form-data; name="data"\r\n\r\n{"bio":"load bio"}\r\n--XB--\r\n', true)
  await call('register', 'POST', '/users/register', null, {
    firstName: 'Reg', lastName: 'Probe', email: `reg.probe.${Date.now()}@loadtest.test`, password: 'Passw0rd!',
    confirmPass: 'Passw0rd!', dob: '1990-01-01', phoneNumber: `+4475${String(Date.now()).slice(-8)}`, referralCode: e0.referralCode,
  })
  await call('use-referral', 'PATCH', '/users/use-referral-code', fx.refUsers[0].token, { referralCode: e0.referralCode })
  await call('booking', 'POST', '/bookings', c0.token, {
    consult: ex.id, date: dateStr, startTime: '10:00', sessionType: 'discussion', sessionDuration: 30,
    mainQuestion: 'q', challengeQuestion: 'q', backgroundQuestion: 'q',
  })
  await call('active-feed', 'GET', '/feeds/active-feed', c0.token)
  await call('feeds admin pending', 'GET', '/feeds?moderationStatus=pending_review&limit=10', fx.admin.token)
  await call('feed by id', 'GET', `/feeds/${fx.feeds[0].id}`, c0.token)
  await call('report', 'POST', '/reports', fx.consultees[150].token, { feed: fx.feeds[300].id, reason: 'spam probe' })
  await call('notifications admin', 'GET', '/notifications', fx.admin.token)
  await call('change-status', 'PATCH', '/users/change-status', fx.admin.token, { userId: fx.consultees[5].id, status: 'warning', reason: 'probe' })
  await call('reports admin', 'GET', '/reports?limit=5', fx.admin.token)
})()

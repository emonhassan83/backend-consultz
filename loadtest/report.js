/* Builds loadtest/results/summary.md from the per-run JSON files and proc-metrics.jsonl.
 * Usage: node loadtest/report.js */
'use strict'
const fs = require('fs')
const path = require('path')

const RES = path.join(__dirname, 'results')
const MB = (b) => (b / 1048576).toFixed(1)
const f2 = (x) => (x === null || x === undefined ? '-' : Number(x).toFixed(2))

const runs = fs.readdirSync(RES)
  .filter((f) => /^(main|stress|profile)__.*\.json$/.test(f))
  .map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(RES, f), 'utf8')) }))
  .sort((a, b) => a.startedAt - b.startedAt)

const samples = fs.readFileSync(path.join(RES, 'proc-metrics.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l))
  .sort((a, b) => a.t - b.t)

// Per-run window metrics
function windowStats(start, end) {
  const w = samples.filter((s) => s.t >= start && s.t <= end)
  if (!w.length) return null
  const rss = w.map((s) => s.rss)
  const heap = w.map((s) => s.heapUsed)
  const cpuMs = w.reduce((a, s) => a + s.cpuUserMs + s.cpuSystemMs, 0)
  const spanMs = Math.max(1, w[w.length - 1].t - w[0].t)
  const cpuPerSec = w.map((s) => ((s.cpuUserMs + s.cpuSystemMs) / 1000) * 100)
  const eld = w.map((s) => s.eventLoopDelayP99)
  return {
    n: w.length,
    rssPeakMB: MB(Math.max(...rss)),
    rssMeanMB: MB(rss.reduce((a, b) => a + b, 0) / rss.length),
    heapPeakMB: MB(Math.max(...heap)),
    heapMeanMB: MB(heap.reduce((a, b) => a + b, 0) / heap.length),
    cpuMeanPct: ((cpuMs / spanMs) * 100).toFixed(0),
    cpuPeakPct: Math.max(...cpuPerSec).toFixed(0),
    eldP99Peak: Math.max(...eld).toFixed(1),
    eldP99Mean: (eld.reduce((a, b) => a + b, 0) / eld.length).toFixed(1),
    rssEndMB: MB(rss[rss.length - 1]),
  }
}

function pct2xx(r) {
  const total = Object.values(r.statusCounts).reduce((a, b) => a + b, 0)
  const ok = Object.entries(r.statusCounts).filter(([k]) => k.startsWith('2')).reduce((a, [, v]) => a + v, 0)
  return total ? ((ok / total) * 100).toFixed(2) : '-'
}
function non2xxStr(r) {
  const parts = Object.entries(r.statusCounts).filter(([k]) => !k.startsWith('2')).map(([k, v]) => `${k}:${v}`)
  return parts.length ? parts.join(' ') : '0'
}

const lines = []
const p = (s = '') => lines.push(s)

p('# Load test summary')
p()
p(`Generated ${new Date().toISOString()} from ${runs.length} run files.`)
p()
p('## Setup')
p()
p('- Hardware: 16 cores (Windows 11, Git Bash), Node v22.17.0, server run as `node -r ./loadtest/mocks.js dist/server.js` (compiled build, `NODE_ENV=production`, `BCRYPT_SALT_ROUNDS=12`).')
p('- Database: `mongo:7` in a throwaway Docker container (single-node replica set, port 27098), database `consultz_load`. Container stopped at the end.')
p('- External services mocked in-process (`loadtest/mocks.js`): nodemailer (20 ms), Stripe (30 ms per call), Twilio (30 ms), Firebase messaging (15 ms). No real network calls.')
p('- Load generator: autocannon 7.15.0 in one Node process (single thread), pipelining 1, 20 s per run (15 s for stress).')
p('- Seed: 1 admin, 200 consultees, 50 experts, 8,000 referral-eligible consultees, 500 feed posts (100 pending review), 100 seeded reports, 1,000 pre-created bookings (via POST /bookings), 14 points rules, 5 categories, content seeded.')
p('- The node UV threadpool is at the default size (4). bcrypt runs on it, so login throughput is bounded by that pool.')
p()

// ---- main matrix ----
const main = runs.filter((r) => r.group === 'main')
p('## Scenario matrix (20 s per run)')
p()
p('p95 is not in autocannon 7 output, so the table shows p97.5 (labelled). RSS/CPU/event-loop values are the server process during that run window.')
p()
p('| Scenario | Method | Conns | RPS | p50 ms | p97.5 ms | p99 ms | max ms | Total reqs | 2xx % | Non-2xx by code | Errors / timeouts | RSS peak MB | CPU mean % | ELD p99 peak ms |')
p('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
for (const r of main) {
  const w = windowStats(r.startedAt, r.endedAt) || {}
  p(`| ${r.id} | ${r.method} | ${r.connections} | ${f2(r.requestsPerSec.mean)} | ${f2(r.latencyMs.p50)} | ${f2(r.latencyMs.p97_5)} | ${f2(r.latencyMs.p99)} | ${f2(r.latencyMs.max)} | ${r.requestsPerSec.total} | ${pct2xx(r)} | ${non2xxStr(r)} | ${r.errors || 0} / ${r.timeouts || 0} | ${w.rssPeakMB || '-'} | ${w.cpuMeanPct || '-'} | ${w.eldP99Peak || '-'} |`)
}
p()

// ---- stress ----
const stress = runs.filter((r) => r.group === 'stress')
if (stress.length) {
  p('## Stress ramps (15 s per level)')
  p()
  p('Ramp stops after the first level with error rate > 5% (non-2xx + socket errors + timeouts over total) or p99 > 5 s.')
  p()
  const ids = [...new Set(stress.map((r) => r.id))]
  for (const id of ids) {
    p(`### ${id}`)
    p()
    p('| Conns | RPS | p50 ms | p97.5 ms | p99 ms | max ms | Total reqs | Non-2xx | Errors / timeouts | Error rate | RSS peak MB | CPU mean % | ELD p99 peak ms |')
    p('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    for (const r of stress.filter((x) => x.id === id)) {
      const w = windowStats(r.startedAt, r.endedAt) || {}
      const bad = (r.non2xx || 0) + (r.errors || 0) + (r.timeouts || 0)
      p(`| ${r.connections} | ${f2(r.requestsPerSec.mean)} | ${f2(r.latencyMs.p50)} | ${f2(r.latencyMs.p97_5)} | ${f2(r.latencyMs.p99)} | ${f2(r.latencyMs.max)} | ${r.requestsPerSec.total} | ${r.non2xx || 0} | ${r.errors || 0} / ${r.timeouts || 0} | ${((bad / Math.max(1, r.requestsPerSec.total)) * 100).toFixed(2)}% | ${w.rssPeakMB || '-'} | ${w.cpuMeanPct || '-'} | ${w.eldP99Peak || '-'} |`)
    }
    p()
  }
}

// ---- process metrics ----
p('## Process metrics')
p()
if (samples.length) {
  const first = samples[0]
  const last = samples[samples.length - 1]
  const allRss = samples.map((s) => s.rss)
  const allHeap = samples.map((s) => s.heapUsed)
  const allCpu = samples.map((s) => ((s.cpuUserMs + s.cpuSystemMs) / 1000) * 100)
  const allEld = samples.map((s) => s.eventLoopDelayP99)
  const allEldMax = samples.map((s) => s.eventLoopDelayMax || 0)
  p(`- Samples: ${samples.length} (1 per second) over ${((last.t - first.t) / 60000).toFixed(1)} min.`)
  p(`- RSS: first sample ${MB(first.rss)} MB, peak ${MB(Math.max(...allRss))} MB, last sample ${MB(last.rss)} MB.`)
  p(`- Heap used: first ${MB(first.heapUsed)} MB, peak ${MB(Math.max(...allHeap))} MB, last ${MB(last.heapUsed)} MB.`)
  p(`- CPU (1 second windows, % of one core, includes bcrypt threads): peak ${Math.max(...allCpu).toFixed(0)}%.`)
  p(`- Event-loop delay (per second, p99): peak ${Math.max(...allEld).toFixed(1)} ms; per-second max peak ${Math.max(...allEldMax).toFixed(1)} ms.`)
  p()

  // Cron spike check: seconds 0-2 of each minute vs the rest
  const atCron = samples.filter((s) => new Date(s.t).getSeconds() <= 2)
  const rest = samples.filter((s) => new Date(s.t).getSeconds() > 2)
  const avg = (a, k) => (a.length ? (a.reduce((x, s) => x + s[k], 0) / a.length).toFixed(1) : '-')
  const max = (a, k) => (a.length ? Math.max(...a.map((s) => s[k])).toFixed(1) : '-')
  p('Cron check (every-minute jobs fire near second 0):')
  p()
  p(`- ELD p99 in seconds 0-2 of a minute: mean ${avg(atCron, 'eventLoopDelayP99')} ms, max ${max(atCron, 'eventLoopDelayP99')} ms (${atCron.length} samples).`)
  p(`- ELD p99 in other seconds: mean ${avg(rest, 'eventLoopDelayP99')} ms, max ${max(rest, 'eventLoopDelayP99')} ms (${rest.length} samples).`)
  p()

  p('Per-run process metrics (window of each run):')
  p()
  p('| Run | Conns | RSS mean MB | RSS peak MB | RSS end MB | Heap mean MB | Heap peak MB | CPU mean % | CPU peak % | ELD p99 mean ms | ELD p99 peak ms |')
  p('|---|---|---|---|---|---|---|---|---|---|---|')
  for (const r of runs) {
    const w = windowStats(r.startedAt, r.endedAt)
    if (!w) continue
    p(`| ${r.group}/${r.id} | ${r.connections} | ${w.rssMeanMB} | ${w.rssPeakMB} | ${w.rssEndMB} | ${w.heapMeanMB} | ${w.heapPeakMB} | ${w.cpuMeanPct} | ${w.cpuPeakPct} | ${w.eldP99Mean} | ${w.eldP99Peak} |`)
  }
  p()
}

fs.writeFileSync(path.join(RES, 'summary.md'), lines.join('\n') + '\n')
console.log(`wrote ${path.join(RES, 'summary.md')} (${runs.length} runs)`)

# Load & Stress Test — Backend API

- **Date:** 2026-11-28
- **Build:** `main` at `cddd05d` plus the uncommitted 28 Nov changes (QA #12 phone validation, socket rooms, and the two fixes below)
- **Harness:** `loadtest/` (untracked). Raw results are in `loadtest/results-before/` (first run) and `loadtest/results/` (after the fixes). Each folder has a `summary.md`, one JSON per run, and `proc-metrics.jsonl`.

## Overall result

| | |
|---|---|
| Scenarios | 23 endpoint scenarios × 2 concurrency levels (10, 50) = 46 runs, plus 4 stress ramps up to 400 connections, 2 full runs (before and after the fixes) and a back-to-back A/B check |
| Requests served | About 117,000–122,000 per full run (matrix only), plus the stress ramps |
| Errors | **0 crashes, 0 socket errors, 0 timeouts** in the 10/50-connection matrix. The only non-2xx responses are the two negative scenarios (wrong password 403, wrong OTP 400), which return them by design |
| 5xx | First run: `GET /users/:id` returned **48 % HTTP 500 at 400 connections** (`WriteConflict`). **Fixed**; 0 errors at 50 / 200 / 400 after the fix |
| Throughput | Read endpoints: about 60–310 RPS at 10–50 connections (the categories baseline reaches about 515), then flat. Login/register: about 14 RPS in total (bcrypt cost 12, 4-thread pool) |
| Latency (10 connections) | p50 18–150 ms, p99 under 320 ms on every endpoint except login/register (p99 about 0.9–1 s) |
| Breaking point | p99 > 5 s at about 400 connections (profile, feeds) and about 100 connections (login) |
| Memory | Peak 415–446 MB RSS under 400 connections, back to 110 MB at the end. **No leak** |
| CPU / event loop | One process. CPU peak about 455 % (bcrypt threads). Event-loop p99 up to 224 ms under stress. Cron jobs cause no spikes |
| Fixes made | (1) transaction removed from the profile read (500s gone, 7× faster at 50 connections in the A/B); (2) 8 indexes, after which the admin user list reads 20 docs instead of 8,573 |
| Biggest remaining limits | No rate limiting; single Node process; bcrypt-bound login. See "Known limits" |

## Setup

| | |
|---|---|
| Server | `node -r ./loadtest/mocks.js dist/server.js` (compiled build), `NODE_ENV=production`, `BCRYPT_SALT_ROUNDS=12`, cron jobs on, a single Node process |
| Database | `mongo:7` in a throwaway Docker container (single-node replica set, port 27098). Never the `.env` database; every script refuses another URL |
| Mocked services | Loaded in-process by `loadtest/mocks.js`, with added latency: nodemailer/Brevo 20 ms, Stripe 30 ms, Twilio 30 ms, Firebase messaging 15 ms. The APNs key file is replaced with a throwaway key. No real network calls |
| Data | 1 admin, ~8,200 consultees, 50 experts, 500 posts (100 `pending_review`), 100 reports, 1,000+ bookings created through `POST /bookings`; the points rules, categories and content seeders |
| Load tool | autocannon 7.15.0, one process, pipelining 1. 20 s per run at 10 and 50 connections; stress ramps of 15 s per level at 10 / 50 / 100 / 200 / 400 |
| Machine | 16 cores, Windows 11, Node 22.17.0, Docker Desktop 28.3 |

**How to read these numbers:**
- **Not production figures.** Every database call crosses Docker Desktop's Windows port proxy (`com.docker.backend`), which adds roughly 1–2 ms per query. The load generator also runs on the same machine.
- **Use them to compare endpoints** and to find bottlenecks. Production on Linux, with the database on the network, will be faster per request.
- **Uneven background load.** Machine load was not constant, and the second full run was noisier: login, which is bcrypt-only and untouched by any change, ran at half speed in parts of it. So every before/after claim below is backed by an **A/B run done back-to-back in the same environment**, not by comparing the two full runs.
- **p95:** autocannon 7 doesn't report it, so the tables show **p97.5**.

## Results (first run, before the fixes)

20 s per run.

| Scenario | Method | Conns | RPS | p50 ms | p97.5 ms | p99 ms | 2xx % | Non-2xx |
|---|---|---|---|---|---|---|---|---|
| health: `GET /categories` | GET | 10 / 50 | 515 / 470 | 18 / 95 | 33 / 193 | 39 / 376 | 100 | — |
| `POST /auth/login` (valid) | POST | 10 / 50 | 14.4 / 14.4 | 640 / 3449 | 864 / 3758 | 883 / 3771 | 100 | — |
| `POST /auth/login` (wrong password) | POST | 10 / 50 | 13.7 / 14.4 | 743 / 3388 | 1754 / 3624 | 2026 / 3639 | 0 | 403 (expected) |
| `POST /auth/forget-password` | POST | 10 / 50 | 137 / 115 | 70 / 426 | 110 / 567 | 138 / 578 | 100 | — |
| `POST /otp/send-otp-in-email` | POST | 10 / 50 | 126 / 129 | 76 / 378 | 125 / 534 | 143 / 578 | 100 | — |
| `POST /otp/verify-with-email` (wrong OTP) | POST | 10 / 50 | 235 / 119 | 40 / 401 | 67 / 679 | 73 / 805 | 0 | 400 (expected) |
| `GET /users/my-profile` | GET | 10 / 50 | 135 / 108 | 70 / 454 | 115 / 575 | 134 / 590 | 100 | — |
| `GET /users/:id` (expert) | GET | 10 / 50 | 105 / 109 | 92 / 443 | 129 / 594 | 144 / 620 | 100 | — |
| `GET /users` (admin list) | GET | 10 / 50 | 66 / 84 | 131 / 578 | 269 / 742 | 317 / 777 | 100 | — |
| `PUT /users/update-profile` | PUT | 10 / 50 | 62 / 65 | 153 / 752 | 256 / 996 | 286 / 1023 | 100 | — |
| `GET /users/public/top-experts` | GET | 10 / 50 | 172 / 131 | 54 / 349 | 87 / 624 | 101 / 653 | 100 | — |
| `GET /users/public/interest-experts` | GET | 10 / 50 | 179 / 209 | 53 / 231 | 77 / 328 | 87 / 362 | 100 | — |
| `POST /users/register` (unique) | POST | 10 / 50 | 13.3 / 13.6 | 793 / 3612 | 1017 / 3961 | 1050 / 3974 | 100 | — |
| `PATCH /users/use-referral-code` | PATCH | 10 / 50 | 94 / 132 | 103 / 358 | 150 / 526 | 164 / 537 | 100 | — |
| `POST /bookings` | POST | 10 / 50 | 117 / 122 | 83 / 395 | 124 / 661 | 135 / 714 | 100 | — |
| `POST /payments/checkout` | POST | 10 / 50 | 69 / 140 | 142 / 354 | 171 / 433 | 187 / 463 | 100 | — |
| `GET /feeds` (feed list) | GET | 10 / 50 | 122 / 118 | 80 / 421 | 107 / 540 | 117 / 555 | 100 | — |
| `GET /feeds/:id` | GET | 10 / 50 | 152 / 166 | 63 / 292 | 91 / 386 | 101 / 405 | 100 | — |
| `GET /feeds?moderationStatus=pending_review` (admin) | GET | 10 / 50 | 117 / 123 | 83 / 402 | 115 / 482 | 123 / 492 | 100 | — |
| `POST /reports` (unique) | POST | 10 / 50 | 81 / 100 | 120 / 481 | 161 / 684 | 178 / 704 | 100 | — |
| `GET /notifications` (admin) | GET | 10 / 50 | 160 / 171 | 61 / 286 | 77 / 352 | 87 / 385 | 100 | — |
| `PATCH /users/change-status` (warning) | PATCH | 10 / 50 | 122 / 118 | 80 / 420 | 129 / 519 | 148 / 530 | 100 | — |
| `GET /reports` (admin) | GET | 10 / 50 | 129 / 120 | 68 / 404 | 141 / 570 | 254 / 575 | 100 | — |

No socket errors, timeouts, crashes or 5xx in the 10/50-connection matrix. The only non-2xx responses are the two negative scenarios, which return them by design.

### Stress ramps (first run, before the fixes)

| Endpoint | 10 | 50 | 100 | 200 | 400 |
|---|---|---|---|---|---|
| `GET /users/my-profile`: RPS / p99 ms | 105 / 148 | 93 / 700 | 89 / 1420 | 83 / 2693 | 81 / 5211 |
| `GET /users/:id` (expert): RPS / p99 ms | 72 / 180 | 79 / 795 | 77 / 1633 | 74 / 2720 | 111 / 4181, **48 % HTTP 500** |
| `GET /feeds`: RPS / p99 ms | 80 / 230 | 88 / 698 | 100 / 1107 | 93 / 2286 | 83 / 4829 |
| `POST /auth/login`: RPS / p99 ms | 13.9 / 890 | 14.1 / 3657 | 12.9 / 8410 (stopped) | — | — |

- **Flat throughput:** on the read endpoints it stays at about 80–110 RPS from 10 connections up. Beyond about 10 connections, extra concurrency only adds queueing time, and p99 grows roughly linearly with connections.
- **Knee:** p99 reaches 5 s at about 400 connections for my-profile and feeds, and at about 100 connections for login.

### Process behaviour

| | First run | Second run |
|---|---|---|
| RSS: start / peak / end | 116 / 415 / 272 MB | 116 / 446 / 110 MB |
| Heap used: peak | 336 MB | 357 MB |
| CPU peak | ~455 % of one core (bcrypt on the libuv threadpool) | similar |
| Event-loop delay p99: peak | 224 ms (200–400 conns on profile/feeds) | 697 ms (during the noisy stress phase) |

- **No leak.** Memory rises with concurrency and comes back down; the second run ended at 110 MB, below where it started. There is no steady growth across about 25 minutes of runs.
- **Cron jobs** (every minute) don't show up in event-loop delay: p99 was 40.3 ms in the first 2 s of each minute against 41.0 ms otherwise.

## Bottlenecks found and fixed

### 1. `GET /users/:id` returned HTTP 500 under concurrency (fixed)

**Symptom:** 798 of 1,662 requests failed with "Failed to fetch user profile" at 400 connections.

**Root cause (reproduced):** `geUserByIdFromDB` opened a MongoDB transaction for the whole profile read. The only write in it is the `ProfileView` upsert (one row per viewer and profile).
- When the same viewer and profile are fetched at the same moment, the upserts collide inside the transactions, and MongoDB aborts them with **`WriteConflict` (code 112)**.
- The catch block turned that into a 500 and didn't log it, which is why the cause was hidden.
- Transactions waiting on each other also made the endpoint slow at only 50 connections.

**Fix** (`src/app/modules/user/user.service.ts` `geUserByIdFromDB`):
- **No transaction.** The function only reads, apart from that upsert, and the counts never used the session.
- **Upsert outside it.** The `ProfileView` upsert runs without a session. A duplicate-key error (code 11000, two first views racing) is ignored, because the row already exists.
- **Errors logged.** Unexpected errors are now logged (`[geUserByIdFromDB] failed`) before the 500.
- The response shape is unchanged.

**A/B, back to back:** same build, fresh `ProfileView` table, viewer/profile pairs repeating as in real traffic, 15 s per level.

| Connections | Old (transaction): RPS / p99 / 5xx | New: RPS / p99 / 5xx |
|---|---|---|
| 50 | 7.1 / 9468 ms / 0, plus 12 timeouts | **46.7 / 1459 ms / 0** |
| 200 | 27.9 / 7670 ms / 1 | **51.7 / 4138 ms / 0** |
| 400 | 53.4 / 8347 ms / **399 (50 %)** | **40.9 / 8829 ms / 0** |

The old build logged 600 `WriteConflict` errors during this run; the new build logged none.

The absolute RPS here is lower than in the matrix above, because the machine was slower by then (the categories baseline was about 300 RPS, against 515 earlier). Compare the two columns with each other, not with the matrix.

### 2. Collection scans on users, bookings, follows, profile views and withdrawals (fixed)

**Symptom:** the Mongo profiler on the admin user list showed **`COLLSCAN` over 8,573 user documents** on every request (about 45 ms on average, 653 ms at worst), and a `COLLSCAN` over 5,838 bookings. The bookings, follows-by-`following`, profile-views-by-`viewedUser` and withdrawals schemas had no indexes for the profile counters (`GET /users/:id` and `/my-profile` run 14 counts per request), nor for the every-minute cron query.

**Fix:** schema indexes. Mongoose builds them at startup (`autoIndex` is on by default).

| Collection | Index | Serves |
|---|---|---|
| `users` | `{ isDeleted: 1, role: 1, createdAt: -1 }` | `GET /users` admin list (filter + newest first) |
| `bookings` | `{ consult: 1, status: 1 }`, `{ user: 1, status: 1 }` | profile booking counters, booking lists |
| `bookings` | `{ status: 1, startAt: 1 }` | every-minute reminder / expiry / settlement jobs |
| `follows` | `{ following: 1, createdAt: -1 }` | follower count and 7-day growth on profiles |
| `profileviews` | `{ viewedUser: 1, viewedAt: -1 }` | 7-day profile view count |
| `withdraws` | `{ user: 1, status: 1 }` | withdrawal totals on profiles |

**Checked with `explain`** on the load DB (8,581 users, 5,740 bookings):

| Query | Before | After |
|---|---|---|
| Admin users list, page of 20 | COLLSCAN, 8,573 docs | IXSCAN `isDeleted_1_role_1_createdAt_-1`, **20 docs**, 15 ms |
| Bookings: consult + status | COLLSCAN, 5,838 docs | IXSCAN `consult_1_status_1`, 0 docs |
| Profile views, last 7 days | COLLSCAN | IXSCAN `viewedUser_1_viewedAt_-1`, 4 docs |
| Follows by `following` | COLLSCAN | IXSCAN `following_1_createdAt_-1` |
| Cron: `status: pending` | COLLSCAN | IXSCAN `status_1_startAt_1`. It still reads every pending booking, which is expected: in the seed they are all pending |

In the second full run, `GET /users` (admin) p99 dropped from 317 ms to 167 ms at 10 connections. The public expert lists roughly doubled in RPS (172 → 308 and 179 → 298). Those two runs aren't strictly comparable (see "How to read"), but the `explain` change above is exact.

**Deploy note:** the indexes build when the new server first starts. With today's data sizes that takes seconds. On a much larger production DB, build them first in a quiet period (`db.collection.createIndex(...)`), then deploy.

## Known limits (not changed)

| Area | Finding | Suggestion |
|---|---|---|
| Login and register | About 14 RPS in total, whatever the concurrency. bcrypt with cost 12 takes ~250 ms per hash, and Node's libuv threadpool runs only 4 at a time | Set `UV_THREADPOOL_SIZE=8` or more on the server, or run one process per core (PM2 cluster). Lowering the cost factor would weaken password hashes, so don't. Add rate limiting to `/auth/login` (none exists), because a few clients can saturate it |
| Single process | Read endpoints flatten at about 100–150 RPS here, with event-loop delay up to 224 ms. The work is CPU plus database round trips in one Node process | PM2 cluster mode (one worker per core). Socket.IO then needs the Redis adapter, because notifications go to per-user rooms |
| `GET /users/:id`, `/my-profile` | 14 count/aggregate queries per request, all indexed now | Cache the counters, or compute them in one `$facet` aggregate per collection, if profile traffic grows |
| `GET /feeds` | `getReportedStatusBatch` runs twice with the same post ids per request | Merge the two calls (small win) |
| `PUT /users/update-profile` | Highest p50 (752 ms at 50 conns) at only ~46 % CPU, and no slow queries. The likely cause is the transaction in `updateUserInfoFromDB` plus multipart parsing to disk. Not traced further | Profile it if it matters. It's a low-traffic endpoint |
| Rate limiting | No rate limiter on any route | Add `express-rate-limit` (or a proxy-level limit) on auth, OTP and register |
| JSON body limit | `express.json({ limit: '500mb' })` lets one request occupy the process for a long time | Lower it (e.g. 1 MB). File uploads use multer, not JSON |

## How to re-run

```bash
docker run -d --rm --name consultz-loadtest -p 27098:27017 mongo:7 --replSet rs0 --bind_ip_all
docker exec consultz-loadtest mongosh --quiet --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"
npm run build
bash loadtest/run-all.sh        # reset DB, start API with mocks, seed, matrix + stress, write loadtest/results/summary.md
docker stop consultz-loadtest
```

`loadtest/` is not committed. The scripts never touch the `.env` database.

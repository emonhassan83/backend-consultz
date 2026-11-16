# Points Management — API Changes

Vincent-approved Consultz Points rules: Admin-configurable `PointsRule`, central `awardByKey`, deferred referral, expert-link attribution, and last-90-days expert ranking.

---

## 1) Added APIs

Base path: `/points`  
Auth: JWT (`auth` middleware)

### `GET /points/rules`

- **Auth:** admin
- **Request:** none
- **Success:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Points rules retrieved successfully",
  "data": [
    {
      "_id": "...",
      "key": "session_completed",
      "points": 100,
      "enabled": true,
      "audience": "both",
      "conditions": {},
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

### `GET /points/rules/:key`

- **Auth:** admin
- **Success:** single rule object (same shape as list item)
- **Error:** `404` if key not found

### `PUT /points/rules/:key`

- **Auth:** admin
- **Body (any subset; at least one field required):**

```json
{
  "key": "no_show_bonus",
  "points": 300,
  "audience": "expert",
  "conditions": { "minSessions": 5, "windowDays": 30 }
}
```

- **Success:** updated rule
- **Errors:** `404` missing rule; `409` if renaming to an existing key; `400` invalid/negative points

### `PATCH /points/rules/:key/enabled`

- **Auth:** admin
- **Body:**

```json
{ "enabled": false }
```

- **Success:** rule with updated `enabled`
- **Note:** only toggles enable/disable; use PUT for points/conditions/key/audience

### `GET /points/users/:userId/summary`

- **Auth:** admin
- **Success:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Points summary retrieved successfully",
  "data": {
    "user": {
      "_id": "...",
      "firstName": "...",
      "lastName": "...",
      "role": "expert",
      "points": 1250
    },
    "lifetimeCredits": 1300,
    "lifetimeDebits": 50,
    "netFromLogs": 1250,
    "last90DaysCredits": 400,
    "breakdownLast90Days": [
      { "rewardKey": "session_completed", "total": 200, "count": 2 }
    ]
  }
}
```

- **Error:** `404` user not found

### `POST /points/attribution`

- **Auth:** consult | expert (logged-in)
- **Body:**

```json
{ "expertRef": "EMCODE12" }
```

- **Success (first time):**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Expert attribution saved successfully",
  "data": {
    "alreadySet": false,
    "attributedExpert": "...",
    "attributedAt": "..."
  }
}
```

- **Success (already set):** `alreadySet: true` — does **not** overwrite
- **Errors:** `404` user/expert; invalid `expertRef`

Sets `User.attributedExpert` + `attributedAt` once. First paid completed session with that expert awards `expert_link_first_paid` (default 200).

---

## 2) Modified APIs

### `POST /users/register`

- **New optional body field:** `expertRef` (string) — expert share referral code
- If present, sets attribution on register (same as `POST /points/attribution`)
- Existing optional `referralCode` still links `referredBy` but **does not** award points immediately

### `PATCH /users/use-referral-code`

- **Before:** could credit referral points immediately
- **After:** sets `referredBy` + `pendingReferralReward: true` only
- Points (`referral_invitee` / `referral_referrer`, default 500/500) settle when invitee completes **first paid session** (and expert invitees must be **approved/active**)

### `POST /users/:userId/points-adjustment`

- Unchanged contract (`type`, `points`, `reason`)
- Still writes `PointsLog` with `source: manual_adjustment`
- Push notification when user has `fcmToken` and `pushNotify.points`

### `GET /points-logs/user/:userId`

- Response items may now include:

```json
{
  "user": "...",
  "type": "credit",
  "points": 100,
  "reason": "Session completed reward for consultant",
  "source": "reword",
  "rewardKey": "session_completed",
  "meta": {
    "bookingId": "...",
    "referredUserId": "...",
    "expertId": "...",
    "windowStart": "...",
    "windowEnd": "..."
  }
}
```

- `source: reword` kept (no breaking rename)

### Internal award sites (no new public endpoints)

| Trigger | Reward key (default pts) |
|---------|--------------------------|
| Phone OTP verify | `phone_verify` (50) |
| Stripe Connect return | `stripe_connect` (100) |
| Profile complete | `profile_complete` (150) |
| Social links | `social_links` (50) |
| Admin approve expert | `admin_approval` (150) |
| Session completed | `session_completed` (100) both sides |
| Weekly ≥5 sessions (Mon–Sun ISO week) | `weekly_bonus` (300) |
| Monthly avg ≥4.7 with ≥5 reviews / 30d | `monthly_rating_bonus` (500) |
| Reliability job ≥5 sessions / 30d, 0 no-show | `no_show_bonus` (300) |
| Fast response job ≥3 req, 80% ≤30m in availability | `fast_response_bonus` (50) |
| First paid from attributed customer | `expert_link_first_paid` (200) |
| Deferred referral settle | `referral_invitee` / `referral_referrer` (500) |

- **Removed:** per-review 5-star expert reward (`five_star_review` seeded `enabled: false`, points 0)
- Consultee first-paid-booking 300 (payment confirm) left hardcoded (out of expert PDF focus)

### Expert list / search ranking

Affected:

- Auth: interest experts, property experts, top experts
- Public: interest experts, property experts, top experts

**Before:** tertiary sort by lifetime `User.points`  
**After:** page results re-ranked by **last 90 days** credit sum from `PointsLog`; experts joined &lt; 30 days get a soft floor (`rankingPoints = max(recent, 1)`) for visibility. Response may include `last90DaysPoints` / `rankingPoints`.

---

## 3) Scripts (not APIs)

```bash
npm run seed:points
```

Runs `src/app/seeder/seedPointsRules.ts` — upserts default `PointsRule` docs (`$setOnInsert`). Setup split ≈ 500 (`150+100+50+150+50`). No `POST /points/seed-defaults` endpoint.

---

## 4) Schema summary

### `PointsRule`

| Field | Type | Notes |
|-------|------|-------|
| `key` | string | unique |
| `points` | number | ≥ 0 |
| `enabled` | boolean | |
| `audience` | `expert` \| `consult` \| `both` | |
| `conditions` | mixed | thresholds / `deferUntil` etc. |
| `createdAt` / `updatedAt` | Date | |

No `label` / `updatedBy`.

### `PointsLog` (extended)

| New field | Type |
|-----------|------|
| `rewardKey` | string? (indexed) |
| `meta` | mixed? |

### `User` (attribution / referral)

| Field | Type |
|-------|------|
| `attributedExpert` | ObjectId → User |
| `attributedAt` | Date |
| `pendingReferralReward` | boolean |
| existing | `points`, `referralCode`, `referredBy` |

### Award + push flow

```
Action → awardByKey → User.points $inc + PointsLog → FCM (if fcmToken && pushNotify.points)
```

Push is skipped inside DB transactions (`skipPush`); callers may notify after commit when needed.

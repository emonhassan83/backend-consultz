# Planning 1, 2, 3 API Changes

Tiny summary of backend API/data changes added for finance, points, moderation, appeal, payment hold, and withdrawals.

## Planning 1 — Finance + Points Logs

### Payments / Dashboard

- Payment records now expose clearer finance fields:
  - `grossBookingValue`
  - `platformFeePercentage`
  - `platformCommission`
  - `platformVat`
  - `platformTotalDeduction`
  - `expertPayout`
- Admin dashboard/meta responses now include the same finance breakdown so cards and charts can read from consistent totals.

Affected APIs:

```http
GET /meta/dashboard
GET /meta/transaction
GET /payments
GET /payments/:id
GET /payments/booking/:bookingId
```

### Points Adjustment

Admin can manually adjust user points.

```http
POST /users/:userId/points-adjustment
```

Payload:

```json
{
  "type": "credit",
  "points": 100,
  "reason": "Manual correction"
}
```

Allowed `type`:

```ts
credit | debit
```

### Points Logs

User-specific points history:

```http
GET /points-logs/user/:userId
```

Logs are created for manual adjustment and reward points.

---

## Planning 2 — Reports, Appeals, Moderation

### Reports

Creating a report no longer directly hides/restricts the post. The post stays live until admin action.

```http
POST /reports
PATCH /reports/:id
GET /reports
GET /reports/:id
GET /reports/feed/:feedId
```

Report details now include related appeals for that feed.

### Appeals

Experts appeal by `feed` id, not by report id.

```http
POST /appeals
GET /appeals
PATCH /appeals/:id/decision
```

Create appeal payload:

```json
{
  "feed": "64f123456789abcdef123456",
  "reason": "This report is false.",
  "files": [
    "https://example.com/proof-1.png"
  ]
}
```

Decision payload:

```json
{
  "status": "approved",
  "note": "We reviewed your appeal and restored the post."
}
```

Allowed decision status:

```ts
approved | rejected
```

If appeal is approved:

- feed becomes `active`
- related unresolved reports become `denied`
- author receives notification/email

### Feed Moderation

Admin moderation action:

```http
PATCH /feeds/:id/moderation
```

Payload:

```json
{
  "action": "restrict",
  "reason": "Policy violation"
}
```

Allowed actions:

```ts
restrict | activate | remove | warn_user | suspend_user
```

Feed list/my-feed responses include:

```ts
isReported: boolean
hasAppealsSubmmit: boolean
```

---

## Planning 3 — Payment Hold + Withdrawal Enforcement

### Payment Settlement State

Payment records now include:

```ts
settlementStatus:
  | 'pending_session'
  | 'held'
  | 'cleared'
  | 'withdrawn'
  | 'refunded'

holdUntil?: Date
holdDaysSnapshot?: number
clearedAt?: Date
withdrawnAt?: Date
```

Payment confirm:

```http
POST /payments/confirm-payment
```

Now sets:

```ts
status = 'paid'
settlementStatus = 'pending_session'
```

Session complete now puts payment into hold:

```ts
settlementStatus = 'held'
holdUntil = sessionEnd + paymentHoldDays
```

### Withdrawals

Withdrawals are now allowed only from cleared payments.

```http
POST /withdraw
GET /withdraw/my-withdraws
```

`GET /withdraw/my-withdraws` now includes:

```ts
availableBalance: number
pendingBalance: number
pendingClearsOn: Date | null
```

If funds are still held, withdrawal request is rejected.

### Background Jobs

New job:

```txt
paymentSettlementClear.job.ts
```

It changes payment settlement from `held` to `cleared` when `holdUntil` has passed.

`sessionCompleteCheck.job.ts` no longer creates automatic withdraw requests.

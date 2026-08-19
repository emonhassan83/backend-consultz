# Planning 1, 2, 3 API Changes

Short summary of backend API/data changes for finance, points, moderation, appeal, payment hold, and withdrawals.

## Planning 1 — Finance + Points Logs

### Payments / Dashboard

- Payment records expose clearer finance fields:
  - `grossBookingValue`
  - `platformFeePercentage`
  - `platformCommission`
  - `platformVat`
  - `platformTotalDeduction`
  - `expertPayout`
- Admin dashboard/meta responses use the same finance breakdown so cards and charts can read from consistent totals.
- Platform commission is calculated from gross booking value using `platformFeePercentage` from General Settings.

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

- Creating a report does not directly hide/restrict a post.
- The post stays live until admin moderation action.
- Report no longer has a `status` field.
- Reports are stored as review/evidence records only.

Active report APIs:

```http
POST /reports
GET /reports
GET /reports/:id
GET /reports/feed/:feedId
DELETE /reports/:id
```

Removed report APIs:

```http
GET /reports/my-report
PUT /reports/:id
PATCH /reports/:id
```

`GET /reports/:id` now returns the report with appeals created against that specific report:

```ts
appeals: Appeal[]
```

### Appeals

- Expert appeals are created against a specific `report`.
- Backend resolves the related `feed` from that report.
- Only the post author can submit an appeal.
- There is no appeal decision/status-change API in this version.

Active appeal APIs:

```http
POST /appeals
GET /appeals/feed/:feedId
```

Create appeal payload:

```json
{
  "report": "64f123456789abcdef123456",
  "reason": "This report is false.",
  "files": [
    "https://example.com/proof-1.png"
  ]
}
```

Appeal record fields:

```ts
report: ObjectId
feed: ObjectId
user: ObjectId
reason: string
files: string[]
status: 'pending'
```

Notes:

- `report` is required in create appeal payload.
- `feed` is saved automatically from the report.
- `GET /appeals/feed/:feedId` returns appeals for a post/feed.
- `GET /reports/:id` returns only appeals under that report.

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

Payment records include:

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

Withdrawals are allowed only from cleared payments.

```http
POST /withdraw
GET /withdraw/my-withdraws
```

`GET /withdraw/my-withdraws` includes:

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

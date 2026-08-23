# Planning 1, 2, 3 — Client Feedback Wise Backend Changes

এই ডকুমেন্টে client feedback অনুযায়ী finance, points, report, appeal, moderation, payment hold এবং withdrawal flow-তে কী কী পরিবর্তন করা হয়েছে তা সংক্ষেপে লেখা হলো।

---

## Planning 1 — Earnings / Commission mismatch + Points control

### 1. Finance / Commission calculation fix

Client feedback ছিল dashboard/meta-তে Total Earnings, Commission এবং chart-এর figure মিলছে না। তাই finance calculation পরিষ্কার করা হয়েছে।

এখন payment/dashboard response-এ আলাদা finance fields expose করা হয়:

```ts
grossBookingValue
platformFeePercentage
platformCommission
platformVat
platformTotalDeduction
expertPayout
```

Calculation rule:

```ts
grossBookingValue = payment amount
platformCommission = grossBookingValue * platformFeePercentage / 100
platformVat = platformCommission * 20 / 100
platformTotalDeduction = platformCommission + platformVat
expertPayout = grossBookingValue - platformTotalDeduction
```

Main point:

- Commission এখন General Settings-এর `platformFeePercentage` থেকে নেয়।
- Hardcoded/ভুল rate avoid করা হয়েছে।
- Card এবং chart একই paid payment query/source থেকে consistent data পাবে।
- Commission এবং VAT আলাদা label হিসেবে রাখা হয়েছে।

Affected APIs:

```http
GET /meta/dashboard
GET /meta/transaction
GET /payments
GET /payments/:id
GET /payments/booking/:bookingId
```

### 2. Admin points adjustment

Client feedback ছিল Consultz points দেখা যায়, কিন্তু admin manually adjust করতে পারে না। এজন্য points adjustment API add করা হয়েছে।

API:

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

Allowed type:

```ts
credit | debit
```

Behavior:

- Admin manually user points credit/debit করতে পারবে।
- `reason` required।
- Debit করলে balance negative হতে পারবে না।
- User points update হলে push notification পাঠানো হবে, যদি user-এর points notification enabled থাকে।

### 3. Points logs

Points change history রাখার জন্য `pointsLogs` module add করা হয়েছে।

API:

```http
GET /points-logs/user/:userId
```

Log fields:

```ts
user
type: 'credit' | 'debit'
points
reason
source: 'manual_adjustment' | 'reword'
createdAt
```

Logs create হয়:

- Manual points adjustment
- Referral reward
- First paid booking reward
- Expert profile setup reward
- Social/profile completion reward

---

## Planning 2 — Reports, Appeals, Content Moderation

### 1. Single report দিলে post auto restrict হবে না

Client feedback ছিল একটি report দিলেই post restricted হয়ে যাচ্ছে। এটা abuse risk তৈরি করে। তাই report create করলে post আর auto restrict হয় না।

Current behavior:

- Report submit করলে শুধু report record create হয়।
- Feed live থাকে।
- Admin moderation action না নেওয়া পর্যন্ত post restrict/remove হয় না।
- Report model থেকে `status` field remove করা হয়েছে।

Report create:

```http
POST /reports
```

Payload:

```json
{
  "feed": "FEED_ID",
  "reason": "This post is misleading"
}
```

Report record এখন রাখে:

```ts
author: ObjectId
feed: ObjectId
feedAuthor: ObjectId
reason: string
```

`feedAuthor` রাখা হয়েছে যাতে feed owner জানতে পারে তার কোন post-এ report এসেছে।

### 2. Feed response-এর report flags

Feed list/detail response-এ report বুঝার জন্য দুইটা boolean field রাখা হয়েছে।

```ts
isFoundReported: boolean
isReported: boolean
```

Meaning:

- `isFoundReported`: এই post-এ কেউ report করেছে কি না।
- `isReported`: logged-in current user নিজে এই post report করেছে কি না।

Removed:

```ts
reportList
hasAppealsSubmmit
```

Reason:

- Feed response হালকা রাখা হয়েছে।
- Report list আলাদা report API থেকে নেওয়া হবে।

### 3. Feed-wise reports get

Expert/admin feed id দিয়ে report list দেখতে পারবে।

API:

```http
GET /reports/feed/:feedId
```

Auth:

```ts
admin | expert
```

Validation:

- Admin যেকোনো feed-এর report দেখতে পারবে।
- Expert শুধু নিজের feed-এর report দেখতে পারবে।

Response-এর প্রতিটি report item-এ field থাকবে:

```ts
isAppalSubmit: boolean
```

Meaning:

- এই report-এর against current user appeal submit করেছে কি না।

### 4. Report details with appeals

Report details API:

```http
GET /reports/:id
```

Response-এ ওই specific report-এর appeals data return করে:

```ts
appeals: Appeal[]
isAppalSubmit: boolean
```

### 5. Report delete by feed id

Reporter নিজে নিজের submitted report delete করতে পারবে feed id দিয়ে।

API:

```http
DELETE /reports/feed/:feedId
```

Auth:

```ts
consult | expert
```

Validation:

- যে user report করেছে, শুধু সে delete করতে পারবে।
- অন্য user-এর report delete করা যাবে না।

Delete behavior:

- শুধু current user-এর ওই feed-এর report delete হবে।
- ওই report-এর related appeals delete হবে।
- Feed author notification পাবে যে report remove/withdrawn হয়েছে।

Response:

```json
{
  "feed": "FEED_ID",
  "deletedReports": 1,
  "deletedAppeals": 0
}
```

### 6. Appeals

Client feedback ছিল expert যেন report/restriction contest করতে পারে। এজন্য appeal module add করা হয়েছে।

Create appeal:

```http
POST /appeals
```

Payload:

```json
{
  "report": "REPORT_ID",
  "reason": "This report is false. My post does not violate policy.",
  "files": [
    "https://example.com/proof-1.png"
  ]
}
```

Rules:

- Appeal specific `report` against create হবে।
- Backend report থেকে related `feed` resolve করে save করে।
- Only feed author appeal submit করতে পারবে।
- Feed restricted না হলেও appeal করা যাবে।
- Duplicate pending appeal same report-এর জন্য allowed না।

Appeal fields:

```ts
report: ObjectId
feed: ObjectId
user: ObjectId
reason: string
files: string[]
status: 'pending'
```

Get appeals by feed:

```http
GET /appeals/feed/:feedId
```

Removed:

```http
PATCH /appeals/:id/decision
```

Note:

- Appeal decision/status-change API এই version-এ রাখা হয়নি।

### 7. Admin moderation action

Admin post moderation করতে পারবে।

API:

```http
PATCH /feeds/:id/moderation
```

Payload:

```json
{
  "moderationStatus": "restrict",
  "reason": "Policy violation"
}
```

Allowed moderationStatus:

```ts
restrict | activate | remove | warn_user | suspend_user
```

Behavior:

```ts
restrict     -> feed.status = 'restrict'
activate     -> feed.status = 'active'
remove       -> feed.status = 'restrict', feed.isDeleted = true
warn_user    -> user.status = 'warning'
suspend_user -> user.status = 'blocked', feed.status = 'restrict'
```

Feed model এখন direct fields রাখে:

```ts
moderationStatus
reason
```

Removed:

```ts
moderationActions[]
```

### 8. Moderation notifications

Content moderation related push/email notification add করা হয়েছে।

Events:

- post reported
- report withdrawn/removed
- post restricted
- post activated
- post removed
- content warning issued
- account suspended

Copy update:

- “reinstated” wording replace করে “activated” করা হয়েছে।

---

## Planning 3 — Payment hold, transaction state, withdrawal enforcement

### 1. Payment collection আর withdrawal availability আলাদা করা হয়েছে

Client feedback ছিল payment successful হলেই transaction paid হয়ে যাচ্ছে, কিন্তু hold/clearing state নেই। তাই payment settlement lifecycle add করা হয়েছে।

`Payment.status` payment collection status হিসেবেই থাকে:

```ts
unpaid | paid | refunded | failed
```

New settlement fields:

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

### 2. Payment confirm flow

Payment confirm:

```http
POST /payments/confirm-payment
```

Now sets:

```ts
status = 'paid'
settlementStatus = 'pending_session'
```

Meaning:

- Payment collect হয়েছে।
- কিন্তু session complete না হওয়া পর্যন্ত expert withdraw করতে পারবে না।

### 3. Session complete হলে payment hold

Session complete হলে:

```ts
booking.status = 'completed'
payment.settlementStatus = 'held'
payment.holdUntil = sessionEnd + paymentHoldDays
```

`paymentHoldDays` General Settings থেকে নেওয়া হয়।

Default fallback:

```ts
7 days
```

Important change:

- `sessionCompleteCheck.job.ts` আর automatic withdraw request create করে না।
- শুধু booking complete এবং payment held করে।

### 4. Clearing job

New background job:

```txt
paymentSettlementClear.job.ts
```

Job behavior:

- `settlementStatus = held`
- `holdUntil <= now`

হলে payment:

```ts
settlementStatus = 'cleared'
clearedAt = now
```

### 5. Withdrawal enforcement

Withdrawal এখন শুধু cleared payment থেকে allowed।

APIs:

```http
POST /withdraw
GET /withdraw/my-withdraws
```

Withdraw allowed only if:

```ts
payment.status = 'paid'
payment.settlementStatus = 'cleared'
```

Held payment withdraw করতে গেলে reject হবে:

```json
{
  "message": "Funds are still on hold until 2026-08-26T10:00:00.000Z"
}
```

Withdrawal create হলে:

```ts
payment.settlementStatus = 'withdrawn'
payment.withdrawnAt = now
```

### 6. Expert withdrawal overview

`GET /withdraw/my-withdraws` response-এ balance breakdown add করা হয়েছে:

```ts
availableBalance
pendingBalance
pendingClearsOn
```

Meaning:

- `availableBalance`: cleared, withdrawable amount
- `pendingBalance`: held amount
- `pendingClearsOn`: pending amount কবে clear হবে

---

## Summary

Client feedback অনুযায়ী মূল fixগুলো:

- Finance dashboard calculation consistent করা হয়েছে।
- Commission/VAT/payout আলাদা করা হয়েছে।
- Admin manual points adjustment এবং points logs add হয়েছে।
- Single report আর post auto restrict করে না।
- Report status field remove হয়েছে।
- Feed response-এ report flags add হয়েছে।
- Expert report against appeal করতে পারে।
- Appeal restriction removed: post restricted না হলেও appeal করা যায়।
- Admin moderation action direct `moderationStatus` field দিয়ে handle হয়।
- Moderation notifications add/update হয়েছে।
- Payment hold lifecycle add হয়েছে।
- Withdrawal only cleared funds থেকে allowed।

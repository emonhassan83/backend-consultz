# Payments, Refunds and Payouts — Meeting Scope

এই ডকুমেন্টটি শুধু Payments, Refunds এবং Payouts বিষয়ক meeting-এর জন্য। Booking UI, notifications বা অন্য feature এখানে scope নয়, শুধু টাকা সম্পর্কিত logic কীভাবে কাজ করছে/কী sign-off দরকার সেটাই রাখা হলো।

## 1. Payment collection flow

- Client/consultee booking request করার সময় payment শুরু হয়।
- Payment successful হলে booking-এর `paymentStatus = paid` হয়।
- Payment successful হলেও expert-এর টাকা সঙ্গে সঙ্গে withdrawable হয় না।
- Payment collection status এবং payout/withdrawal status আলাদা রাখা হয়েছে।

Payment status:

```txt
unpaid
paid
refunded
failed
```

Settlement status:

```txt
pending_session
held
cleared
withdrawn
refunded
```

সহজ ভাষায়:

- `paid` মানে client-এর payment collect হয়েছে।
- `pending_session` মানে session এখনো complete হয়নি।
- `held` মানে session complete হয়েছে, কিন্তু dispute/refund window-এর জন্য টাকা hold আছে।
- `cleared` মানে hold period শেষ, expert withdraw request করতে পারবে।
- `withdrawn` মানে withdrawal request তৈরি হয়েছে।
- `refunded` মানে payment refund হয়েছে।

## 2. Commission and payout calculation

Current calculation:

```txt
grossBookingValue = booking/payment amount
platformFeePercentage = general settings থেকে নেয়
platformCommission = grossBookingValue × platformFeePercentage / 100
platformVat = platformCommission × 20 / 100
platformTotalDeduction = platformCommission + platformVat
expertPayout = grossBookingValue - platformTotalDeduction
```

Example:

```txt
Booking price: £50
Platform fee: 20%
Platform commission: £10
Platform VAT: £2
Total platform deduction: £12
Expert payout: £38
```

Sign-off দরকার:

- Platform fee কি সবসময় gross booking value-এর উপর কাটবে?
- Platform VAT কি সবসময় commission-এর 20% হবে?
- Rounding rule কী হবে: 2 decimal places, round half-up/normal JS rounding?

## 3. Refund flow currently supported

বর্তমানে refund mainly এই জায়গাগুলোতে হয়:

- Booking cancel হলে।
- Expert booking decline করলে।
- Payment refund API/manual refund flow থেকে।

Refund হলে:

- Stripe refund create করার চেষ্টা হয়।
- Payment status `refunded` হয়।
- Payment settlement status `refunded` হয়।
- Booking paymentStatus `refunded` করা হয়।

Important:

- Current implementation অনেক ক্ষেত্রে full refund ধরে।
- Refund policy map-এর সব edge case এখনো fully automated rule engine হিসেবে নেই।

## 4. Refund rules to sign off

Client meeting-এ এই rules final করতে হবে:

| Case | Expected outcome |
| --- | --- |
| Expert no-show | Client full refund, expert no payout |
| Consultee no-show | No refund, expert paid |
| Neither party attended | Full refund, no payout, no fault |
| Cancellation outside notice window | Full refund |
| Cancellation inside notice window | No refund, expert paid |
| Reschedule | Same payment carries to new slot |
| Platform/technical fault | Full refund, platform absorbs cost |
| Interrupted/dropped call | Rejoin window + used-time threshold অনুযায়ী decision |

Sign-off দরকার:

- Cancellation notice window কত মিনিট/ঘণ্টা?
- No-show detect করার exact rule কী?
- Dropped call হলে কত মিনিট rejoin window থাকবে?
- কত percent session completed হলে payout হবে?
- Technical fault কে admin manually mark করবে, নাকি automatic signal থাকবে?

## 5. Cancellation and refund

Current behavior:

- Paid booking ছাড়া cancel করা যায় না।
- Completed booking cancel করা যায় না।
- Cancellation allowed কিনা তা general setting-এর `cancellationTime` দিয়ে check হয়।
- Cancel হলে refund করার চেষ্টা হয়।
- Email/notification-এ কে cancel করেছে তা আলাদা করা হয়েছে:
  - client/consultee
  - consultant/expert

Need confirmation:

- Cancellation cutoff-এর ভেতরে cancel করলে refund হবে কি না?
- Expert payout হবে কি না?
- Client-facing wording কেমন হবে?

## 6. Reschedule and payment carry-over

Current dynamic reschedule flow:

- New payload:

```json
{
  "date": "2026-07-30",
  "startTime": "11:00",
  "localDate": "2026-07-30",
  "localStartTime": "17:00"
}
```

- Session duration আগের booking থেকেই নেওয়া হয়।
- নতুন payment নেওয়া হয় না।
- Payment same booking/payment-এর সাথে carry-over হয়।
- New time validation dynamic booking rules অনুযায়ী হয়।

Need confirmation:

- Reschedule limit কতবার?
- Reschedule cutoff কত মিনিট আগে পর্যন্ত?
- Reschedule কে initiate করলে notification wording কী হবে?

## 7. Session complete and payment hold

Session complete হলে:

- Booking status `completed` হয়।
- Payment `settlementStatus = held` হয়।
- `holdUntil = session end + paymentHoldDays` হয়।
- `paymentHoldDays` general settings থেকে নেওয়া হয়; না থাকলে default 7 days।
- Session complete হওয়ার সাথে সাথে automatic withdraw request তৈরি হয় না।

Purpose:

- Client dispute/refund raise করার জন্য hold period থাকে।
- Hold period শেষ না হলে expert টাকা withdraw করতে পারে না।

## 8. Clearing period

Background job:

```txt
paymentSettlementClear.job.ts
```

Job কাজ:

- `settlementStatus = held`
- `holdUntil <= now`
- এমন paid payments খুঁজে `settlementStatus = cleared` করে।

Cleared হওয়ার পর expert withdraw request করতে পারে।

## 9. Expert withdrawal flow

Expert manually withdrawal request করবে।

Withdraw request validation:

- User expert হতে হবে।
- Booking expert-এর নিজের হতে হবে।
- Booking-এর paid payment থাকতে হবে।
- Payment `settlementStatus = cleared` হতে হবে।
- Held/pending/refunded/withdrawn payment থেকে withdraw করা যাবে না।
- Duplicate withdraw request করা যাবে না।

Payload:

```json
{
  "booking": "BOOKING_ID"
}
```

If funds held:

```txt
Funds are still on hold until <holdUntil date>
```

Withdraw request create হলে:

- Payment `settlementStatus = withdrawn`
- `withdrawnAt = now`
- Withdraw record create হয়।

## 10. Stripe connection dependency

Expert payout/withdrawal complete করার জন্য expert-এর Stripe connected account দরকার।

Current behavior:

- Withdraw request proceed/processing state-এ থাকে।
- Background transfer job Stripe connected account-এ transfer করার চেষ্টা করে।
- Stripe account missing হলে withdrawal hold করা হতে পারে।
- Successful transfer হলে withdraw status `completed` হয় এবং `stripeTransferId` save হয়।

Need confirmation:

- Stripe account missing থাকলে UI কী দেখাবে?
- Expert onboarding incomplete হলে payout request block হবে, নাকি hold হবে?
- Admin manual override থাকবে কি না?

## 11. UI should show

Client/consultee side:

- Payment collected amount
- Payment status
- Refund status
- Refund initiated date
- Expected refund arrival time
- Refund reason/cancellation actor

Expert/consultant side:

- Gross booking value
- Platform commission
- Platform VAT
- Total deduction
- Expert payout
- Settlement status
- Hold until date
- Available balance
- Pending balance
- Stripe connection status
- Withdrawal request status

Admin side:

- All transactions
- Gross/commission/VAT/payout breakdown
- Refund records
- Held/cleared/withdrawn settlement state
- Stripe transfer status
- Failed refund/failed transfer list

## 12. Current gaps to scope in meeting

এই বিষয়গুলো meeting-এ final decision দরকার:

1. Full refund বনাম no refund rules কোন status/event-এ apply হবে।
2. No-show কে কীভাবে detect করা হবে।
3. Dropped/interrupted call-এর rejoin window কত মিনিট।
4. Partial completion threshold কত percent হলে payout হবে।
5. Cancellation notice window final value।
6. Technical fault কে কীভাবে mark করা হবে।
7. Refund trigger automatic হবে নাকি admin approval লাগবে।
8. Refund status UI wording।
9. Stripe account না থাকলে payout behavior।
10. Payment hold period final value।

## 13. Related backend areas

Main modules:

```txt
src/app/modules/booking/
src/app/modules/payment/
src/app/modules/withdraw/
src/app/modules/contents/
```

Important jobs:

```txt
src/app/job/paymentSettlementClear.job.ts
src/app/job/sessionCompleteCheck.job.ts
src/app/job/dailyWithdrawTransfer.job.ts
```

Important settings:

```txt
platformFeePercentage
paymentHoldDays
cancellationTime
reschedulingTime
supportEmail
```

## 14. Meeting goal

এই meeting-এর goal:

- Refund policy map final sign-off।
- Payment hold এবং payout timing final sign-off।
- Stripe dependency এবং failed payout handling final sign-off।
- UI/API scope final করা।
- Next app version-এ কোন rules implement হবে তা freeze করা।

# Booking Rules Phase 6 — Jobs and Time-Sensitive Logic

## Goal

Phase 6 migrates booking jobs to use dynamic interval fields first:

```ts
startAt
endAt
bufferEndAt
```

Old bookings can still fall back to:

```ts
localDate + localStartTime/localTime + timezone
old slot.date + old slot.time
```

## Shared job helper

Added:

```text
src/app/job/bookingJobTime.utils.ts
```

It exposes:

```ts
resolveBookingStartUtc(booking, slot?)
resolveBookingEndUtc(booking, slot?)
resolveBookingBufferEndUtc(booking, slot?)
getBookingSessionInfoForJob(booking, slot?)
```

Priority:

```ts
startAt -> localDate/localStartTime/timezone -> localDate/localTime/timezone -> old slot.date/time
endAt -> startAt + sessionDuration
bufferEndAt -> endAt + bufferTime
```

## Updated jobs

### timeSensitiveNotifications.job.ts

Uses `startAt` through `resolveBookingStartUtc`.

Rules:

- 10-minute reminder uses `startAt`.
- Join-call/live notification uses `startAt`.
- Email session info uses `localStartTime/localEndTime` first.

### pendingBookingReminder.job.ts

Uses `startAt` through `resolveBookingStartUtc`.

Rules:

- Reminder continues every 10 minutes while booking is pending.
- If session `startAt` has already passed, reminder is skipped because expiry/not-responded logic handles it.

### autoMarkNotResponded.job.ts

Uses interval helpers.

Rules:

- Pending expiry uses `startAt + 5 minute grace`.
- Confirmed not-responded uses `endAt`, not `slot.date/time + duration`.
- If `endAt` is missing, fallback derives end from start + session duration.

### sessionCompleteCheck.job.ts

Running completion remains based on:

```ts
sessionStartedAt + sessionDuration
```

This is intentional because running sessions should complete from the actual call start flow, not only scheduled `startAt`.

### dailyReviewReminder.job.ts

Review reminder window now uses:

```ts
endAt between 24 and 48 hours ago
```

Fallback:

```ts
updatedAt between 24 and 48 hours ago
```

for old bookings without `endAt`.

## Implemented files

- `src/app/job/bookingJobTime.utils.ts`
- `src/app/job/timeSensitiveNotifications.job.ts`
- `src/app/job/pendingBookingReminder.job.ts`
- `src/app/job/autoMarkNotResponded.job.ts`
- `src/app/job/dailyReviewReminder.job.ts`

## Not changed

- Refund rules.
- Payment confirmation.
- Dynamic reschedule.
- Socket call-start/running transition.

Phase 7 dynamic reschedule implementation is documented in:

```text
docs/BOOKING_RULES_PHASE_7_RESCHEDULE.md
```

# Booking Rules Phase 2 — Dynamic Slots API

## Goal

Phase 2 will introduce a dynamic slots API that calculates available session start times on demand instead of depending on pre-generated fixed `BookingSlots`.

This phase is for read-only slot discovery. It should not yet change booking create, payment, refund, or job behavior unless a later implementation phase explicitly does that.

Implementation status: completed for the read-only dynamic slots endpoint.

Implemented files:

- `src/app/modules/bookingSlots/bookingSlots.route.ts`
- `src/app/modules/bookingSlots/bookingSlots.controller.ts`
- `src/app/modules/bookingSlots/bookingSlots.service.ts`
- `src/app/modules/bookingSlots/bookingSlots.validation.ts`

## API

```http
GET /booking-slots/dynamic?expertId=...&date=2026-07-30&duration=30
```

Query params:

- `expertId`: expert/consultant user id.
- `date`: requested local date in `YYYY-MM-DD`.
- `duration`: requested session duration in minutes, for example `15`, `30`, or `60`.

Expected response:

```ts
{
  expertId: string,
  date: '2026-07-30',
  duration: 30,
  timezone: 'Asia/Dhaka',
  slotBufferStep: 5,
  bufferTime: 10,
  slots: [
    {
      startTime: '10:20',
      endTime: '10:50',
      bufferEndTime: '11:00',
      available: true
    },
    {
      startTime: '11:00',
      endTime: '11:30',
      bufferEndTime: '11:40',
      available: true
    }
  ]
}
```

## Data sources

The dynamic slots API will need:

1. Expert profile
   - `availability`
   - `timeZone`
   - `bookingRules`

2. Existing bookings for that expert/date
   - `startAt`
   - `endAt`
   - `bufferEndAt`
   - `status`

3. Booking rules helper
   - `resolveBookingRules(expert)`
   - `getBufferForDuration(rules, duration)`
   - `parseLocalDateTimeToUtc(date, time, timezone)`
   - `buildBookingInterval(...)`
   - `isWithinBookingHorizon(...)`
   - `isMinNoticeSatisfied(...)`

## Blocking statuses

These booking statuses should block time:

- `pending`
- `confirmed`
- `running`
- `completed`

`completed` should still block the same date because that time was already used and must remain unavailable historically.

These statuses should not block time:

- `cancelled`
- `declined`
- `not_responded`

## Algorithm

### 1. Resolve expert rules

Load expert by `expertId`, then resolve rules:

```ts
const rules = resolveBookingRules(expert)
const bufferTime = getBufferForDuration(rules, duration)
```

If expert has no `bookingRules`, defaults are used:

```ts
{
  minNotice: 2,
  bookingHorizonDays: 60,
  slotBufferStep: 5,
  bufferRules: [
    { duration: 15, buffer: 5 },
    { duration: 30, buffer: 10 },
    { duration: 60, buffer: 20 }
  ]
}
```

If expert sets:

```json
{
  "bookingRules": {
    "minNotice": 2,
    "bookingHorizonDays": 60,
    "slotBufferStep": 3
  }
}
```

Backend-generated buffers become:

```ts
[
  { duration: 15, buffer: 3 },
  { duration: 30, buffer: 6 },
  { duration: 60, buffer: 12 }
]
```

### 2. Build availability gaps

Convert the expert's availability for the requested day into UTC intervals.

Example:

```text
Expert timezone: Asia/Dhaka
Availability: 10:00 - 13:00
Date: 2026-07-30
```

This becomes one availability gap:

```text
10:00 -> 13:00 local
```

Internally the API should compare using UTC `Date` values, but response times should be formatted back to the expert/requested timezone.

### 3. Subtract blocked intervals

Find active bookings on that expert/date.

For each blocking booking, subtract:

```text
existing.startAt -> existing.bufferEndAt
```

Example:

```text
Availability: 10:00 -> 13:00
Booking A:    10:00 -> 10:15, bufferEndAt 10:20
Booking B:    11:40 -> 12:40, bufferEndAt 13:00
```

Free gaps become:

```text
10:20 -> 11:40
```

### 4. Compact-pack slots inside each free gap

For each free gap:

```ts
cursor = gapStart

while cursor is inside gap:
  sessionEnd = cursor + duration
  bufferEnd = sessionEnd + bufferTime

  if bufferEnd <= gapEnd:
    return slot

  cursor = bufferEnd
```

Important: after each returned slot, move cursor to `bufferEnd`, not just `sessionEnd`. This avoids offering a start time that would overlap the required post-session buffer.

### 5. Apply min notice and booking horizon

Before returning a slot:

- `isMinNoticeSatisfied(startAt, rules)` must be true.
- `isWithinBookingHorizon(startAt, rules)` must be true.

If not, skip that slot.

## Example

Expert availability:

```text
10:00 -> 13:00
```

Rules:

```ts
slotBufferStep = 5
duration = 30
bufferTime = 10
```

Existing booking:

```text
10:00 -> 10:15
bufferEndAt -> 10:20
```

Free gap:

```text
10:20 -> 13:00
```

Generated 30 minute slots:

```ts
[
  {
    startTime: '10:20',
    endTime: '10:50',
    bufferEndTime: '11:00',
    available: true
  },
  {
    startTime: '11:00',
    endTime: '11:30',
    bufferEndTime: '11:40',
    available: true
  },
  {
    startTime: '11:40',
    endTime: '12:10',
    bufferEndTime: '12:20',
    available: true
  },
  {
    startTime: '12:20',
    endTime: '12:50',
    bufferEndTime: '13:00',
    available: true
  }
]
```

## Implementation checklist

Phase 2 should add:

- route: `GET /booking-slots/dynamic`
- query validation for `expertId`, `date`, and `duration`
- service method to load expert and active bookings
- gap builder from expert availability
- interval subtraction for blocked bookings
- compact packing slot generator
- timezone-safe response formatting
- tests/manual checks for Dhaka and UTC conversion

Phase 2 should not yet remove:

- old `BookingSlots`
- current booking create flow
- existing payment flow
- existing jobs

## Notes for later phases

After this API is stable, later phases can:

- update booking create to use `date`, `startTime`, `duration`, and `timezone`;
- store `startAt`, `endAt`, `bufferEndAt`, `localDate`, `localStartTime`, and `localEndTime` on booking;
- update jobs to use the new interval fields;
- deprecate old fixed slot generation.

Phase 3 booking create implementation is documented in:

```text
docs/BOOKING_RULES_PHASE_3_BOOKING_CREATE.md
```

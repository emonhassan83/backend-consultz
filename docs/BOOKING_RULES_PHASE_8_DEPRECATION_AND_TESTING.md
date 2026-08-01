# Booking Rules Phase 8 — Deprecate Fixed Slots Safely + Testing Coverage

## Goal

Phase 8 keeps the old fixed-slot endpoints available while the frontend migrates to the dynamic slots endpoint.

Existing endpoints remain:

```http
POST /booking-slots
GET /booking-slots/expert/:userId
```

Dynamic endpoint:

```http
GET /booking-slots/dynamic?expertId=...&date=2026-07-30&duration=30
```

Frontend should switch slot discovery to `GET /booking-slots/dynamic`.

After all clients migrate, old monthly slot generation and `BookingSlots.isBooked` can be removed in a later cleanup.

## Safety changes

Dynamic slot blocking no longer depends on Mongoose `populate('slot')`, because newer booking schema no longer has a `slot` path.

For historical fixed-slot bookings, the dynamic slot service reads the raw legacy `slot` field from MongoDB and resolves it through `BookingSlots`. This keeps old booking data blocking the correct time while new dynamic bookings use:

```ts
startAt -> bufferEndAt
```

## Covered functionality

This migration now covers:

- expert configurable booking rules;
- dynamic compact optimized slot generation;
- 15/30/60 minute mixed bookings without dead space;
- minimum scheduling notice;
- booking horizon limit;
- booking create conflict validation;
- reschedule conflict validation;
- payment confirmation compatibility;
- notifications/reminders based on new time fields;
- not-responded expiry based on new time fields;
- booking list/calendar/detail display compatibility;
- historical old slot-based booking fallback during migration.

## Not included in v1

- daily max minutes;
- pre-buffer;
- all 5-minute candidate mode;
- removing the old `BookingSlots` collection entirely.

## Test scenarios

### 1. Empty availability compact packing

Expert available:

```text
10:00 - 13:00
```

Rules:

```ts
duration = 30
buffer = 10
```

Expected slots:

```text
10:00
10:40
11:20
12:00
```

### 2. Existing 15 minute booking with 5 minute buffer

Existing booking:

```text
10:00 - 10:15
bufferEndAt = 10:20
```

Request:

```ts
duration = 30
buffer = 10
```

Expected first slot:

```text
10:20
```

### 3. Two existing bookings

Existing A:

```text
10:00 - 10:15 + 5 buffer = 10:20
```

Existing B:

```text
11:40 - 12:40 + 20 buffer = 13:00
```

Request:

```ts
duration = 30
buffer = 10
```

Expected slots:

```text
10:20
11:00
```

### 4. Same gap with 60 minute duration

Free gap:

```text
10:20 - 11:40
```

Request:

```ts
duration = 60
buffer = 20
```

Expected slot:

```text
10:20
```

### 5. Create booking for returned slot

Expected:

- booking saves `startAt`;
- booking saves `endAt`;
- booking saves `bufferEndAt`;
- booking saves local display fields;
- `BookingSlots.isBooked` is not updated.

### 6. Create booking with stale/conflicting time

Expected:

- server rejects the request through overlap validation;
- frontend-provided slot state is not trusted.

### 7. Payment confirm for dynamic booking

Expected:

```ts
paymentStatus = 'paid'
status = 'pending'
```

And:

- no `BookingSlots.findByIdAndUpdate` is attempted for dynamic bookings;
- historical slot booking can still update old `BookingSlots.isBooked`.

### 8. Reminder and not-responded jobs

Expected:

- 10-minute reminder uses `startAt`;
- join/live notification uses `startAt`;
- pending expiry uses `startAt + grace`;
- confirmed not-responded uses `endAt`;
- old booking fallback derives from local fields or legacy slot.

### 9. Booking response display

Expected response fields:

```ts
displayDate
displayStartTime
displayEndTime
displayTimezone
```

Source priority:

```ts
localStartTime/localEndTime -> localTime -> old slot.time
localDate -> old slot.date
```

## Verification commands

Current static verification:

```bash
npm.cmd run build
```

`npm test` is not usable yet because the project currently has no test runner configured.

Recommended next testing cleanup:

- add Jest/Vitest;
- extract dynamic packing into a pure testable function;
- add automated tests for the scenarios listed above.

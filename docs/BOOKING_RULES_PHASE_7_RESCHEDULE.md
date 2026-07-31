# Booking Rules Phase 7 — Dynamic Reschedule

## Goal

Phase 7 updates rescheduling so bookings can move to a new dynamic date/time without using fixed `BookingSlots`.

## New payload

```json
{
  "date": "2026-07-30",
  "startTime": "11:00"
}
```

## Validation

Dynamic reschedule uses the same booking interval helpers as create booking:

- resolve expert booking rules;
- calculate `bufferTime`;
- calculate `startAt`, `endAt`, and `bufferEndAt`;
- validate min notice;
- validate booking horizon;
- validate selected duration is still offered by the expert;
- validate the new interval is inside expert availability;
- validate no active booking interval overlap.

Blocking statuses for overlap:

```ts
pending
confirmed
running
completed
```

The current booking is excluded from the overlap check.

## Updated fields on success

On successful dynamic reschedule, booking is updated with:

```ts
timezone
date
startTime
endTime
bufferTime
startAt
endAt
bufferEndAt
localDate
localTime
localStartTime
localEndTime
```

Reminder flags are reset:

```ts
is10MinReminderSent = false
isJoinCallReminderSent = false
lastPendingReminderSentAt = null
```

## BookingSlots behavior

Dynamic reschedule does not touch `BookingSlots`.

Old slot-based reschedule remains as fallback only when payload includes:

```json
{
  "slot": "legacySlotId"
}
```

## Notifications and email

On successful reschedule:

- consultee receives reschedule notification if enabled;
- consultant receives reschedule notification if enabled;
- reschedule email is sent to both sides according to notification settings.

Notification/email time display uses dynamic local fields first:

```ts
localStartTime/localEndTime -> localTime -> old slot.time
```

## Implemented files

- `src/app/modules/booking/booking.validation.ts`
- `src/app/modules/booking/booking.service.ts`

## Not changed

- Payment state.
- Refund logic.
- Booking status lifecycle.
- Old slot fallback internals beyond keeping compatibility.

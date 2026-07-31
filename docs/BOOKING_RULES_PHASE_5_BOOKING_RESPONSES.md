# Booking Rules Phase 5 — Booking Responses, Calendar, Detail, Notifications

## Goal

Phase 5 updates read-side booking responses so new dynamic bookings and historical fixed-slot bookings can be displayed consistently.

Every booking response should expose display fields:

```ts
displayDate
displayStartTime
displayEndTime
displayTimezone
```

## Display field source priority

Date:

```ts
localDate -> date -> old slot.date
```

Start time:

```ts
localStartTime -> localTime -> old slot.time -> startTime
```

End time:

```ts
localEndTime -> endTime
```

Timezone:

```ts
timezone -> UTC
```

## Booking list and detail

The following read responses now attach the display fields:

- admin booking list;
- consult/user booking list;
- expert booking list;
- booking detail.

Legacy slot fallback is read from the raw MongoDB booking document and resolved through `BookingSlots` only when old data contains a slot id.

## Calendar

Calendar now marks booked dates using:

```ts
localDate -> date -> old slot.date fallback
```

This lets dynamic bookings appear in the calendar without needing `BookingSlots.isBooked`.

## Bookings by date

Bookings-by-date now queries with dynamic fields first:

```ts
localDate in targetDates
date in targetDates
```

Then it also includes legacy bookings whose old `slot.date` matches the target date.

Grouped response uses `displayDate`, so both dynamic and old bookings land under the correct date.

## Notifications

Booking notification text now uses a display time range:

```ts
localStartTime/localEndTime -> localTime -> old slot.time
```

Example:

```text
2026-07-30 at 10:00 - 10:30 (Asia/Dhaka)
```

## Implemented files

- `src/app/modules/booking/booking.service.ts`
- `src/app/modules/booking/booking.utils.ts`

## Not changed in this phase

- Dynamic reschedule implementation.
- Old cancellation internals that still tolerate legacy slot data.
- Payment/refund rules.
- Booking create validation.

Phase 6 job/time-sensitive logic is documented in:

```text
docs/BOOKING_RULES_PHASE_6_JOBS_TIME_LOGIC.md
```

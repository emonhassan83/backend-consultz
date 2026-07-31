# Booking Rules Phase 3 — Dynamic Booking Create

## Goal

Phase 3 adds dynamic booking creation without fixed `BookingSlots`.

Old fixed `BookingSlots` are no longer required for new bookings. New dynamic bookings save their own interval fields directly on the booking record.

## New create booking payload

```json
{
  "consult": "expertId",
  "date": "2026-07-30",
  "startTime": "10:00",
  "sessionDuration": 30,
  "sessionType": "discussion",
  "price": 200,
  "mainQuestion": "Question text",
  "challengeQuestion": "Challenge text",
  "backgroundQuestion": "Background text"
}
```

The frontend can still send `price`, but the dynamic path calculates the booking price from the expert's offered session duration/hourly rate instead of trusting the client value.

The frontend does not send `timezone`. The backend reads timezone from the consultant profile:

```ts
timezone = consultant.timeZone || 'UTC'
```

## Server-calculated fields

The server calculates and stores:

```ts
bufferTime = bufferRules[sessionDuration]
startAt = date + startTime + timezone -> UTC Date
endAt = startAt + sessionDuration
bufferEndAt = endAt + bufferTime
```

Saved booking interval fields:

```ts
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
timezone
```

`startTime` and `endTime` are UTC `HH:mm` strings. Local display values are stored in `localDate`, `localTime`, `localStartTime`, and `localEndTime`.

## Validation before create

Dynamic booking create validates:

- consultee/user exists;
- expert/consultant exists;
- expert is active;
- selected `sessionDuration` is offered by the expert;
- selected interval fits inside expert availability;
- booking respects `minNotice`;
- booking respects `bookingHorizonDays`;
- selected interval including buffer does not overlap active bookings.

Blocking booking statuses:

- `pending`
- `confirmed`
- `running`
- `completed`

Ignored statuses:

- `cancelled`
- `declined`
- `not_responded`

## Fixed slot removal

Booking create no longer accepts `slot`.

New dynamic create does not set `BookingSlots.isBooked`.

## Related changes

- `bankDetails` removed from the user schema/interface/update validation.
- `slot` removed from the booking create payload, booking schema, and booking interface.
- Payment confirmation only marks `BookingSlots.isBooked` when a legacy slot exists.
- Time-sensitive notification jobs now tolerate bookings without a slot by using the saved interval/local time fields.

## Still not migrated

Some old read/list flows are still slot-oriented and should be migrated in a later phase:

- booking calendar;
- date-based booking list grouping;
- reschedule flow;
- any UI response that still expects populated `slot.date/time`.

# Booking Rules Phase 4 — Payment Confirmation

## Goal

Phase 4 updates payment confirmation for the dynamic booking flow.

Dynamic bookings do not use fixed `BookingSlots`, so confirming payment must not require or update a slot.

## Payment confirmation behavior

When payment is confirmed:

```ts
booking.paymentStatus = 'paid'
booking.status = 'pending'
```

This is the same pending-after-payment behavior as the old flow.

## Dynamic booking behavior

New dynamic bookings:

- do not have `slot`;
- must not call `BookingSlots.findByIdAndUpdate`;
- use saved booking interval fields for notifications/emails:
  - `localStartTime`
  - `localEndTime`
  - `localTime`
  - `startTime`

## Legacy slot booking behavior

Historical old slot bookings may still have a raw `slot` field in MongoDB.

For these only:

```ts
BookingSlots.findByIdAndUpdate(slotId, { isBooked: true })
```

The payment flow reads legacy `slot` from the raw collection document so the current Booking schema does not need a `slot` path.

## Notification/email time display priority

Notifications and booking email templates now prefer dynamic local interval fields:

```ts
localStartTime/localEndTime
fallback -> localTime
fallback -> old slot.time
```

This means a new dynamic booking can display:

```text
2026-07-30 • 10:00 - 10:30 (Asia/Dhaka)
```

instead of relying on old fixed slot data.

## Implemented files

- `src/app/modules/payment/payment.service.ts`
- `src/app/modules/booking/booking.utils.ts`
- `src/app/templates/booking.templates.ts`

## Not changed in this phase

- Payment intent creation.
- Refund logic.
- Booking create validation.
- Dynamic slot generation.
- Old booking list/calendar migration.

Phase 5 booking response/list/calendar implementation is documented in:

```text
docs/BOOKING_RULES_PHASE_5_BOOKING_RESPONSES.md
```

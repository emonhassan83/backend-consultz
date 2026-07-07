# Booking Notifications

This document describes the booking notifications currently implemented in the
backend and records the gaps found during the July 2026 job audit.

## Terminology

- **Consultee / client / user / booker:** the person who creates and pays for a booking (`booking.user`).
- **Expert / consultant:** the person receiving the booking request (`booking.consult`).
- **Push:** Firebase push plus the persisted in-app notification created by `sendNotification`.

Notification delivery also depends on the recipient having an FCM token and the
relevant push/email preference enabled.

## Requirement audit

| Requirement | Current status | Current behaviour | Gap / risk |
| --- | --- | --- | --- |
| 10-minute reminder to both parties | Implemented | `timeSensitiveNotificationsJob` runs every minute and sends push and email to both parties for confirmed bookings when the session is 0–10 minutes away. `is10MinReminderSent` prevents duplicates. Failed configured deliveries leave the flag unset for retry. | A user who disabled the relevant channel will not receive it. |
| Reminder works regardless of acceptance time | Implemented | Confirmation immediately evaluates the booking for a reminder instead of waiting for cron. The minute job remains a fallback. | None known. |
| Pending expert reminder every ~10 minutes | Implemented for push | `pendingBookingReminderJob` runs every 10 minutes, selects pending bookings at least 10 minutes old, and reminds the expert until status changes or the slot starts. Requester naming is taken from the consultee. | Reminder timing is aligned to cron runs rather than exactly 10 minutes after creation. |
| Expire unaccepted booking | Implemented | The every-minute `autoMarkNotRespondedJob` expires a still-pending booking 5 minutes after scheduled start and frees the slot. | The 5-minute grace period is the current product default and can be changed if required. |
| Notify consultee when not accepted | Implemented | After expiry, the job sends push and email to the consultee and consultant. Each push now targets the correct recipient. | Delivery requires the relevant preference and destination token/address. |
| Automatically refund unaccepted booking | Implemented | After the booking transaction commits, the job creates a full Stripe refund with a booking-specific idempotency key and marks the payment `refunded`. | Failed Stripe refunds are logged and the email tells the consultee that support review is required. |
| “Call is Live” at session start | Implemented | The every-minute job sends push and email to both parties from 1 minute before through 3 minutes after start. `isJoinCallReminderSent` prevents duplicates and failed delivery is retried. | Cron timing allows a small delivery offset; it is not a real-time socket event. |

## Current booking notification catalogue

| Event | Recipient(s) | Channel(s) | Trigger / schedule | Preference gate |
| --- | --- | --- | --- | --- |
| Payment successful / booking pending | Expert | Push, email | Payment success flow | Push requires FCM token; expert email uses booking preference |
| Payment receipt / pending approval | Consultee | Email | Payment success flow | Payment email preference |
| Booking accepted | Consultee | Push | Expert confirms booking | Booking and schedule push preference |
| Pending booking reminder | Expert | Push | Every 10 minutes after request age reaches 10 minutes, until accepted or scheduled start passes | Booking and schedule push preference |
| Booking declined | Consultee and expert | Push | Expert declines | Booking and schedule push preference |
| Decline/cancellation details and refund | Consultee and expert | Email | Expert declines | Booking email preference |
| Booking cancelled | Consultee and expert | Push, email | Either party cancels | Booking and schedule push / booking email preference |
| Booking rescheduled | Consultee and expert | Push, email | Booking is rescheduled | Booking and schedule push / schedule email preference |
| Session starts in 10 minutes | Consultee and expert | Push, email | Immediate acceptance check plus every-minute fallback; confirmed booking 0–10 minutes before start | Schedule reminder push / schedule email preference |
| Call is live / join now | Consultee and expert | Push, email | Every-minute job; 1 minute before to 3 minutes after start | Schedule reminder push / schedule email preference |
| Booking not responded / expired | Consultee and expert | Push, email | Every-minute auto-mark job; pending booking 5 minutes after start | Booking and schedule push / booking email preference |
| Session completed / withdrawal processing | Expert | Push, email | Session completion service or every-minute fallback | Payment push / payment email preference |
| Review reminder | Consultee | Push/in-app | Daily; completed booking is 24–48 hours old and has no review | Handled by review notification helper |

`morning_reminder` and `dms_closing` message types exist in
`booking.utils.ts`, but no active caller was found during this audit.

## Expiry policy

A still-pending booking remains open until **5 minutes after scheduled start**.
The every-minute expiry job then marks it not responded, frees the slot, initiates
the refund idempotently, and notifies both parties. Product can change this grace
period if a different business rule is approved.

## Relevant implementation files

- `src/app/job/timeSensitiveNotifications.job.ts`
- `src/app/job/pendingBookingReminder.job.ts`
- `src/app/job/autoMarkNotResponded.job.ts`
- `src/app/job/jobScheduler.ts`
- `src/app/modules/booking/booking.utils.ts`
- `src/app/utils/emailNotify.ts`
- `src/app/templates/booking.templates.ts`

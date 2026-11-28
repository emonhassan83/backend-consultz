# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Express 5 + TypeScript + Mongoose backend for "Consultz", an expert-consultation marketplace. Clients book paid video sessions (Agora) with experts, pay with Stripe (experts get paid out through Stripe Connect), chat over Socket.IO, and earn points. Setup: copy `.env.example` to `.env` and fill in credentials (MongoDB, JWT, Stripe, Firebase, AWS/DO Spaces, Twilio, Agora, APNs, SMTP).

## Commands

```bash
npm run start:dev        # ts-node-dev with respawn (src/server.ts)
npm run build            # tsc -> dist/
npm run start:prod       # node dist/server.js
npm run lint             # eslint src (.js,.ts)
npm run lint:fix
npm run prettier:fix     # prettier config: no semicolons, single quotes

# Seeders (need a DB connection from .env)
npm run seed:admin | seed:content | seed:category | seed:points
```

## Architecture

**Entry point.** `src/server.ts` connects to Mongo, calls `initializeCronJobs()`, and starts the HTTP app on `PORT`. Socket.IO listens on its own port, `SOCKET_PORT`. The io instance is also stored on `global.socketio`, and services such as notifications read it from there to emit events. `getIO()` in `src/app/socket/socket.init.ts` is the other way to get it.

**Modules** (`src/app/modules/<name>/`). Every feature module has the same set of files: `*.route.ts`, `*.controller.ts`, `*.service.ts`, `*.model.ts` (some modules use `*.models.ts`), `*.interface.ts`, `*.validation.ts` (Zod), and `*.constant(s).ts` / `*.utils.ts`. To add a route, register the module router in `src/app/routes/index.ts`. Everything is mounted under `/api/v1`.

**Request pipeline:**
- Routes chain `zodValidationRequest(schema)`, `auth(...roles)`, and the controller. Zod schemas validate an object shaped `{ body, params, query }`.
- `auth()` reads the raw JWT from `Authorization`, with no `Bearer` prefix. It rejects users who are deleted or blocked, and it sets `req.user` to the decoded payload (`_id`, `email`, `role`).
- Multipart endpoints use `parseData()`, which moves `req.body.data` (a JSON string) into `req.body`.
- Controllers wrap handlers in `catchAsync` and reply with `sendResponse(res, { statusCode, success, message, meta?, data })`.
- Services throw `AppError(status, message)`. `globalErrorHandler` normalizes Zod, Mongoose cast, validation, and duplicate-key errors.
- List endpoints use `QueryBuilder` (`src/app/builder/QueryBuilder.ts`) for `searchTerm`, filtering, `sort`, pagination, and `fields`.

**Roles** (`USER_ROLE` in `modules/user/user.constant.ts`): `admin`, `expert`, `consult`. The names are easy to mix up:
- The `consult` **role** is the client (consultee) who books and pays.
- On a Booking, `booking.user` is the client and `booking.consult` is the **expert**.

**Bookings.** Bookings have moved from fixed, pre-generated `BookingSlots` to dynamic slots. New bookings compute and store `startAt`, `endAt`, and `bufferEndAt` from the expert's `bookingRules`. Legacy bookings still exist and fall back to `localDate`/`localStartTime`/`timezone` or the old `slot.date`/`slot.time`.
- Any read or job logic must handle both shapes. Use the shared helpers: `bookingRules.utils.ts`, `booking.utils.ts`, and `src/app/job/bookingJobTime.utils.ts`.
- Booking responses expose `displayDate`, `displayStartTime`, `displayEndTime`, and `displayTimezone`.

**Money flow.**
- Payment is confirmed through the payment module's `/confirm-payment` endpoint after Stripe checkout. There is no Stripe webhook.
- After payment, the booking status goes to `pending`. The expert then confirms or declines it.
- Refunds use Stripe with idempotency keys (`payment.refund.utils.ts`, `refund` module).
- Expert payouts go through Stripe Connect (`stripe` module) and the `withdraw` module, with settlement and transfer handled by cron jobs.
- Multi-document writes in booking, payment, refund, calling, and withdraw logic use Mongoose sessions (`startSession`) inside transactions. Pass `session` through to any helper you call from inside one.

**Cron jobs.** All jobs are registered in `src/app/job/jobScheduler.ts`. Each one goes through `scheduleGuardedJob`, which runs it in UTC and blocks overlapping runs with an in-memory running flag. Several jobs run every minute: reminders, auto-expiring pending bookings plus refunding them, session-complete checks, and payment settlement. These jobs use per-booking flags such as `is10MinReminderSent` to stay idempotent. `docs/BOOKING_NOTIFICATIONS.md` documents what each job sends and when.

**Points.** Admins configure `PointsRule` documents (seeded from `DEFAULT_POINTS_RULES` via `seed:points`). Award points only through `PointsService.awardByKey({ userId, key, reason, meta, session, skipPush })`. It increments `User.points` and writes a `PointsLogs` entry. It does nothing if the rule is missing, disabled, or set to zero points. Referral and expert-link rewards are deferred until the user's first paid session. See `docs/POINTS_API_CHANGES.md`.

**Realtime.**
- Socket auth happens in `socket/utils/socket.auth.ts`. Each connected socket joins a room named after its userId and is tracked in `onlineUsers`.
- Event names are mapped to handlers in `socket/socket.event.ts`. Chat handlers live in `handlers/chat/*` and call/booking-complete handlers in `handlers/calling/*`.
- Handlers reply through ack callbacks (`utils/ackHandler.ts`).

**Notifications.** `utils/sentNotification.ts` sends a Firebase push and also saves a `Notification` document. Email goes through nodemailer over Brevo SMTP (`utils/emailSender.ts`, `utils/emailNotify.ts`; settings resolved in `utils/emailConfig.ts`, check with `npm run email:test -- you@example.com`) using HTML templates in `src/app/templates/`. iOS VoIP call pushes go through APNs (`utils/voipService.ts`). Whether a user gets a push or email depends on their per-user preferences and on having an FCM token.

**Files.** `uploads` module plus `utils/s3.ts`: AWS S3 / DigitalOcean Spaces (`SPACES_API` endpoint). `middleware/fileUpload.ts` is multer disk storage.

## Docs

`docs/` holds the feature specs and API change logs: client QA fix plan, change log and team handoff, load test report (`load_test.md`), booking notifications, points, payments/refunds/payouts scope (written in Bengali), and planning notes. Use them as the source of truth for intended behavior. Some code comments are also in Bengali.

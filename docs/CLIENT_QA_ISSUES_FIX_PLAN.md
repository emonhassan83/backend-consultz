# Client QA Issues — Backend Analysis & Fix Plan

- **Date:** 2026-11-22
- **Source:** client QA sheet (72 rows, tested 18–19 Nov 2026)
- **Status:** Implemented (22 Nov), except Google/Apple token verification (not done, by decision) and #14 ops. See [CLIENT_QA_ISSUES_CHANGES.md](CLIENT_QA_ISSUES_CHANGES.md).

## Context

The client's QA sheet has 72 rows. These are the backend-relevant Fail/Blocked rows: #1, 2, 4, 5, 6, 12, 13, 14, 15, 16, 18, 23, 25, 26, 32, 65, 67, 68, 70, plus #38 (not tested, but confirmed in code).

Tracing these rows also turned up 5 critical security holes that are not in the client's list. They are fixed first (Phase 0).

Decisions taken:

- Sign-up requires an email OTP.
- Email is sent directly through nodemailer SMTP; the external relay is dropped.
- Price comes from a single source: the `hourlyRate` formula, with VAT snapshotted at booking time.

Frontend/config only, handed off and not in this plan:

- #17: Google Cloud OAuth consent screen app name and logo.
- #22: "Forgot current password?" link on the Change Password screen.
- #57: camera/mic permission UI.
- #31: the intro video feature doesn't exist (product decision).
- #3: intermittent SMS, which is Twilio delivery.

## Root causes (verified in code)

| # | Cause | Where |
|---|---|---|
| 2, 4, 14, 16 | Re-submitting register for an existing un-phone-verified user re-runs `applyReferralCodeToUser` without `replaceExisting`. `referredBy` is already set, so it throws "Referral code already used". | `user.service.ts:114, 207-220` |
| — | `sendOtp*` and `forgetPassword` set `verification.status: true` when the OTP is **sent**, so the "unverified" branch never runs. | `otp.service.ts:212, 284, 377`; `auth.service.ts` ~458 |
| 14 (fresh email) | No code path produces "already exists" for a new user. Suspected: a stale unique index in Mongo (e.g. `referredBy_1`) triggering `handleDuplicateError`. **Verify with `db.users.getIndexes()`.** | `errors/handleDuplicateError.ts` |
| 4 + SEC | Register overwrites any account with `isPhoneOtpVerified=false`, which includes every Google/Apple user: password, role and phone are replaced. This is an account takeover. | `user.service.ts:214-220` |
| 12 | There is no duplicate phone check anywhere. | — |
| 15 | `sendOtpViaDirectPhone` does `findOne({ phoneNumber })` without an `isDeleted` filter, so it finds the old soft-deleted record and returns "User not found". | `otp.service.ts:364` |
| 5, 6 | `dob` is validated only as `z.string()`. There is no age check. | `user.validation.ts:159` |
| 1, 65 | There is no email verification. Users are created `active`. | `user.service.ts:240-245` |
| 13 | Google/Apple users are created `active` with no phone, dob or terms. `sendOtpViaTokenInPhone` never stores the phone number. | `auth.service.ts:231`; `otp.service.ts:265` |
| 18, 25, 70 | `emailSender` posts Gmail credentials to the external relay `consultz.vercel.app`, and every failure becomes "Error sending email". Booking and support emails fail silently for the same reason. | `utils/emailSender.ts` |
| 25 | `forgetPassword` ignores `registerWith`. | `auth.service.ts` ~430 |
| 23 | Change-password requires `oldPassword`. Social users have no password, so they get a 403. | `auth.service.ts` ~365 |
| 26, 67 | There is no verified email/phone change flow and no admin edit endpoint. | — |
| 68 | `createReport` only notifies the post author. Admin is never notified. `moderationStatus` defaults to `null` and has no "pending" value. | `report.service.ts:51`; `feed.model.ts:32` |
| 70 (b) | `change-status` with `warning` sends no email, and the user notification is commented out. | `user.service.ts:1064-1068` |
| 32 | The profile shows the stored `offeredPrice`. The booking charges `hourlyRate/60*duration`. `offeredPrice` is recomputed only when `sessionDurations` is in the request, so changing `hourlyRate` alone makes the two disagree. VAT is added at checkout using the **current** VAT status and a live rate. | `user.service.ts:763, 1139`; `booking.service.ts:123`; `payment.service.ts:140-164` |
| 38 | `createBookings` never checks `consultId !== userId`. | `booking.service.ts` ~255 |
| SEC | `/auth/google` and `/auth/apple` require `token` but never verify it. The email is taken from the request body. | `auth.service.ts:149-249` |
| SEC | `forgetPassword` returns `verifyToken` and sets `status: true`. `resetPassword` checks only those, so a password can be reset without the OTP. | `auth.service.ts` ~430-515 |
| SEC | `PUT /users/update-profile` has no zod validation and does `Object.assign(user, {...payload})`. A user can set their own `role`, `status`, `points`, `email` and `password`. | `user.route.ts:48`; `user.service.ts:1111, 1253` |
| SEC | `/payments/checkout` and `/payments/confirm-payment` have no `auth()`. The user comes from the request body, and confirm doesn't check the intent's amount or bookingId. | `payment.route.ts:10-20` |

## Phase 0: Security (first, separate commits)

> **Outcome (22 Nov):** 2–5 done. 1 (social token verification) is **not done, by decision**. Details are in section 24 of the changes log.

1. **Social token verification:** in `auth.service.ts` `registerWithGoogle` and `registerWithApple`, verify `payload.token` and take the email from the verified claims; ignore the email in the body.
   - Google: `google-auth-library` `OAuth2Client.verifyIdToken`, audience from the new env `GOOGLE_CLIENT_IDS`.
   - Apple: verify the identity token against Apple JWKS using `jose`, audience from `APPLE_CLIENT_ID`.
   - If the app sends Firebase ID tokens instead, use `firebase-admin` `getAuth().verifyIdToken` (already initialised in `utils/sentNotification.ts`). **Confirm the token type with the app dev.**
2. **OTP bypass:** in `forgetPassword` and all `sendOtp*` in `otp.service.ts`, set `verification.status: false` on send. Only `verifyWithEmail`/`verifyWithPhoneNumber` set it to true. Before changing, grep every read of `verification.status` so login isn't broken.
3. **Mass assignment:** in `updateUserInfoFromDB`, strip protected keys with an allow-list or deny-list: `role, status, points, email, password, registerWith, referralCode, referredBy, pendingReferralReward, attributed*, isDeleted, verification, isPhoneOtpVerified, isEmailVerified, stripeAccountId, isTopExpert, avgRating, profileCompletionBonusClaimed, expireAt, phoneNumber`. Phone changes go through the OTP flow in Phase 2.
4. **Register overwrite:** fixed by the rewrite in Phase 1.1.
5. **Payment auth:** add `auth(USER_ROLE.consult, USER_ROLE.expert)` to checkout and confirm-payment, and take the user from `req.user`. In `confirmPayment`, assert `booking.user === req.user._id` and that `paymentIntent.metadata.bookingId` and `amount` match the booking. The app must send the `Authorization` header (frontend handoff).

## Phase 1: Sign-up (#1, 2, 4, 5, 6, 12, 14, 15, 16)

1. **Rewrite the existing-email branch of `registerUserIntoDB`** (`user.service.ts:155`):
   - Soft-deleted: keep the current revive path.
   - Completed account (social, or phone+email verified): return 409 "An account with this email already exists. Please log in or reset your password." (#4)
   - Incomplete credentials sign-up: resume it by updating only name, password, dob and phone. Handle the referral idempotently: the same referrer is a no-op, and a different one replaces it, which is safe because nothing has been rewarded before the first paid session.
2. **Referral at create:** resolve the referrer first and pass `referredBy` and `pendingReferralReward` into `User.create`, so creating the user and attaching the referral is one write. `applyReferralCodeToUser` stays for `/users/use-referral-code` only. (#2, 14, 16)
3. **DB index check (#14):** run `db.users.getIndexes()`. If there is a unique index on `referredBy` or another referral field, drop it and record the action in the PR.
4. **Duplicate phone (#12):** add a `normalizePhone` helper (trim and strip spaces, E.164) in `user.utils.ts`. Register and phone change return 409 when another non-deleted, phone-verified user has that number.
5. **Resend OTP (#15):** `sendOtpViaDirectPhone` queries `{ phoneNumber, isDeleted: false }`, sorted by `-createdAt`.
6. **Age check (#5, 6, 7):** add `MIN_AGE = 18` and a `getAgeFromDob` helper in `user.utils.ts`. Parse with dayjs in strict mode; check the date format the app actually sends in existing data. Add a zod refine on `createValidationSchema.dob` and `updateValidationSchema.dob`: a valid date, not in the future, age ≥ 18, and ≤ 120 years old. Also make sure the admin users list returns `dob` (#6).
7. **Email OTP (#1, 65):**
   - Add `isEmailVerified` to `user.model.ts`.
   - Flow: register → phone OTP → `/otp/send-otp-in-email` → `/otp/verify-with-email`, which sets `isEmailVerified`.
   - Add an endpoint to correct the email during a pending sign-up (uses the otp token, checks uniqueness, resends the OTP).
   - `loginUser` returns 403 with a resume token for credentials users with `!isEmailVerified`.
   - Migration script: `updateMany` sets `isEmailVerified: true` for existing phone-verified and social users.

## Phase 2: Profile & account (#13, 23, 25, 26, 65, 67)

- **Phone flow:** `sendOtpViaTokenInPhone` stores `pendingPhoneNumber`. `verifyWithPhoneNumber` runs the duplicate check and moves it to `phoneNumber`. This covers phone changes (#26) and social onboarding (#13).
- **Social onboarding (#13):** add a `termsAcceptedAt` field and `PATCH /users/complete-onboarding` (dob with the age check, terms). Add `needsOnboarding` (no verified phone, dob or terms) to the `generateTokens` user response in `auth.utils.ts:36`.
- **Email change (#26, 65):** `POST /users/change-email/request` (uniqueness check, OTP to the new address, stored in `pendingEmail`) and `POST /users/change-email/verify`. Blocked for social accounts.
- **Admin edit (#67):** `PATCH /users/:id/contact`, admin only. Checks email/phone uniqueness and emails the new address.
- **#25:** `forgetPassword` returns 400 for google/apple with the same message `loginUser` already uses ("This account was created with google…").
- **#23:** `changePassword` returns 400 with a clear message for social users without a password. The app hides the screen using `registerWith` (already in the login and my-profile responses).

## Phase 3: Email delivery (#18, 25, 70)

- Rewrite `src/app/utils/emailSender.ts` using `nodemailer.createTransport`. New env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `EMAIL_FROM`; reuse `EMAIL`/`APP_PASS`. Keep the same function signature so none of the callers change.
- Log the real error, run `transporter.verify()` at startup and log the result, and add the new keys to `.env.example`.
- **#70(b):** `changeUserStatusFromDB` sends an email and notification for `warning` (`user.service.ts:1064-1068`, templates in `user.utils.ts`).

## Phase 4: Admin report alerts (#68)

- After `createReport`, call `findAdmin()` (`utils/findAdmin.ts`) and, for each admin, `NotificationService.createNotificationIntoDB`, which writes to the DB and emits on the socket. Do not use `sendNotification`: it doesn't save the notification when there's no FCM token. Also send an email via `emailSender`.
- Add `pending_review` to the moderation enum (`feed.constant.ts`) and set it in `createReport` when the value is null.

## Phase 5: Pricing (#32, 48) and self-booking (#38)

- Add a single helper, `calculateSessionPrice(hourlyRate, duration)`, and use it in `getSessionPrice` (`booking.service.ts:123`) and `enrichSessionDurationsWithPrice` (`user.service.ts:763`).
- `updateUserInfoFromDB` recomputes every `offeredPrice` whenever `hourlyRate` changes.
- VAT snapshot: `createBookings` stores `expertVatRate`, `expertVat` and the total on the booking, and `createPaymentIntent` uses that snapshot instead of a live lookup. Existing bookings keep their price.
- Block self-booking in `createBookings`: return 400 when `consultId === userId`.

## Verification

- `npm run build` and `npm run lint`.
- New `node:test` files for the age helper, `normalizePhone`, `calculateSessionPrice` and the register resume and referral logic, added to the `test` script in `package.json`. *(Done and passed on 22 Nov, plus a full E2E run; all test files were removed on 23 Nov on request.)*
- Manual API checks (Postman/curl, dev mode returns the mock OTP), reproducing each sheet row's steps:
  - Register with a wrong phone, then re-register with the correct one: succeeds (#2).
  - Reuse a referral code across two new emails: both succeed and both link to the referrer (#14).
  - Duplicate email gets a clear 409 (#4); duplicate phone gets a 409 (#12).
  - Under-18 dob is rejected (#5, 6).
  - Delete a user, re-sign-up, resend OTP: works (#15).
  - Forgot-password email arrives (#18); a Google account gets the social message (#25).
  - Reporting a post creates an admin notification and email (#68).
  - Rate change: shown price equals charged price (#32).
- Security checks:
  - `/auth/google` with a fake token gets 401.
  - reset-password without OTP verification gets 403.
  - update-profile with `{role:"admin"}` is ignored.
  - checkout without a token gets 401.

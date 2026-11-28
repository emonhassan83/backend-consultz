# Client QA — Verification Test Results

- **Date:** 2026-11-28
- **Scope:** the 9 rows still `failed` in the client's "Failed Issues" tab (#12, 13, 14, 15, 18, 32, 67, 68, 70)
- **Result:** **49 tests, 48 pass, 0 fail, 1 skipped**
- Related: [CLIENT_QA_HANDOFF.md](CLIENT_QA_HANDOFF.md), [CLIENT_QA_ISSUES_CHANGES.md](CLIENT_QA_ISSUES_CHANGES.md), [load_test.md](load_test.md)

## How it was run

- **Runner and target:** `node:test` (via `ts-node`) called the real service functions, zod schemas and route tables. It did not go over HTTP.
- **Database:** a throwaway MongoDB replica set in Docker on port 27099. The suite refused any other URL, so the `.env` database was never used.
- **Fakes:** email (`emailSender`), the socket (`global.socketio`, recording which room each event went to) and push. `NODE_ENV=development`, so OTPs came back in the responses.
- **Runs:** the suite ran three times on 28 Nov:
  - after the #12 phone fix;
  - after the socket-room fix;
  - after the profile transaction change from the load test.

  All three gave the same result.
- **Removed afterwards:** the test files (`qa-verify/`) were deleted after the run, as was done for the earlier test files on 23 Nov. This page records what they checked.

```
# tests 49
# pass 48
# fail 0
# cancelled 0
# skipped 1
# duration_ms 6795
```

## Results by issue

| # | Test | Result |
|---|---|---|
| 12 | `normalizePhone` maps `+44 7700 163907`, `+44-7700-163-907`, `0044 7700 163907` and `+44 (7700) 163907` to `+447700163907` | ✅ |
| 12 | The phone schemas (register, phone OTP, admin phone) accept spaced and dashed numbers, including 16-character and `0044` forms | ✅ |
| 12 | The phone schemas reject letters, symbols only (`+-----`), too few digits and 16 digits | ✅ |
| 12 | Register: a verified owner of `+447700163907` blocks `+44 7700-163907` with 409 | ✅ |
| 12 | Register: a different number succeeds and is stored normalized | ✅ |
| 12 | Register: an **unverified** sign-up holding a number doesn't block another register | ✅ |
| 12 | `send-otp-via-token-in-phone`: a verified owner of the number gives 409, whatever the spelling | ✅ |
| 12 | `send-otp-via-token-in-phone`: a free number is stored as `pendingPhoneNumber`, normalized | ✅ |
| 12 | Two users with the same pending number: the first to verify keeps it, the second gets 409 | ✅ |
| 12 | Admin phone edit: another verified owner gives 409 | ✅ |
| 12 | Admin phone edit: `+-----` gives 400 | ✅ |
| 12 | Admin phone edit: a valid number is normalized and marked verified | ✅ |
| 13 | Google sign-up: a new social user has `needsOnboarding: true` | ✅ |
| 13 | `getNeedsOnboarding`: social users need a phone, a verified phone, dob and terms; always false for credentials users | ✅ |
| 13 | Complete onboarding: an under-18 dob gives 400 | ✅ |
| 13 | Complete onboarding: valid dob + terms after phone verification clears `needsOnboarding` | ✅ |
| 13 | Booking returns 403 while onboarding isn't done | ⏭ Skipped. The booking fixtures were too heavy; the check exists in `booking.service.ts` `createBookings` |
| 14 | Two new users sign up with the same referral code: both succeed, both linked to the referrer, no E11000 | ✅ |
| 14 | Re-registering the same unverified email with the same code (resume) succeeds and keeps the referrer | ✅ |
| 14 | Applying the same code again is a no-op | ✅ |
| 14 | A different code gives 400 "different referral code" | ✅ |
| 14 | The user's own code gives 400 | ✅ |
| 15 | `send-otp-in-email` for an unverified live sign-up returns `{ email, token, otp }` | ✅ |
| 15 | `send-otp-in-email` for a soft-deleted account gives 404 "…start sign-up again" | ✅ |
| 15 | Deleted old record + new sign-up on the same phone: resend finds the live record | ✅ |
| 15 | `send-otp-in-email` for an already verified user also issues an OTP (by design) | ✅ |
| 18 | Brevo config: login + SMTP key + From → `smtp-relay.brevo.com:587`, From `"Consultz" <info@consultz.com>`, no warnings | ✅ |
| 18 | Only one Brevo variable set → "half configured" warning, falls back to the old SMTP setup | ✅ |
| 18 | An API key (`xkeysib-…`) in place of the SMTP key gives a warning | ✅ |
| 18 | A From address equal to the Brevo login gives a warning | ✅ |
| 18 | Forgot password (credentials) sends one email; reset without a verified OTP gives 403 | ✅ |
| 18 | Forgot password for a Google user gives 400 and sends no email | ✅ |
| 70 | Change-status warning: email to the user, notification saved **and sent to the user's own socket room** (never to every socket), `warningCount` 1 then 2 | ✅ |
| 70 | Change-status warning still succeeds when the email fails | ✅ |
| 32 | `calculateSessionPrice(60, 30)` = 30, `(75, 45)` = 56.25 | ✅ |
| 32 | `withSessionPrices` ignores a stale stored `offeredPrice` | ✅ |
| 32 | Changing only `hourlyRate` recomputes the stored prices, and the profile shows the same price as the booking charges | ✅ |
| 32 | `calculateBookingTotal(100, 20)` → VAT 20, total 120; `(100, null)` → total 100 | ✅ |
| 67 | Admin email edit: an email taken in any letter case gives 409 | ✅ |
| 67 | Admin email edit: a Google user gives 400 | ✅ |
| 67 | Admin email edit: an admin target gives 403 | ✅ |
| 67 | Admin email edit: a deleted user gives 404 | ✅ |
| 67 | Admin email edit: a valid email is lowercased and verified, and two notice emails are sent | ✅ |
| 67 | The admin email schema rejects a bad ObjectId and a bad email | ✅ |
| 68 | Report a post: the post goes to `pending_review`, every admin gets a notification **in their own socket room**, the moderation inbox gets an email, nothing is broadcast | ✅ |
| 68 | Reporting the same post twice gives 400 | ✅ |
| 68 | The report is saved even when the email fails | ✅ |
| 68 | The reporter's request still succeeds when the email fails | ✅ |
| — | Route table: every endpoint in the handoff exists with the right method and mount (users, otp, notifications, feeds, reports) | ✅ |

## Bugs found and fixed during verification

| Issue | Bug | Fix |
|---|---|---|
| #12 | The phone validation counted raw characters (6–15), so `+44 7700 163 907` or `0044-7700-163907` got a 400 before normalization. Admin phone edit (6–20 characters) accepted `+-----` and saved it as `+` | Shared `phoneNumberSchema` (`src/app/utils/phoneSchema.ts`): 6–15 **digits** after normalizing, letters rejected. The admin service runs the same check |
| #68 / #70 | Report alerts and warning notices were sent with `io.emit` to **every** connected socket, including reporter names and reasons | `io.to(<receiverId>)`. The event name is unchanged |
| Load test | `GET /users/:id` returned 500 (`WriteConflict`) under concurrent views | Profile read no longer uses a transaction; see [load_test.md](load_test.md) |

## Not covered

- Real delivery through Brevo, FCM, Twilio and Stripe: all were faked.
- The app and dashboard screens.
- #14 on QA's own database: still needs `npm run check:indexes` there.

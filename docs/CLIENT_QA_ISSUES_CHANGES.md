# Client QA Issues — Backend Changes Log

- **Date:** 2026-11-22
- **Plan:** [CLIENT_QA_ISSUES_FIX_PLAN.md](CLIENT_QA_ISSUES_FIX_PLAN.md)
- **Status:** Implemented, apart from the open items at the end. Not yet committed or deployed.

This log records what has been changed in the backend for the client QA sheet, where, and what is still open. Line numbers drift, so each change names the file and function.

## Summary

| QA # | Issue | Status |
|---|---|---|
| 1, 65 | No email verification at sign-up | ✅ Done: sign-up OTP now goes to email |
| 2 | Wrong phone, go back: "Referral code already used" | ✅ Done |
| 4 | Duplicate email shows a referral error | ✅ Done: clear 409, email case-insensitive |
| 5 | Under-18 consultee can sign up | ✅ Done: minimum age 18 |
| 6 | Under-18 expert can sign up; admin can't see dob | ✅ Done: age block plus dob visible to admin |
| SEC | Register overwrote social / verified accounts (takeover) | ✅ Done |
| SEC | `sendOtpInEmail` marked the user verified on send | ✅ Done (email only) |
| SEC | `?fields=` leaked password hash, OTP and dob (incl. public endpoints) | ✅ Done (not in the original plan) |
| 12 | Sign-up allowed a phone number that another account already uses | ✅ Done: 409, phone normalized |
| 13 | Google/Apple sign-up skipped phone, dob and terms | ✅ Done (backend): onboarding flag, endpoint, booking block. App screens needed. |
| 14 | A used referral code blocks every later sign-up | 🔍 Not reproducible on the `.env` DB. Diagnostics added; run `check:indexes` on QA's DB and deploy. |
| 15 | "Resend OTP" says "User not found" after the old account was deleted | ✅ Done: live record found; clear 404 otherwise |
| 16 | All referral codes "used"; sign-up blocked | ✅ Done: code is optional; re-applying the same code is a no-op |
| 18 | Forgot password: "Error sending email", no code arrives | ✅ Done: direct SMTP (nodemailer). Production `.env` must have a valid Gmail App Password. |
| SEC | Forgot-password / phone OTP marked the user verified on send; reset was reusable | ✅ Done |
| 23 | Google/Apple user sees a Change Password form asking for a password they never set | ✅ Done (backend): clear 400 message. App screen needed. |
| 25 | Google/Apple user taps Forgot password: generic error or nothing | ✅ Done (backend): clear 400 with `data.registerWith`. App button needed. |
| 26 | Can't change email or phone later with verification | ✅ Done (backend): email change with OTP; phone change already existed. App screens needed. |
| SEC | update-profile could change `email` with no verification | ✅ Done: `email` is ignored there |
| 31 | Expert intro video: replace a wrong or too-large video, clear size message | ✅ Done (backend): the feature didn't exist; upload/replace/remove endpoints with a 50 MB limit and a clear 413. App screen needed. |
| SEC | A Multer error (e.g. file too large) came back as 500 | ✅ Done: 413 / 400 |
| 32 | Expert changes rate: profile showed one price, booking charged another | ✅ Done: price always from `hourlyRate`; booking locks price + VAT total; payment charges the locked total |
| SEC | update-profile with `sessionDurations` re-allowed `phoneNumber`/`email` | ✅ Done (side fix in #32) |
| 65 | Typo in email: emails go nowhere, user can't see or fix it | ✅ Done (backend): fix the email from the sign-up OTP screen; OTP responses include the email; legacy users can verify or change it. App screens needed. |
| 67 | Admin can't correct a user's email or phone | ✅ Done (backend): `PATCH /users/:id/email` and `PATCH /users/:id/phone`. Dashboard screens needed. |
| 68 | Reported post: admin gets no email or dashboard notification; Moderation Status blank | ✅ Done (backend): dashboard notification + socket + push + email to admins; status `pending_review`. Set `ADMIN_NOTIFY_EMAIL`; dashboard bell needed. |
| 70 | "Warn User": no email; warning not recorded on the account | ✅ Done: email (SMTP from #18; a push failure no longer blocks it), warning history + count on the user, change-status warning now notifies and emails. Dashboard view needed. |
| 38 | An expert can book a session with themselves | ✅ Done: 400 "You can't book a session with yourself." |
| SEC | update-profile mass assignment: any user could set `role: admin`, `points`, `status` | ✅ Done: protected fields are ignored |
| SEC | Payment checkout / confirm without login; payer taken from the body; confirm didn't check the intent | ✅ Done: login required, payer from the token, confirm checks booking, payer and amount. **App must send `Authorization`.** |
| SEC | Google/Apple token not verified (email taken from the body) | ⏸ Not done. Decision (22 Nov): no token verification for now. |

## 1. Sign-up OTP by email (#1, #65)

**Before:** register sent an SMS OTP. Email was never verified, and the user was `active` straight away.

**Now:** register sends the OTP to the email address. The app verifies it with `/otp/verify-with-email`.

```
POST /users/register          → OTP emailed; response data.otpToken.token
POST /otp/verify-with-email   → header Authorization: <token>, body { otp } → accessToken
POST /otp/send-otp-in-email   → resend, body { email }
```

| File | Change |
|---|---|
| `src/app/modules/user/user.model.ts`, `user.interface.ts` | New field `isEmailVerified` (default `false`) |
| `src/app/modules/user/user.controller.ts` `registerUser` | Calls `otpServices.sendOtpInEmail(result.email)` instead of `sendOtpViaTokenInPhone` |
| `src/app/modules/otp/otp.service.ts` `verifyWithEmail` | Finds the user by `userId` from the token (falls back to `_id`, then email), excluding deleted users. Sets `isEmailVerified: true` and `expireAt: null`. On first verification, sends the expert pending-review email (moved here from phone verify). Rejects an OTP of `0`, which is the stored value after use. Before, `"0000"` passed. |
| `src/app/modules/otp/otp.service.ts` `sendOtpInEmail` | Sets `verification.status: false` on send. Only verify sets it to `true`. Excludes deleted users. In non-production, returns `{ token, otp, mock: true }` like phone OTP, and an email failure doesn't block. |
| `src/app/modules/auth/auth.service.ts` `loginUser` | Returns 403 "Your email is not verified…" when both `isEmailVerified` and `isPhoneOtpVerified` are false. Older phone-verified users keep working, so no migration is needed. |

**Notes:**
- The phone-verification points reward (`phone_verify`) is no longer given at sign-up. It is only given through `/otp/verify-with-phone`.
- **App handoff:** the OTP screen after register must call `/otp/verify-with-email`, not `/otp/verify-with-phone`.
- **Dependency:** in production, email still goes through the external relay in `utils/emailSender.ts`. If the relay fails, register returns "Error sending email". The user can retry, which resumes the sign-up. Phase 3 (nodemailer SMTP) is needed for reliable delivery.

## 2. Existing email on register (#2, #4, account takeover)

`src/app/modules/user/user.service.ts` `registerUserIntoDB`, existing-email branch:

| Existing account | Result |
|---|---|
| Soft-deleted | Revived (as before). Now also resets `isEmailVerified` and `isPhoneOtpVerified`. |
| Social (`registerWith` ≠ `credentials`), or email/phone verified | **409** "An account with this email already exists. Please log in or reset your password." |
| Sign-up started but OTP never verified | Resumed: fields updated, TTL `expireAt` extended by 60 min, referral applied with `replaceExisting: true` |

- **#2:** resuming no longer throws "Referral code already used". Replacing the referral is safe because nothing is rewarded before the first paid session.
- **#4:** the 409 runs before any referral logic, so a referral error can't hide it.
- **Security:** before, any account with `isPhoneOtpVerified=false` (every Google/Apple user) could be overwritten through register: password, role and phone. That path is now blocked.

## 3. Email case-insensitivity (#4)

`Test@x.com` and `test@x.com` are now the same account.

| File | Change |
|---|---|
| `src/app/utils/normalizeEmail.ts` (new) | `normalizeEmail()` trims and lowercases. `emailCaseInsensitiveFilter()` matches the exact email in any case, with regex characters escaped. |
| `src/app/modules/user/user.model.ts` | `email` has `lowercase: true, trim: true`. `isUserExistsByEmail` tries an exact (indexed) match, then falls back to case-insensitive. This covers login, Google/Apple, forgot/reset/change password, refresh token and the `auth()` middleware. |
| `src/app/modules/user/user.service.ts` `registerUserIntoDB` | Normalizes the email. The duplicate check is case-insensitive. |
| `src/app/modules/otp/otp.service.ts` | `sendOtpInEmail` and the `verifyWithEmail` email fallback are case-insensitive. |
| `src/app/modules/auth/auth.service.ts` `resetPassword` | Compares the body email and the token email after normalizing. |
| `src/app/seeder/migrateLowercaseEmails.ts` (new) | Optional one-off migration. Accounts that differ only by case are reported as conflicts and left unchanged. |

```bash
npm run migrate:lowercase-emails            # dry run
npm run migrate:lowercase-emails -- --apply # write
```

The migration is optional, because the fallback keeps legacy mixed-case accounts working. The fallback query can't use the index, so after the migration has run it can be removed.

## 4. Minimum age 18 (#5, #6)

The rule applies to every role (consultee and expert). `dob` is stored as `YYYY-MM-DD` (zod `z.iso.date()`). Input can also be `YYYY/MM/DD`, single-digit month/day, or have a time part (`2000-01-31T00:00:00.000Z`). `normalizeDobInput()` in `user.utils.ts` converts it to `YYYY-MM-DD` before validation, both in `dobSchema` (zod preprocess) and in `update-profile`. `DD/MM/YYYY` is still rejected.

**Registration `phoneNumber` is optional** (fix after app feedback). `POST /users/register` accepts a missing or empty phone. When one is sent, it still has to be 6–15 characters and pass the duplicate check (#12). When it is missing, the user is saved without one (`null`), and an incomplete sign-up being resumed keeps its existing number. The phone can be added and verified later through the phone OTP flow.

| File | Change |
|---|---|
| `src/app/modules/user/user.constant.ts` | `MIN_AGE = 18`, `MAX_AGE = 120` |
| `src/app/modules/user/user.utils.ts` | `getAgeFromDob(dob, now?)`: full years in UTC, `null` for an invalid date, handles 29 Feb. `getDobError(dob, now?)`: returns a user-facing message or `null`. |
| `src/app/modules/user/user.validation.ts` | New `dobSchema` (format check plus age refine). Required in `createValidationSchema`, optional in `updateValidationSchema`. |
| `src/app/modules/user/user.service.ts` `updateUserInfoFromDB` | `PUT /users/update-profile` has no zod schema, so the same check runs here. It runs only when `dob` actually changes, so legacy-format dobs don't block unrelated edits. |

| `dob` | Response (400) |
|---|---|
| under 18 | "You must be at least 18 years old to use Consultz" |
| future | "Date of birth cannot be in the future" |
| wrong format / not a real date / missing | "Date of birth must be a valid date in YYYY-MM-DD format" |
| over 120 years | "Please enter a valid date of birth" |

Validation runs before the service, so no account is created.

**⚠️ Before deploying:** confirm that the app sends `dob` as `YYYY-MM-DD`. If it doesn't, every sign-up will fail.

**Not covered:** Google/Apple users give no dob at sign-up. That is #13 (Phase 2 onboarding).

## 5. Admin can see dob (#6)

| Endpoint | Viewer | `dob` returned |
|---|---|---|
| `GET /users` | admin | yes |
| `GET /users/:id` | admin | yes |
| `GET /users/:id` | expert / consult | no |
| `GET /users/experts` and other listings | anyone | no |

- `user.service.ts` `getAllUsersFromDB(query, userId, { includeDob })`: the `getAllUsers` controller passes `includeDob` only for admin.
- `user.service.ts` `geUserByIdFromDB(viewerId, viewedUserId, viewerRole)`: adds `dob` to the select for admin only.
- **Frontend handoff:** the admin panel needs a dob/age column.

**Found while checking:** expert sign-ups are created `active`. `USER_STATUS.pending` is never set, so there is no admin approval step before an expert goes live. Whether to add one is a product decision for the client.

## 6. Security: `?fields=` data leak (new, not in the plan)

Mongoose merges chained inclusive `.select()` calls. So `?fields=` used to **add** fields on top of the ones the service chose. For example, this request returned every expert's password hash, OTP and dob without logging in:

```
GET /users/public/top-experts?fields=password,verification,dob
```

The same applied to all 8 user listing endpoints (3 of them public), and to any other module that uses `QueryBuilder.fields()`.

**Fix** in `src/app/builder/QueryBuilder.ts` `fields()`:
- When the service already selected fields, `?fields=` can only pick from those. It can't add new ones.
- `password`, `verification`, `verification.otp`, `passwordChangedAt`, `fcmToken` and `voipToken` can never be requested through `?fields=` on any model. `+field` (force-select a hidden field) is stripped.
- Without `?fields=`, behavior is unchanged.

This is live in production today. Ship it as a separate commit as soon as possible.

## 7. Duplicate phone number (#12)

**Before:** register looked up existing users by email only. Nothing checked `phoneNumber`, so a number that another account already used could sign up again and receive an OTP.

**Now:** register returns **409** "An account with this phone number already exists. Please log in instead." when another live, completed account owns the number.

- "Owns" means: not deleted, and `isEmailVerified` or `isPhoneOtpVerified`. Unverified sign-ups don't own their number, so a user who typed a wrong number can't block anyone. Email verification counts because the sign-up OTP now goes by email (#1).
- Numbers are normalized to `+` and digits (`+44 7700 163907` → `+447700163907`; a `00` prefix becomes `+`). Lookups also match the raw trimmed value, so numbers stored before this change are still caught.

| File | Change |
|---|---|
| `src/app/utils/normalizePhone.ts` (new) | `normalizePhone()` and the 409 message |
| `src/app/modules/user/user.utils.ts` | `findPhoneOwner()` and `assertPhoneAvailable()` |
| `src/app/modules/user/user.service.ts` `registerUserIntoDB` | Saves the normalized phone. Checks the phone before any write, excluding the user's own record, so an incomplete sign-up can be resumed. The email 409 for completed accounts still comes first. |
| `src/app/modules/otp/otp.service.ts` `verifyWithEmail`, `verifyWithPhoneNumber` | Race guard on first verification: 409 if another account has already claimed the number. If two unverified sign-ups use the same number, the first to verify keeps it. |
| `src/app/modules/otp/otp.service.ts` `sendOtpViaDirectPhone` | Also looks up by the normalized number |
| `src/app/modules/user/user.service.ts` `updateUserInfoFromDB` | `phoneNumber` is dropped from the payload. Before, update-profile could set any number with no check. Phone changes go through the OTP flow (#26, still open). |

- **Not done:** a DB unique index on `phoneNumber`. Existing duplicates or nulls would make the index build fail. A partial unique index can follow a data audit.
- **Frontend:** show the 409 message with a "Log in instead" option.

## 8. Social sign-up onboarding (#13)

**Before:** Google/Apple sign-up created an `active` user with no phone, date of birth or terms. `send-otp-via-token-in-phone` sent an SMS to the number in the body but never stored it, so a social user's phone was never saved.

**Now:** social users must finish onboarding: verified phone, dob (18+) and accepted terms. The backend reports this with `needsOnboarding` and blocks booking until it is done. This applies to existing Google/Apple users too (no migration), so they will see onboarding on their next login.

**App flow:**
```
Google/Apple login               → data.user.needsOnboarding = true
POST  /otp/send-otp-via-token-in-phone  header Authorization: <accessToken>, body { phoneNumber }
                                 → data.token (OTP token)
POST  /otp/verify-with-phone     header Authorization: <OTP token>, body { otp }
PATCH /users/complete-onboarding header Authorization: <accessToken>, body { dob: "YYYY-MM-DD", termsAccepted: true }
                                 → data.needsOnboarding = false
```
- Steps 2–3 and step 4 can run in either order. `GET /users/my-profile` returns `needsOnboarding` for the app to resume after a restart.
- `dob` can be left out of `complete-onboarding` if the user already has one. Once set, it can't be changed there (400).

| File | Change |
|---|---|
| `src/app/modules/user/user.model.ts`, `user.interface.ts` | New fields `pendingPhoneNumber`, `termsAcceptedAt` |
| `src/app/modules/user/user.utils.ts` | `getNeedsOnboarding(user)`: true only for `google`/`apple` users missing a verified phone, dob or terms. Always false for credentials users. |
| `src/app/modules/otp/otp.service.ts` `sendOtpViaTokenInPhone` | Normalizes the number, returns 409 if another completed account owns it (#12), stores it as `pendingPhoneNumber` |
| `src/app/modules/otp/otp.service.ts` `verifyWithPhoneNumber` | Moves `pendingPhoneNumber` to `phoneNumber` (with the #12 race guard). Also: rejects deleted users, and an OTP of `0` (the stored value after use) no longer matches. |
| `src/app/modules/otp/otp.service.ts` `sendOtpViaDirectPhone` | Clears `pendingPhoneNumber`, since this OTP goes to the stored number |
| `src/app/modules/user/*` | New `PATCH /users/complete-onboarding` (expert, consult): zod `dobSchema` + `termsAccepted: z.literal(true)` |
| `src/app/modules/auth/auth.utils.ts` `generateTokens`, `auth.service.ts` `loginUser` | `user.needsOnboarding` in the login response |
| `src/app/modules/user/user.service.ts` `geUserByIdFromDB` | Own profile includes onboarding fields and `needsOnboarding` |
| `src/app/modules/booking/booking.service.ts` `createBookings` | 403 "Please complete your profile (phone, date of birth, terms) before booking." Checkout needs a booking, so it is covered too. |

- The phone part also gives #26 (phone change) its backend: send-otp-via-token-in-phone, then verify-with-phone.
- **Not done:** social token verification (Phase 0), `pending` review status for social experts, referral codes for social sign-up. Credentials sign-up does not record `termsAcceptedAt` yet; the app's terms checkbox there is client-side only.

## 9. Referral code reuse (#14)

QA: every referral code that was used once fails on the next sign-up with "Referral code already exists" (`6866f9ad`, `38569b52`, `365a9239`).

**Findings (22 Nov):**
- Code (working tree and HEAD): nothing limits a code to one use. `referralCode` isn't unique in the schema, codes are random, and register never copies the entered code onto the new user.
- "…already exists" can only come from `handleDuplicateError`, i.e. a Mongo E11000 duplicate key error.
- `.env` DB (read-only check): `users` has only `email_1` and `id_1` as unique indexes. `6866f9ad` has **7 linked referrals**, the latest on 18 Nov 10:21 UTC, so reuse works there. `38569b52` and `365a9239` have **0** referrals, so QA's attempts never reached this DB.

**Likely cause:** QA's server uses a different DB (or an older deploy). The most likely explanation is a leftover unique index on a referral field, e.g. `referredBy_1`: the first referral succeeds and every later one hits E11000. A second possibility is the HEAD "Referral code already used" bug when an unverified user re-submits register; that is already fixed in section 2 but not deployed.

**Changes:**

| File | Change |
|---|---|
| `src/app/errors/handleDuplicateError.ts` | Returns **409** "`<field>` already exists" (was 400 "Invalid ID" / "`<value>` is already exists"). Logs the index name and key pattern, not the value, so the offending index shows in server logs. |
| `src/app/seeder/checkUserIndexes.ts` (new), `npm run check:indexes` | Lists `users` and `pointslogs` indexes, marks ones not in the schema, and flags stale **unique** indexes on referral fields. `-- --drop` drops only those; other indexes are only reported. |

**Team to do:**
1. Confirm which DB and commit QA's server runs.
2. On that DB: `npm run check:indexes`, then `npm run check:indexes -- --drop` if it flags anything.
3. Deploy the working tree, then QA re-tests with two new emails and the same code. Both should succeed and link to the code owner.

## 10. Resend OTP after a deleted account (#15)

**Before:** admin delete is a soft delete, so the old record keeps its phone number. `sendOtpViaDirectPhone` looked up `{ phoneNumber }` without an `isDeleted` filter. With an old deleted record and a new sign-up on the same number, it could find the deleted one and return "User not found".

**Now:**

| File | Change |
|---|---|
| `src/app/modules/otp/otp.service.ts` `sendOtpViaDirectPhone` | Looks up only live records (`isDeleted: false`), newest first. No match → **404** "No account or sign-up in progress was found for this phone number. Please start sign-up again." |
| `src/app/modules/otp/otp.service.ts` `sendOtpInEmail` | Lookup unchanged (it already skipped deleted users). No match → **404** with the same message for email. Also covers an unverified sign-up removed by the 60-minute TTL. |

- QA's note that "the user record is created before sign-up is finished" is by design: an unverified sign-up is a real record that the `expireAt` TTL removes after 60 minutes.
- **App:** sign-up OTP now goes by email (#1), so the sign-up screen's "Resend OTP" should call `POST /otp/send-otp-in-email { email }`, not the phone endpoint. On 404, send the user back to the start of sign-up.

## 11. Sign-up blocked when every referral code is "used" (#16)

**Findings:**
- A referral code is **not required**. `referralCode` is optional in the register schema, so sign-up without a code works.
- Nothing limits a code to one use (see section 9).
- QA is blocked *after* tapping Verify. `applyReferralCodeToUser` threw "Referral code already used" whenever the user already had a `referredBy`, **even for the same code**. If the app sends the code in the register body and calls `PATCH /users/use-referral-code` again after verification, the second call always failed.
- The referrer lookup didn't skip deleted users, so a deleted account's code was still accepted.

**Changes:**

| File | Change |
|---|---|
| `src/app/modules/user/user.utils.ts` | New `getReferralApplyAction()`: same referrer again is a no-op; a different referrer is rejected with "You have already joined with a different referral code" (unless `replaceExisting`); own code is rejected |
| `src/app/modules/user/user.service.ts` `applyReferralCodeToUser` | Uses the helper. A no-op returns the same response shape with 200. Referrer lookup is `{ referralCode, isDeleted: false }`. |
| `src/app/modules/user/user.service.ts` `registerUserIntoDB` | Referrer pre-check also skips deleted users |

- **App:** send the code once, in the register body or in `use-referral-code`. Sending the same code twice is now harmless.
- **QA:** sign-up testing can continue without a code. If a code is still rejected as "used" on QA's server, that is the DB index issue from section 9: run `npm run check:indexes` there.

## 12. Forgot password email (#18)

**Cause:** `utils/emailSender.ts` didn't send mail itself. It posted the Gmail address and app password to an external relay (`consultz.vercel.app`), and any failure there became a generic 400 "Error sending email". Every other email (booking, support) went the same way.

**Changes:**

| File | Change |
|---|---|
| `src/app/utils/emailSender.ts` | Sends over SMTP with `nodemailer`. Same signature, so no caller changed. Logs the real SMTP error (`code`, `responseCode`, `response`); the client still gets "Error sending email". New `verifyEmailTransport()`. |
| `src/app/config/index.ts`, `.env.example` | New optional `SMTP_HOST` (default `smtp.gmail.com`), `SMTP_PORT` (465), `SMTP_SECURE` (true for 465), `EMAIL_FROM`. `EMAIL` / `APP_PASS` unchanged. |
| `src/server.ts` | Calls `verifyEmailTransport()` at startup and logs "SMTP ready" or the failure. Doesn't block startup. |
| `src/app/modules/auth/auth.service.ts` `forgetPassword` | Sets `verification.status: false` on send. Only `verify-with-email` sets it to true. |
| `src/app/modules/auth/auth.service.ts` `resetPassword` | Sets `verification.status: false` after a reset, so the token and OTP can't be reused. |
| `src/app/modules/otp/otp.service.ts` `sendOtpViaTokenInPhone`, `sendOtpViaDirectPhone` | Set `status: false` on send. Before, sending a phone OTP unlocked reset-password without any OTP. |

- `verification.status` is read only by `resetPassword`, so login is unaffected.
- **Checked:** SMTP login works with the local `.env` credentials. No email was sent from here.
- **Deploy:** sending now goes through Brevo (section 25). Set `BREVO_SMTP_LOGIN` and `BREVO_SMTP_KEY`. After restart, look for "SMTP ready (brevo, …)" in the log.

## 13. Change Password for Google/Apple users (#23)

**Cause:** the app shows the same Change Password form to everyone. `changePassword` didn't check `registerWith`; a social user has no password, so it answered 403 "Password do not matched".

**Changes:**

| File | Change |
|---|---|
| `src/app/modules/user/user.utils.ts` | New `isSocialAccount(registerWith)` and `getSocialPasswordMessage(registerWith)`. `getNeedsOnboarding` uses `isSocialAccount`. |
| `src/app/modules/auth/auth.service.ts` `changePassword` | Google/Apple users (or any user without a password) get **400** before the old-password check: "You sign in with Google. There's no separate Consultz password. To change your password, go to your Google Account settings." Apple says "Apple" and "Apple ID settings". |

- **App:** `registerWith` is already in the login / Google / Apple login response (`user.registerWith`) and in my-profile. When it is `google` or `apple`, Profile > Password shows no form: "You sign in with Google/Apple", that there's no separate Consultz password, a pointer to Google Account / Apple ID settings, and a 'Back to profile' button. Show the 400 message as a fallback for older app versions.
- "Set password" for social users is not done; the expected result asks for the info screen.

## 14. Forgot password for Google/Apple users (#25)

**Cause:** `forgetPassword` didn't check `registerWith`, so it tried to send an OTP to social users too. Before #18 that failed as "Error sending email". With email working, a social user could have used the OTP to create a Consultz password.

**Changes:**

| File | Change |
|---|---|
| `src/app/errors/AppError.ts` | Optional 4th argument `data`. Existing calls are unchanged. |
| `src/app/middleware/globalErrorHandler.ts` | Adds `data` to the error response only when an `AppError` has it. Every other error keeps the old shape. |
| `src/app/modules/user/user.utils.ts` | New `getSocialSignInMessage(registerWith)`. |
| `src/app/modules/auth/auth.service.ts` `forgetPassword` | Google/Apple users get **400** before any OTP is created or email sent: "This email is linked to Google sign-in. Please sign in with Google instead." (Apple: "Apple"), with `data: { registerWith }`. |
| `src/app/modules/auth/auth.service.ts` `loginUser` | Google/Apple users without a password get the same message and `data`. The old message was "This account was created with google. Please continue with google login." |

Example response:

```json
{
  "success": false,
  "message": "This email is linked to Apple sign-in. Please sign in with Apple instead.",
  "data": { "registerWith": "apple" },
  "errorSources": [...]
}
```

- **App:** on a 400 from `forget-password` or `login` with `data.registerWith` set to `google` or `apple`, show the message and a "Sign in with Google" / "Sign in with Apple" button that starts that login.
- **QA accounts (checked on the `.env` DB):** `baditagalogon@gmail.com` is `registerWith: apple` with its real email, and `valeriejeantagalogon@gmail.com` is `registerWith: google`. Both now get the message.
- **Note:** two social users on the `.env` DB (including the Google QA account) have a password, although Google/Apple sign-in never sets one and `passwordChangedAt` is null. It most likely came from the old register overwrite (section 2) or the update-profile mass assignment (still open). Forgot password still blocks them because the check uses `registerWith`. Email+password login still works for them.
- Apple "Hide My Email" users are stored as `…@privaterelay.appleid.com`. If they type their real email, the backend can't match it and returns 404 "This user is not found !".

## 15. Change email or phone from settings (#26)

**Findings:**
- **Phone:** already supported since #13. `POST /otp/send-otp-via-token-in-phone` (logged in) keeps the new number in `pendingPhoneNumber`, checks it isn't another account's verified number (409), and sends an SMS. `POST /otp/verify-with-phone` moves it to `phoneNumber`. `update-profile` already ignored `phoneNumber`. Only the app screen is missing.
- **Email:** there was no flow. `PUT /users/update-profile` copied `email` straight onto the user, with no verification. The JWT carries the email and `auth()` looks the user up by it, so that change also locked the user out of their session.

**Changes:**

| File | Change |
|---|---|
| `src/app/modules/user/user.service.ts` `updateUserInfoFromDB` | Ignores `email` and `pendingEmail`. |
| `src/app/modules/user/user.model.ts`, `user.interface.ts` | New `pendingEmail` (default null). |
| `src/app/modules/user/user.utils.ts` | New `getEmailChangeError()`: blocks Google/Apple users, the same email, and an empty email. |
| `src/app/modules/user/user.service.ts` | New `requestEmailChange` and `verifyEmailChange`. |
| `user.validation.ts`, `user.controller.ts`, `user.route.ts` | Two new routes, any logged-in role. |

**Endpoints:**

`POST /api/v1/users/change-email/request` with `{ "newEmail": "new@example.com" }`
- 400 for Google/Apple users ("Your email comes from your Google sign-in and can't be changed here."), the same email, or an invalid email.
- 409 "This email is already in use." when any other account has it. Deleted accounts count, because the email index is unique.
- Saves `pendingEmail` and a 5-minute OTP, and emails the OTP to the **new** address.
- Returns `{ pendingEmail }`. Outside production it also returns `{ otp, mock: true }`, like `send-otp-in-email`.

`POST /api/v1/users/change-email/verify` with `{ "otp": "1234" }`
- 400 if nothing is pending or the OTP is wrong, 403 if it expired, 409 if the email was taken in the meantime.
- Sets `email`, `isEmailVerified: true`, clears `pendingEmail` and the OTP.
- Sends a notice to the **old** address ("Your email was changed…"). If that email fails, the change still goes through and the error is logged.
- Returns `{ user, accessToken, refreshToken }`, the same shape as login. **The old tokens stop working** because they carry the old email.

**App:**
- **Email:** Settings > Email → `change-email/request` → OTP screen → `change-email/verify` → save the new `accessToken` and `refreshToken`. Hide this option for Google/Apple users (`registerWith`).
- **Phone:** Settings > Phone → `POST /otp/send-otp-via-token-in-phone { phoneNumber }` with the user's access token → OTP screen → `POST /otp/verify-with-phone { otp }` with the returned `token` in `Authorization` → save the returned `accessToken`.

## 16. Expert intro video (#31)

**Findings:** the feature didn't exist. The user model had no video field, and `update-profile` only takes `image` and `cover`. Its multer setup has no size limit, and `globalErrorHandler` didn't handle `MulterError`, so any upload limit would have returned a generic 500. The consultz.com website promises experts an "introductory video", so it was built rather than removing that wording.

**Limits** (`user.constant.ts`):
- 50 MB maximum. Multer uses memory storage, so the whole file is held in RAM.
- MP4, MOV (`video/quicktime`, iPhone) or WebM.
- 2 minutes maximum, **checked in the app**. The backend has no ffprobe and can't read the duration.

**Changes:**

| File | Change |
|---|---|
| `user.model.ts`, `user.interface.ts` | New `introVideoUrl` (default null). |
| `user.constant.ts` | `INTRO_VIDEO_MAX_MB`, `INTRO_VIDEO_MAX_SECONDS`, `INTRO_VIDEO_MIME_TYPES`. |
| `user.utils.ts` | `getIntroVideoFileError`, `getIntroVideoExtension`, `getS3KeyFromUrl`, `INTRO_VIDEO_TOO_LARGE_MESSAGE`. |
| `user.service.ts` | New `uploadIntroVideo` and `removeIntroVideo`. `updateUserInfoFromDB` ignores `introVideoUrl`. `geUserByIdFromDB` returns `introVideoUrl`, so it appears in my-profile and on the expert's public profile. |
| `user.route.ts`, `user.controller.ts` | Two routes, expert only. Their own multer instance applies the size limit and the type filter. |
| `middleware/globalErrorHandler.ts` | `MulterError`: 413 for `LIMIT_FILE_SIZE`, otherwise 400 (all upload routes). |

**Endpoints** (expert token only; other roles are rejected by `auth()`):

`PUT /api/v1/users/intro-video` (multipart, field `video`)
- 400 if no file is sent, or if it isn't MP4, MOV or WebM ("Intro video must be an MP4, MOV or WebM file.").
- 413 if it's over 50 MB: "Video is too large. The maximum size is 50 MB (about 2 minutes). Please choose a shorter video." with `data: { maxSizeMB: 50, maxDurationSeconds: 120 }`.
- Uploads to `videos/user/intro/<userId>-<timestamp>.<ext>`, saves `introVideoUrl`, and returns `{ introVideoUrl }`.
- **Replace** = upload again. The old file is deleted from S3 only after the new one is saved. If that delete fails, it's logged and the request still succeeds.

`DELETE /api/v1/users/intro-video`
- Sets `introVideoUrl` to null and deletes the file. Returns 400 if there is no video.

**App:**
- Expert profile > Intro video.
- Before uploading, check that the video is ≤ 2 minutes and ≤ 50 MB, and show the message right away if it isn't.
- Upload with a progress bar.
- Show the 413 `message` as-is.
- Offer Replace (upload again) and Remove.
- Show a player on the expert profile when `introVideoUrl` is set.

**Not covered:** compression or transcoding, thumbnails, server-side duration checks (these need ffmpeg), presigned direct-to-S3 uploads for larger files, and admin moderation.

## 17. Expert rate change (#32)

**Findings:**
- **Two prices.** The profile and expert list showed the stored `sessionDurations[].offeredPrice`. The booking charged `hourlyRate / 60 × duration`.
- **`offeredPrice` went stale.** `updateUserInfoFromDB` only recomputed it when the request included `sessionDurations`. If an expert changed only `hourlyRate`, the profile kept showing the old price but bookings charged the new one. This is the QA failure.
- **VAT was charged at the current rate, not the booked one.** `createPaymentIntent` used the expert's *current* VAT status and a live VAT rate. So the total could change between booking and payment.
- `booking.price` itself was already locked when the booking was made, and payment used it.
- **Side bug:** when `sessionDurations` was sent, `finalPayload = { ...payload, … }` rebuilt the payload from the raw input. That undid the removal of `phoneNumber`, `email` and `introVideoUrl`, so they could be changed through update-profile again.

**Changes:**

| File | Change |
|---|---|
| `src/app/utils/sessionPrice.ts` (new) | `calculateSessionPrice`, `withSessionPrices` (always from `hourlyRate`, ignores a stored `offeredPrice`), `calculateBookingTotal`. No DB imports. |
| `user.service.ts` `updateUserInfoFromDB` | Recomputes every `offeredPrice` when `hourlyRate` **or** `sessionDurations` changes. A new rate alone uses the expert's current durations. Rate ≤ 0 → 400. Changes `finalPayload` in place, which fixes the side bug. |
| `user.service.ts` `enrichSessionDurationsWithPrice`, `getAllUsersFromDB` | Profile and list prices come from `withSessionPrices`. Old documents with a stale `offeredPrice` show the right price without a migration. |
| `booking.service.ts` | `getSessionPrice` uses `calculateSessionPrice`. `createBookings` also stores `expertVatRate`, `expertVat` and `totalAmount`, the agreed total. |
| `booking.models.ts`, `booking.interface.ts` | New fields `expertVatRate` (null), `expertVat` (0), `totalAmount` (null). |
| `payment.service.ts` `createPaymentIntent` | If `booking.totalAmount` is set, charges the snapshot (`price`, `expertVat`, `totalAmount`, `isExpertVatRegistered`). Older bookings without it use the live lookup as before. The platform fee split is unchanged. |

**Behaviour now:**
- Rate change → the new price shows straight away in the profile and the list. New bookings use it.
- An existing booking keeps its price and total, even if the expert changes the rate or VAT status before the consultee pays.
- An unsupported VAT country now fails at booking (400) rather than at payment.

**App:**
- Show `sessionDurations[].price` and don't calculate prices in the app.
- On checkout, show `booking.price`, `booking.expertVat` and `booking.totalAmount`. That is exactly what will be charged.
- Refetch the profile after the expert saves a new rate.

## 18. Typo in the email (#65)

**Findings:** since #1, the sign-up OTP goes by email. With a typo, the code goes to the wrong address and the user is stuck on the OTP screen.
- Going back and registering again with the right email already worked. The phone number isn't blocked, because unverified sign-ups don't own their number (#12).
- But the app couldn't fix the email from the OTP screen.
- The record with the wrong email stayed for 60 minutes (TTL). That address might belong to someone else.
- The OTP response didn't include the email, so the screen couldn't show where the code went.
- Users from before #1 verified by phone, so their `isEmailVerified` is false and their email may have a typo. My-profile didn't return `isEmailVerified`, and `change-email/request` rejected their current email.

**Changes:**

| File | Change |
|---|---|
| `otp.service.ts` `changeSignupEmail` (new) | Fixes the email of a sign-up that hasn't verified yet. Authorised by the sign-up token. Updates `email`, extends `expireAt` by 60 minutes, then reuses `sendOtpInEmail` for a new OTP and token. |
| `otp.service.ts` `sendOtpInEmail` | The response includes `email` (register `otpToken` and resend). |
| `otp.validation.ts`, `otp.controller.ts`, `otp.route.ts` | `POST /otp/change-signup-email`. |
| `user.utils.ts` | New `getSignupEmailChangeError`. `assertEmailAvailable` moved here from user.service so otp can use it. `getEmailChangeError` allows the same email when `isEmailVerified === false`. |
| `user.service.ts` | `requestEmailChange` passes `isEmailVerified`. `verifyEmailChange` skips the "email changed" notice when the email didn't change. `geUserByIdFromDB` returns `isEmailVerified` on your own profile. |

**Endpoint:**

`POST /api/v1/otp/change-signup-email`
- Header `Authorization: <sign-up token>`. Body `{ "newEmail": "jon@gmail.com" }`.
- 403 if the token expired. The app should call `send-otp-in-email` with the old email to get a fresh token, then retry.
- 400 if the account is already verified (email or legacy phone) or is Google/Apple ("…Change your email from Settings."), or if the email is the same.
- 409 "This email is already in use." if any other account has it.
- Returns `{ email, token }`, plus `{ otp, mock: true }` outside production. Verify as usual with `/otp/verify-with-email` using the new token.

**Legacy users (email not verified):**
- My-profile returns `isEmailVerified`.
- To verify the current email, call `POST /users/change-email/request` with the same email, then `change-email/verify`. This sets `isEmailVerified: true`, keeps the email, and returns new tokens.
- To fix a typo, use the same calls with a new email (#26).

**App:**
- **Sign-up OTP screen:** show "Code sent to {email}" and a "Wrong email? Change" link. The link calls `change-signup-email`, then keeps the new `token`.
- **Settings:** show the email. If `isEmailVerified === false`, show a "Verify your email" banner with Verify and Change.

## 19. Admin corrects a user's email (#67)

**Findings:** admins had no way to change another user's email. Admin user endpoints were only change-status, points-adjustment, delete and the two GETs.

**Decisions:**
- **No OTP.** Support has already confirmed who the user is. The email is set as verified (`isEmailVerified: true`). Leaving it unverified would block login (403) for users who signed up after #1, because their phone flag is false.
- **Two notice emails, for safety:**
  - To the **old** address: "changed by our support team to …, contact support if you didn't ask for this".
  - To the **new** address: "log in with this email and your existing password".
  - If an admin mistypes the new email, the old-address notice still reaches the user.
- **Google/Apple accounts are blocked**, because their email comes from the provider (same rule as #26). **Admin accounts are blocked** too.
- The user's old tokens stop working, because they carry the old email. The user logs in again with the new email. The password is unchanged.

**Changes:**

| File | Change |
|---|---|
| `user.utils.ts` | New `getAdminEmailChangeError` (social account, same email, empty email). |
| `user.service.ts` | New `adminUpdateUserEmail`. Also: `emailChangedNoticeHtml` takes a `byAdmin` flag; new `emailNowActiveHtml`; an audit log line `[admin email change]` with admin, user, from, to and reason. |
| `user.validation.ts` | `adminUpdateEmailValidationSchema` (`params.id` ObjectId, `email`, optional `reason` ≤ 300 characters). |
| `user.controller.ts`, `user.route.ts` | `PATCH /users/:id/email`, admin only. |

**Endpoint:** `PATCH /api/v1/users/:id/email` with `{ "email": "jon@gmail.com", "reason": "Typo at sign-up" }`
- 404 if the user isn't found or is deleted.
- 403 if the target is an admin, or the caller isn't an admin.
- 400 for a Google/Apple user, or the same or an invalid email.
- 409 "This email is already in use." when any other account has it, deleted accounts included.
- 200 returns `{ _id, email, isEmailVerified }`. It also clears any pending self-service email change and OTP.

**Admin dashboard:**
- User details → "Edit" next to Email → modal with the new email and an optional reason → `PATCH /users/:id/email`.
- Show the error `message` as-is.
- On success, tell the admin that the user has to log in again with the new email.

**Phone (added 22 Nov):** `PATCH /api/v1/users/:id/phone` with `{ "phoneNumber": "+447700900123", "reason": "Wrong number at sign-up" }`, admin only.
- Same pattern as email: `user.service.ts` `adminUpdateUserPhone`, `adminUpdatePhoneValidationSchema` (phone 6–20 characters, reason ≤ 300), and the controller and route.
- The number is normalized (`normalizePhone`), then set with `isPhoneOtpVerified: true`. Any pending phone change or OTP is cleared.
- 404 if the user isn't found. 403 for an admin account or a non-admin caller.
- 400 for an invalid number. 400 if it's the same number and already verified. The same number while it's **unverified** returns 200 and marks it verified.
- 409 if another live, completed account owns the number (`assertPhoneAvailable`, #12).
- Logs `[admin phone change]`. Emails the user a notice with the number masked (`+44 ••• ••• 001`). If that email fails, the change still goes through.
- Tokens carry the email, so the user stays logged in.

**Not covered:** a full audit-log collection.

## 20. Admin alert when a post is reported (#68)

**Findings:**
- `createReport` only notified the **post author**. Nothing went to admins.
- The only admin helper (`sendUserStatusNotifYToAdmin`) returns early when the admin has no FCM token, which is normal for a web dashboard.
- `sendNotification` saves the Notification document **only when the push succeeds**. So admins never got a dashboard notification.
- `Feed.moderationStatus` only had admin actions in its enum, with a default of `null`. That's the "—" in the dashboard.
- Reporting a **user** doesn't exist in the backend. Only posts can be reported.

**Changes:**

| File | Change |
|---|---|
| `report/report.utils.ts` | New `notifyAdminsOfReport`. For every admin: a Notification document saved directly (no FCM needed), `notification::<adminId>` socket event, and a push if they have a token. Then an email to `ADMIN_NOTIFY_EMAIL` (comma-separated), or the admins' own emails if it isn't set. Never throws. |
| `report/report.helpers.ts` (new, pure) | `getStatusAfterReport`, `getStatusAfterReportWithdrawn`, `buildAdminReportMessage`, `getAdminAlertRecipients`, `escapeHtml`, `truncate`. |
| `report/report.service.ts` | `createReport` sets the post's status to `pending_review` if the post is still visible (`null`, `activate`, `warn_user`), then alerts admins **before** notifying the author, so a failing author push can't block the admin alert. `deleteReportByFeedId` sets the status back to `null` when the last report is withdrawn. |
| `feed/feed.constant.ts`, `feed.model.ts`, `feed.interface.ts` | New `FEED_MODERATION_STATUS` (the actions + `pending_review`) for the stored field. The moderation endpoint still only accepts actions. |
| `config/index.ts`, `.env.example` | `ADMIN_NOTIFY_EMAIL`. |

**Behaviour:**
- Report a post. Every admin gets a dashboard notification ("New report on a post", `modelType: Feed`, `reference: <feedId>`) and a real-time socket event.
- An email "New report on Consultz: action needed" includes the reporter, author, reason, a post excerpt, the post ID, the number of reports and the time. User text is HTML-escaped.
- The post shows `moderationStatus: pending_review` until an admin acts. The admin's action (`restrict`, `activate`, …) replaces it. If an admin reinstated a post and it is reported again, it goes back to `pending_review`.
- If an email or push fails, the report is still saved and returns 201.

**Admin dashboard:**
- Notification bell from `GET /notifications`, plus the socket `notification::<adminId>`. Clicking it opens the post (`reference`).
- Show `pending_review` as "Pending review", and add a filter: `?moderationStatus=pending_review`.

**Ops:** set `ADMIN_NOTIFY_EMAIL` in production `.env` (e.g. the moderation inbox).

**Not covered:** reporting a user (no such feature yet); other admin alerts that still depend on FCM.

## 21. Admin "Warn User" (#70)

**Findings:**
- **Warn User on a reported post** (`moderateFeedFromDB`, `warn_user`) set `status: warning`, then `sendContentModerationNotification('warning')` sent a push and then an email.
  - The email failed because of the old external relay. That was fixed by #18 (nodemailer SMTP).
  - If the push threw (an FCM error becomes an AppError), the email was never reached and the request failed.
  - The reason was put into the email HTML unescaped.
- **Not recorded.** Only `status` changed. There was no history, count or date, and the admin id was ignored.
- **`PATCH /users/change-status` with `warning`** sent nothing to the user. The user notification was commented out, and its text said "blocked". No email went out, and no reason could be given.

**Changes:**

| File | Change |
|---|---|
| `user.model.ts`, `user.interface.ts` | New `warnings` (`[{ reason, source: 'post' \| 'admin', feed, issuedBy, createdAt }]`), `warningCount`, `lastWarnedAt`. |
| `user.utils.ts` | `buildWarningEntry`, `recordUserWarning` (push entry, increment the count, set the date and `status: warning` in one update), `getWarningCopy`, `sendWarningEmail`. |
| `utils/notifyInApp.ts` (new) | `notifyUserInApp`: always saves the Notification document, emits the socket event, and pushes if there's a token. Never throws. |
| `feed.service.ts` `moderateFeedFromDB` | `warn_user` calls `recordUserWarning` with `source: 'post'`, the post, and the admin. |
| `feed.utils.ts` `sendContentModerationNotification` | Push wrapped in try/catch so the email always goes. Email text is HTML-escaped and includes a post excerpt. Applies to every moderation email. |
| `user.service.ts` `changeUserStatusFromDB` | `warning`: records it (`source: 'admin'`), sends an in-app notification and the email. Takes an optional `reason` and the admin id. |
| `user.validation.ts`, `user.controller.ts` | `change-status` accepts `reason` (≤ 500 characters). Passes `req.user._id`. |
| `user.service.ts` reads | Admin `GET /users/:id` returns `warnings`, `warningCount` and `lastWarnedAt`. Admin list returns `warningCount` and `lastWarnedAt`. |

**Behaviour:**
- Warn from a post: the user gets the app notification and the email "Content warning issued" (reason + post excerpt). `warningCount` goes up, and `warnings` gets an entry linking the post.
- Warn from change-status: `{ userId, status: 'warning', reason }` → app notification "Account warning issued." and the email "Your Consultz account has received a warning". Recorded with `source: 'admin'`.
- A second warning adds to the history instead of overwriting it.

**Admin dashboard:** on User details, show "Warnings ({warningCount})" with a list: date, reason, source (post link or "Admin"). Add a reason field when choosing Warning in change-status.

**Ops:** same as #18. Production SMTP (`EMAIL`, `APP_PASS`) must be valid.

**Not covered:** auto-suspend after N warnings, removing or expiring warnings.

## 22. Self-booking (#38)

**Cause:** `createBookings` never compared the expert being booked with the logged-in user. Experts can also book (the route allows `expert`), so an expert could book, and pay for, their own session.

**Change:** `booking.service.ts` `createBookings` returns **400** "You can't book a session with yourself." when `consult` is the caller's own id, before any other booking check. Checkout needs a booking, so it is covered too.

**App:** hide "Book" on the expert's own profile. Show the 400 message as a fallback.

## 24. Security: update-profile and payments (Phase 0)

**update-profile mass assignment.** `PUT /users/update-profile` copied the body straight onto the user. E2E proved that `{"role":"admin"}` turned any user into an admin.
- `user.constant.ts`: new `PROFILE_PROTECTED_FIELDS`, a deny-list. It covers:
  - role and account: role, status, registerWith, isDeleted, expireAt;
  - email, phone and their verification flags; password fields; terms;
  - points, rating, balance, followers;
  - referral, Stripe and VAT fields;
  - bonus flags and warnings;
  - intro video, timestamps and ids.
- `user.utils.ts`: `stripProtectedProfileFields` removes those fields, plus `$…` and dotted keys. `updateUserInfoFromDB` uses it in place of the three earlier `delete`s. The profile-completion bonus now checks the cleaned payload.
- **Why a deny-list:** the app sets fields such as `isProfileSetup` through this endpoint, and nothing else sets them. An allow-list could break the app.
- **Other channels for these fields:** VAT through `/users/vat-info`, email and phone through the OTP flows (#26), status through admin change-status, points only through `PointsService`.

**Payments.** `/payments/checkout` and `/payments/confirm-payment` had no `auth()`. The payer came from the body, and confirm only checked the Stripe status.

| File | Change |
|---|---|
| `payment.route.ts` | `auth(consult, expert)` on both routes. Without a token → 401. |
| `payment.validation.ts` | `account` / `user` optional (older apps still send them). |
| `payment.controller.ts` | Payer is always `req.user._id`. The body value is never used. |
| `payment.service.ts` `confirmPayment` | Before any write: the booking must be the caller's (403 "This booking is not yours."). The intent's `metadata.bookingId` / `userId` must match. A `Payment` must exist for that intent, booking and caller, with the same amount; otherwise 400 "Payment does not match this booking." The update query is also scoped to booking + account. |

`createPaymentIntent` already rejected another user's booking. It now gets the user from the token.

**Decision:** Google/Apple token verification is **not** done for now (22 Nov). `/auth/google` and `/auth/apple` still trust the email in the body.

## 25. Email sending moved to Brevo (22 Nov)

App emails (OTP, booking, payment, moderation) are sent through Brevo's SMTP relay. The mailbox itself is untouched; Brevo only sends.

| File | Change |
|---|---|
| `src/app/utils/emailConfig.ts` (new) | `resolveEmailConfig(env)`. With `BREVO_SMTP_LOGIN` + `BREVO_SMTP_KEY` set: host `smtp-relay.brevo.com`, port 587, STARTTLS. With them empty: the old `EMAIL` / `APP_PASS` Gmail setup, unchanged. Returns setup warnings (never a secret). |
| `src/app/config/index.ts` | `emailSender` comes from `resolveEmailConfig(process.env)`. `emailSender.email` is now the From / support address. |
| `src/app/utils/emailSender.ts` | Logs in with the Brevo SMTP login and key, and sends as the verified sender. `requireTLS` on 587, plus connection timeouts. Startup prints the warnings and "SMTP ready (brevo, host:port, from …)". |
| `src/app/seeder/sendTestEmail.ts` (new) | `npm run email:test -- you@example.com` checks the login and sends one real email. |
| `.env`, `.env.example` | New `BREVO_SMTP_LOGIN`, `BREVO_SMTP_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`. Optional `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` overrides. |

- The SMTP login (`…@smtp-brevo.com`) is **not** the From address. From is `EMAIL_FROM_ADDRESS` (falls back to `EMAIL`), with the name from `EMAIL_FROM_NAME` (default "Consultz").
- Startup warns if: only one Brevo value is set; the key is an API key (`xkeysib-…`) and not an SMTP key (`xsmtpsib-…`); `SMTP_HOST` still points elsewhere; the From address is missing, invalid, or the Brevo login.
- **Checked (22 Nov, before the test files were removed):** 13 unit tests on the config, and an E2E run in Brevo mode with old Gmail values left in the environment (Brevo host, port and login used; every email had the configured From; a send failure returned 400). To check a server now, use `npm run email:test`.
- **To go live:** put the two Brevo values in `.env`, verify the `consultz.com` domain (SPF/DKIM) and the sender in Brevo, restart, then run `npm run email:test`. Real Brevo delivery has not been tested; no credentials yet.

## 23. End-to-end test run (all rows)

> **23 Nov: the test files were removed from the repo** (`e2e/` and every `*.test.ts`), on request. `npm run test:e2e` and `npm test` no longer exist. This section records what the run checked on 22 Nov, before removal. The removed files are in git history only for `user.utils.test.ts`; the rest were never committed.

On 22 Nov, `npm run test:e2e` replayed every row in this log against the real HTTP API. It ran `e2e/run.js`, which:
1. starts a throwaway MongoDB replica set in Docker (`consultz-e2e-mongo`, port 27099);
2. boots `src/server.ts` with `NODE_ENV=production`, so OTPs only arrive by email or SMS and are never in the response;
3. runs `e2e/qa.e2e.test.ts`, then removes the container.

Outside services are faked in memory by `e2e/harness.ts`: SMTP, FCM, Twilio, Stripe and S3. Any other outbound `fetch` is blocked, and cron jobs are off. The tests read OTPs from the captured emails and SMS, the Stripe amount from the captured PaymentIntent, and so on. **The `.env` database is never used.** The suite drops the database it is given, so never point `E2E_MONGO_URL` at a real one.

**Result (22 Nov, before removal): 48/48 pass, no TODO.**

| Row | What the E2E run checks |
|---|---|
| #1 | Register emails the OTP, no OTP in the response, login 403 until verified, wrong OTP 400, verify, then login works |
| #2 | Register again with a corrected phone and the same referral code: 201, phone updated, referral kept |
| #4 | Same email in different case: 409 with the clear message |
| #5 / #6 | Under 18 (consultee and expert): 400 and no account; future date and wrong format rejected; exactly 18 accepted; admin list and detail show `dob`, other users don't see it |
| #12 | A number already used, typed with spaces: 409. An unverified sign-up doesn't block the number |
| #13 | Google user: `needsOnboarding`, booking 403, phone OTP by SMS, under-18 dob rejected, onboarding done, then booking 201 |
| #14 / #16 | One code, two new sign-ups: both linked. Same code applied again: 200 no-op. Sign-up without a code works |
| #15 | Old account deleted, new sign-up on the same phone, resend OTP finds the new record. A deleted email gets 404 |
| #18 | Forgot password emails the code. Reset without the OTP: 403. Reset with it works; reusing it: 403. SMTP failure: 400 "Error sending email" |
| #23 / #25 | Google and Apple: change-password 400 with the provider message; forgot-password 400 with `data.registerWith` and no email |
| #26 | Email change by OTP to the new address; old token rejected; new email logs in. Taken email 409, Google user 400. Phone change by SMS OTP; another account's number 409. update-profile can't change email or phone |
| #31 | Intro video upload, replace (old S3 file deleted), wrong type 400, remove |
| #32 | Profile price = booking price = Stripe amount. After a rate-only change, new bookings use the new price and old ones keep theirs. VAT expert: 100 + 20 % locked, still charged after de-registering |
| #38 | Expert books themselves: 400 |
| #65 | Typo email fixed from the OTP screen, OTP goes to the new address, same record kept. Taken email 409 |
| #67 | Email: admin changes it; both addresses notified; old session ends. 409 taken / 400 social / 403 admin / 401 non-admin. Phone: changed and verified, masked notice emailed, user stays logged in; 409 another account's number, same number 200 then 400, 403 admin, 401 non-admin |
| #68 | Report: admin notification saved and listed in `GET /notifications`, email to `ADMIN_NOTIFY_EMAIL` with escaped text, `pending_review`, reset on withdrawal. Still 200 when email and push fail |
| #70 | Warn from a post: email, in-app notification, warning recorded with post and admin. Push failure doesn't block the email. change-status warning twice: 2 emails, `warningCount: 2` |
| SEC | `?fields=password,verification,dob` on a public endpoint leaks nothing. update-profile ignores `role`, `status`, `points`, `isPhoneOtpVerified`, `referralCode`, `warningCount`, but saves `bio` and `isProfileSetup`. Payments: no token → 401 (checkout and confirm); another user's booking → 400; `account` in the body ignored; another user can't confirm (403); an intent from another booking → 400; the real confirm → `authorized`. No outbound call left the machine |

**Fixed during the E2E run:**
- **#70:** Warn User from a post saved the in-app notification **only when the push succeeded** (`sendNotification`). A user without an FCM token, or with a stale one, got nothing in the app. `sendContentModerationNotification` now uses `notifyUserInApp` (always saved, then socket, then push). This applies to every moderation notice. `notifyUserInApp` now sends the same iOS alert settings (`apns` badge and sound) as `sendNotification`.
- **#38:** implemented (section 22).

**Phase 0 (section 24):** the earlier TODO (update-profile could set `role: admin`) is fixed and now a normal passing test. Payment auth is covered too.

**Not covered by E2E:** real delivery through Gmail, FCM, Twilio and Stripe (all faked), socket events, cron jobs, and the app and dashboard screens.

## Verification (current, 23 Nov)

- `npx tsc --noEmit` and `npm run build`: pass.
- `npm run lint`: runs again, **0 errors** (654 warnings in older code, mostly `any` and `console`; they don't fail the run). See "Lint" below.
- **No automated tests in the repo.** The unit tests (70/70) and the E2E run (48/48) passed on 22 Nov and were then removed (section 23). Any later change has to be checked by hand (Postman/curl) or by adding tests back.
- **Never tested:** real delivery through Brevo/Gmail, FCM, Twilio and Stripe.

## Lint

ESLint 10 no longer reads `.eslintrc.json` / `.eslintignore`, and dropped `--ignore-path` / `--ext`, so `npm run lint` failed before any of these changes.
- New `eslint.config.mjs` (flat config) with the same rules as the old `.eslintrc.json`, which is deleted along with `.eslintignore`. Node globals; `no-undef` off (TypeScript checks names).
- `package.json`: `lint` is `eslint src`, `lint:fix` is `eslint src --fix`.
- Code fixes (no behavior change): `prefer-const` in 7 places; unused initial values removed (`let message: string`) in the notify helpers, `requiredFields` and `shouldAwardFirstPaidBookingBonus`; `role === 'admin' && await …` written as `if` in `auth.service.ts`.
- Downgraded to warnings: `@ts-ignore` comments (14 existing), `preserve-caught-error` (`new Error(msg, { cause })` needs an ES2022 lib; `tsconfig` targets es2016). `no-irregular-whitespace` skips comments (some old comments have broken encoding).

## Other files

- `package.json`: new `migrate:lowercase-emails`, `check:indexes` and `email:test` scripts. The `test` and `test:e2e` scripts were removed with the test files.
- `.env.example`: rewritten with every key the server reads (Brevo, Stripe, S3/Spaces, Twilio, Agora, Firebase, APNs, VAT lookup), placeholders only.

## Still open

- **Google/Apple token verification:** not done, by decision (22 Nov). `/auth/google` and `/auth/apple` still trust the email in the body.
- **#14 (ops):** run `npm run check:indexes` on QA's DB (see section 9).
- **Reporting a user (#68 follow-up):** not built, by decision (22 Nov).
- **Release together:** the app must send `Authorization` on checkout and confirm-payment (section 24), or payment fails with 401.

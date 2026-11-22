# Client QA fixes: short summary and frontend guide

- **Date:** 2026-11-22
- **Rows:** #1, 2, 4, 5, 6, 12, 13, 14, 15, 16, 18, 23, 25, 26, 32, 38, 65, 67, 68, 70
- **Full details:** [CLIENT_QA_ISSUES_CHANGES.md](CLIENT_QA_ISSUES_CHANGES.md)
- **Status:** the backend is done and passes the E2E run (`npm run test:e2e`, 48/48). Not deployed yet.

All paths are under `/api/v1`. `Authorization` takes the raw token, with no `Bearer` prefix. On an error, show the response `message` as it is. Where an error includes `data`, use it to decide which screen or button to show.

## Before release

- **`dob` must be `YYYY-MM-DD`** wherever it is sent. Any other format fails sign-up with a 400.
- **The sign-up OTP now goes by email, not SMS.** The OTP screen after register must use the email endpoints (see #1).
- **Payments now need login.** Send `Authorization` on `/payments/checkout` and `/payments/confirm-payment`, or they fail with 401. Release the app together with the backend (see "Payments").

---

## Sign-up

### #1 No email verification at sign-up
- **Backend:** register sends a 4-digit OTP to the email address. Login returns 403 "Your email is not verified…" until the user verifies it.
- **App:**
  - After `POST /users/register`, keep `data.otpToken.token` and show "Code sent to `{data.otpToken.email}`".
  - Verify with `POST /otp/verify-with-email`: header = that token, body `{ otp }`. The response includes `accessToken`.
  - Resend with `POST /otp/send-otp-in-email { email }`, which returns a new token.
  - **Don't** call `/otp/verify-with-phone` at sign-up.
  - On a login 403 "email is not verified", resend the code and open the OTP screen.

### #2 Wrong phone, go back: "Referral code already used"
- **Backend:** registering again with the same email (still unverified) continues the existing sign-up. The phone and other fields are updated, and the referral code is kept.
- **App:** going back and submitting register again is allowed. Nothing else to do.

### #4 Duplicate email shows a referral error
- **Backend:** returns 409 "An account with this email already exists. Please log in or reset your password." Emails are case-insensitive.
- **App:** on 409, show the message with **Log in** and **Forgot password** buttons.

### #5 / #6 Under-18 sign-up; admin can't see dob
- **Backend:** returns 400 for an age under 18, a date in the future, or a wrong format. This applies to every role, and no account is created. Admins now get `dob` in `GET /users` and `GET /users/:id`.
- **App:** use a date picker with a maximum date of today minus 18 years. Send `dob` as `YYYY-MM-DD`. Show the 400 message.
- **Dashboard:** add an Age / DOB column to the user list and user details.

### #12 Phone number already used by another account
- **Backend:** returns 409 "An account with this phone number already exists. Please log in instead." The number is compared after normalizing, so spaces and a `00` prefix don't matter.
- **App:** on 409, show the message and a **Log in** button. Send the phone in international format (`+44…`).

### #14 / #16 Referral code "already used"; sign-up blocked
- **Backend:** one code can be used by any number of people. A referral code is optional. Sending the same code twice is harmless.
- **App:** keep the referral field optional. Send the code **once**: either in the register body or in `PATCH /users/use-referral-code`.
- **Ops (#14):** on QA's server DB, run `npm run check:indexes`. If it flags anything, run `-- --drop`, then deploy.

### #15 Resend OTP says "User not found" after the old account was deleted
- **Backend:** resend finds the new sign-up, not the deleted record. If there is no sign-up in progress, it returns 404 "…Please start sign-up again."
- **App:** on the sign-up OTP screen, "Resend" calls `POST /otp/send-otp-in-email { email }`. On a 404, send the user back to the start of sign-up.

### #65 Typo in the sign-up email
- **Backend:** the email can be corrected from the OTP screen. The OTP responses include `email`.
- **App:**
  - On the OTP screen, show "Code sent to {email}" and a "Wrong email? Change" link.
  - The link calls `POST /otp/change-signup-email` with header = sign-up token and body `{ newEmail }`.
  - Keep the new `token` it returns and verify as usual.
  - Errors: 409 means the email is taken. 403 means the token expired: resend with the old email, then retry.
- **Settings (older users):** if `isEmailVerified === false` in my-profile, show a "Verify your email" banner. It uses the same change-email flow as #26.

---

## Google / Apple accounts

### #13 Google/Apple sign-up skipped phone, dob and terms
- **Backend:** the login response includes `data.user.needsOnboarding`. While it is `true`, booking returns 403. Existing Google/Apple users get this too.
- **App:** when `needsOnboarding` is true (after login, or from `GET /users/my-profile`), show onboarding:
  1. `POST /otp/send-otp-via-token-in-phone { phoneNumber }` with the access token. It returns `data.token`.
  2. `POST /otp/verify-with-phone { otp }` with header = that token.
  3. `PATCH /users/complete-onboarding { dob, termsAccepted: true }` with the access token. It returns `needsOnboarding: false`.
  - Steps 1–2 and step 3 can run in either order.

### #23 Change Password for Google/Apple users
- **Backend:** returns 400 "You sign in with Google/Apple. There's no separate Consultz password…"
- **App:** if `user.registerWith` is `google` or `apple`, Profile > Password shows **no form**. Show an info screen instead: "You sign in with Google/Apple", a pointer to Google Account / Apple ID settings, and **Back to profile**.

### #25 Forgot password for Google/Apple users
- **Backend:** `forget-password` (and `login` without a password) returns 400 "This email is linked to Google sign-in. Please sign in with Google instead." with `data.registerWith`. No email is sent.
- **App:** on a 400 where `data.registerWith` is `google` or `apple`, show the message and a **Sign in with Google/Apple** button.

---

## Account

### #18 Forgot password: "Error sending email", no code arrives
- **Backend:** email is now sent directly over SMTP (nodemailer). Reset only works after the OTP is verified, and the code can't be used twice.
- **App flow (no change, check that it's followed):**
  1. `POST /auth/forget-password { email }`, which returns `verifyToken`.
  2. `POST /otp/verify-with-email { otp }` with header = `verifyToken`.
  3. `POST /auth/reset-password { email, newPassword, confirmPassword }` with header = `verifyToken`.
- **Ops:** email is sent through Brevo. Production `.env` needs `BREVO_SMTP_LOGIN`, `BREVO_SMTP_KEY` (the SMTP key, not the API key) and `EMAIL_FROM_ADDRESS`. After a restart, the log should show "SMTP ready (brevo, …)". Check with `npm run email:test -- you@example.com`.

### #26 Change email or phone with verification
- **Backend:** email changes need an OTP sent to the new address. `update-profile` ignores `email` and `phoneNumber`.
- **App, email** (hide this for Google/Apple users):
  1. `POST /users/change-email/request { newEmail }`.
  2. OTP screen, then `POST /users/change-email/verify { otp }`.
  3. **Save the new `accessToken` and `refreshToken`.** The old tokens stop working.
  - Errors: 409 means the email is taken. 400 means a wrong OTP or a social account.
- **App, phone:** `POST /otp/send-otp-via-token-in-phone { phoneNumber }`, then `POST /otp/verify-with-phone { otp }` with the returned token. A 409 means another account owns the number.

### #67 Admin can't correct a user's email or phone
- **Backend, email:** new `PATCH /users/:id/email { email, reason? }`, admin only.
  - The new email is set as verified, and notices go to both the old and the new address.
  - Errors: 409 taken, 400 Google/Apple account, 403 admin account.
- **Backend, phone:** new `PATCH /users/:id/phone { phoneNumber, reason? }`, admin only.
  - The number is set as verified, and the user gets an email notice.
  - The user stays logged in.
  - Errors: 409 another account's number, 400 invalid or same number, 403 admin account.
- **Dashboard:** on User details, add "Edit" next to Email and next to Phone. Each opens a modal with the new value and an optional reason.
  - After an email change, show: "The user must log in again with the new email."
  - Send phone numbers in international format (`+44…`).

---

## Booking and price

### #32 Profile showed one price, booking charged another
- **Backend:** prices always come from `hourlyRate`. A rate change shows straight away. A booking locks `price`, `expertVat` and `totalAmount`, and payment charges `totalAmount`.
- **App:**
  - Show `sessionDurations[].offeredPrice` from the API. **Don't calculate prices in the app.**
  - At checkout, show `booking.price`, `booking.expertVat` and `booking.totalAmount`.
  - Refetch the profile after the expert saves a new rate.

### #38 An expert can book a session with themselves
- **Backend:** returns 400 "You can't book a session with yourself."
- **App:** hide the **Book** button on the expert's own profile.

---

### Payments (security fix)
- **Backend:** `POST /payments/checkout` and `POST /payments/confirm-payment` require login. The payer is taken from the token. Confirm checks that the payment intent belongs to this booking, this user and this amount.
- **App:**
  - Send the user's access token in `Authorization` on both calls.
  - The body needs only `{ booking }` for checkout and `{ booking, paymentIntentId }` for confirm. `account` and `user` are no longer needed; they are ignored if sent.
  - Errors: 401 no or expired token (log in again), 403 "This booking is not yours.", 400 "Payment does not match this booking." (start checkout again).

## Moderation (admin dashboard)

### #68 Reported post: no admin email or dashboard notification; Moderation Status blank
- **Backend:** for every report, each admin gets a saved notification (`GET /notifications`) and a socket event `notification::<adminId>`, and an email goes to `ADMIN_NOTIFY_EMAIL`. The post's `moderationStatus` becomes `pending_review`.
- **Dashboard:**
  - Add a notification bell from `GET /notifications`, plus the socket event. Clicking a notification opens the post (`reference` is the feed id).
  - Show `pending_review` as "Pending review", and add a filter `?moderationStatus=pending_review`.
- **Ops:** set `ADMIN_NOTIFY_EMAIL` in production `.env`.

### #70 "Warn User": no email; warning not recorded
- **Backend:** the user gets an in-app notification and an email (with the reason). This works without an FCM token and when the push fails. Each warning is recorded in `warnings[]`, `warningCount` and `lastWarnedAt`. `PATCH /users/change-status` with `status: 'warning'` also takes `reason`.
- **Dashboard:**
  - On User details, show "Warnings ({warningCount})" with a list: date, reason, and source (a post link or "Admin").
  - When Warning is chosen in change-status, show a **Reason** field.
- **App:** nothing to do. The notification arrives like any other.

---

## Also changed

- **update-profile (security):** `PUT /users/update-profile` now ignores `role`, `status`, `points`, verification flags, referral and VAT fields, and the like. Normal profile fields and `isProfileSetup` still work. If the app sends VAT fields here, move that to `PUT /users/vat-info`.

## Open (by decision)

- Google/Apple token verification: not done for now.
- Reporting a user: not built.
- #14: run `npm run check:indexes` on QA's server DB (ops).
- Not covered by tests: real Gmail, FCM, Twilio and Stripe delivery. The E2E run used fakes for these.

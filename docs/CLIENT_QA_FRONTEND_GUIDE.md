# Client QA fixes: frontend guide (app + dashboard)

- **Updated:** 2026-11-24
- **Backend:** done and pushed to `main`. Not deployed yet.
- **Full backend details:** [CLIENT_QA_ISSUES_CHANGES.md](CLIENT_QA_ISSUES_CHANGES.md)

**Rules for every call:**
- All paths are under `/api/v1`.
- `Authorization` takes the raw token, with no `Bearer` prefix.
- On an error, show the response `message` as it is.
- When an error includes `data`, use it to pick the next screen or button.

## 1. Must-do before release (app breaks without these)

| What | Why |
|---|---|
| Send `Authorization` on `POST /payments/checkout` and `POST /payments/confirm-payment` | Both return 401 without it. **Ship the app with this backend.** |
| Send `dob` as `YYYY-MM-DD` | Any other format fails sign-up with a 400 |
| Use the **email** OTP screen after register | The sign-up code now goes by email, not SMS |

## 2. App

### Sign-up
- **OTP (#1):**
  - After `POST /users/register`, keep `data.otpToken.token` and show "Code sent to {data.otpToken.email}".
  - Verify with `POST /otp/verify-with-email { otp }`, header = that token. The response includes `accessToken`.
  - Resend with `POST /otp/send-otp-in-email { email }`. It returns a new token.
  - Don't call `/otp/verify-with-phone` at sign-up.
- **Wrong email (#65):**
  - On the OTP screen, add a "Wrong email? Change" link.
  - The link calls `POST /otp/change-signup-email { newEmail }`, header = sign-up token.
  - Keep the new `token` it returns.
- **Back button (#2):** going back and submitting register again is allowed. The phone is updated and the referral is kept.
- **Date of birth (#5):** use a date picker with a maximum date of today minus 18 years.
- **Referral code (#14/#16):** optional, and one code works for everyone. Send it **once**, either in register or in `PATCH /users/use-referral-code`.
- **Phone:** send it in international format (`+44…`).

### Login
- **403 "email is not verified":** resend the code, then open the OTP screen.
- **400 with `data.registerWith` = `google` / `apple` (#25):** show the message and a **Sign in with Google/Apple** button. Forgot-password returns the same error.
- **`data.user.needsOnboarding === true` (#13, Google/Apple):** show onboarding. Booking returns 403 until it's done.
  1. `POST /otp/send-otp-via-token-in-phone { phoneNumber }` with the access token. It returns a token.
  2. `POST /otp/verify-with-phone { otp }`, header = that token.
  3. `PATCH /users/complete-onboarding { dob, termsAccepted: true }`.

### Profile and account
- **Password screen (#23):** if `registerWith` is `google` / `apple`, show no form, only an info screen ("You sign in with Google/Apple").
- **Change email (#26):** hide this for Google/Apple users.
  1. `POST /users/change-email/request { newEmail }`.
  2. `POST /users/change-email/verify { otp }`.
  3. **Save the new `accessToken` and `refreshToken`.** The old ones stop working.
- **Change phone (#26):** `send-otp-via-token-in-phone`, then `verify-with-phone`, the same as onboarding.
- **Banner:** if `isEmailVerified === false` in my-profile, show a "Verify your email" banner.
- **update-profile:** it now ignores `email`, `phoneNumber`, `role`, `points`, VAT fields and the like.
  - Send VAT details through `PUT /users/vat-info` instead.
  - Normal profile fields and `isProfileSetup` work as before.
- **Intro video (#31, experts):**
  - Upload: `PUT /users/intro-video` (multipart, field `video`). MP4, MOV or WebM, up to 50 MB. Check the 2-minute limit in the app.
  - Replace: upload again.
  - Remove: `DELETE /users/intro-video`.
  - The link is in `introVideoUrl` on the profile.

### Forgot password (#18): no change, just follow this order
1. `POST /auth/forget-password { email }`. It returns `verifyToken`.
2. `POST /otp/verify-with-email { otp }`, header = `verifyToken`.
3. `POST /auth/reset-password { email, newPassword, confirmPassword }`, header = `verifyToken`.

### Booking and payment
- **Prices (#32):**
  - Show `sessionDurations[].offeredPrice` from the API. **Never calculate prices in the app.**
  - At checkout, show `booking.price`, `booking.expertVat` and `booking.totalAmount`.
  - Refetch the profile after the expert saves a new rate.
- **Own profile (#38):** hide the **Book** button on the expert's own profile.
- **Payment body:**
  - Checkout: `{ booking }`.
  - Confirm: `{ booking, paymentIntentId }`.
  - `account` and `user` are no longer needed.

## 3. Dashboard (admin)

| Screen | What to add |
|---|---|
| User list + details (#6) | Age / DOB column (`dob`) |
| User details (#67) | **Edit** next to Email and next to Phone. Each opens a modal with the new value and an optional reason. |
| User details (#70) | "Warnings ({warningCount})" with a list from `warnings[]`: date, reason, and source (a post link or "Admin") |
| Change status (#70) | When **Warning** is chosen, show a **Reason** field and send it as `reason` |
| Header (#68) | Notification bell from `GET /notifications`, plus socket `notification::<adminId>`. Clicking one opens the post (`reference` = feed id). |
| Posts (#68) | Show `pending_review` as "Pending review". Add a filter `?moderationStatus=pending_review`. |

**Edit endpoints (#67):**
- Email: `PATCH /users/:id/email { email, reason? }`.
  - After saving, show: "The user must log in again with the new email."
- Phone: `PATCH /users/:id/phone { phoneNumber, reason? }`. The user stays logged in.

## 4. Errors to handle

| Status | Message / case | Show |
|---|---|---|
| 409 | Email already exists (#4) | Message + **Log in** + **Forgot password** |
| 409 | Phone already exists (#12) | Message + **Log in** |
| 409 | Email or phone taken (change email, admin edit) | Message |
| 400 | Under 18, future or invalid `dob` | Message on the date field |
| 400 | `data.registerWith` is `google` / `apple` | **Sign in with Google/Apple** button |
| 400 | "You can't book a session with yourself." | Message |
| 400 | "Payment does not match this booking." | Start checkout again |
| 401 | Payment without a token, or an expired token | Log in again |
| 403 | "Your email is not verified…" | Resend the code, then the OTP screen |
| 403 | Booking while `needsOnboarding` | Open onboarding |
| 403 | "This booking is not yours." | Message |
| 403 | Expired sign-up token on change-email | Resend with the old email, then retry |
| 404 | Resend OTP: "…start sign-up again" (#15) | Back to the start of sign-up |
| 413 | Intro video over 50 MB | Message (`data.maxSizeMB`) |

## Not in this release

- "Report a user": not built.
- Google/Apple sign-in works as before; the backend does not verify the token yet.

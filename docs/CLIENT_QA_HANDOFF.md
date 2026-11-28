# Client QA — Team Handoff (28 Nov 2026)

Follow-up to the client's "Failed Issues" tab (9 rows still `failed`: #12, 13, 14, 15, 18, 32, 67, 68, 70). The backend work for all of them is on `main` (commit `3bf63d0` or later). What is left is deployment, server settings, admin dashboard screens and app changes. Background for each row is in [CLIENT_QA_ISSUES_CHANGES.md](CLIENT_QA_ISSUES_CHANGES.md).

Rules for every call:
- Base URL: `/api/v1`.
- `Authorization` header is the **raw access token, with no `Bearer ` prefix**.
- Every response has the shape `{ success, statusCode, message, meta?, data }`. On an error, show `message` as it is.

---

## 1. Admin dashboard developer (#67, #68, #70)

All endpoints below need an **admin** token.

### #67 — Edit a user's email and phone

Screen: User details → "Edit" next to Email and next to Phone → modal with the new value and an optional reason.

**`PATCH /users/:id/email`**

```json
{ "email": "jon@gmail.com", "reason": "Typo at sign-up" }
```
- `email` is required. `reason` is optional, up to 300 characters.
- 200:
```json
{ "success": true, "statusCode": 200, "message": "User email updated. They need to log in again with the new email.", "data": { "_id": "665f…", "email": "jon@gmail.com", "isEmailVerified": true } }
```

| Status | When |
|---|---|
| 400 | Google/Apple account, the same email, or an invalid email |
| 403 | The target user is an admin |
| 404 | User not found or deleted |
| 409 | "This email is already in use." |

After success, tell the admin: "The user must log in again with the new email. Their password hasn't changed." Both the old and the new address get a notice email.

**`PATCH /users/:id/phone`**

```json
{ "phoneNumber": "+447700900123", "reason": "Wrong number at sign-up" }
```
- `phoneNumber` is required, in international format, with 6–15 digits. Spaces, dashes, brackets and a `00` prefix are accepted and removed; letters are rejected. `reason` is optional, up to 300 characters.
- 200: message "User phone number updated.", `data` is `{ "_id": "665f…", "phoneNumber": "+447700900123", "isPhoneOtpVerified": true }`

| Status | When |
|---|---|
| 400 | Invalid number, or the same number and it is already verified |
| 403 | The target user is an admin |
| 404 | User not found |
| 409 | "An account with this phone number already exists. Please log in instead." |

The user stays logged in and gets a notice email.

### #68 — Notification bell and "Pending review" label

**Bell: `GET /notifications`** (supports `?page=1&limit=10&sort=-createdAt`)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Notifications retrieved successfully!",
  "meta": { "page": 1, "limit": 10, "total": 3, "totalPage": 1 },
  "data": {
    "unreadMessage": 2,
    "notifications": [
      {
        "_id": "66a1…",
        "message": "New report on a post",
        "description": "…reporter, reason and post excerpt…",
        "modelType": "Feed",
        "reference": "669c…",
        "read": false,
        "date": "2026-11-28T10:21:00.000Z",
        "createdAt": "2026-11-28T10:21:00.000Z"
      }
    ]
  }
}
```
- Badge count: `data.unreadMessage`.
- Click on a report notification (`modelType: "Feed"`): open the post with id `reference`.
- Mark all as read: `PATCH /notifications` (no body).
- Delete one: `DELETE /notifications/:id`. Delete all: `DELETE /notifications/my-notifications`.

**Real time:** connect to Socket.IO with the admin token and listen for the event `notification::<adminUserId>`. The payload is one notification object with the same fields as above (plus `receiver`). On the event, add it to the list and increase the badge.

**Moderation Status:** `moderationStatus` on a post now has these values:

| Value | Label to show |
|---|---|
| `null` | — (never reported) |
| `pending_review` | **Pending review** (new: reported, no admin action yet) |
| `restrict` | Restricted |
| `activate` | Active / Reinstated |
| `remove` | Removed |
| `warn_user` | User warned |
| `suspend_user` | User suspended |

- Filter for the posts list: `GET /feeds?moderationStatus=pending_review`.
- Admin action is unchanged: `PATCH /feeds/:id/moderation` with `{ "moderationStatus": "restrict" | "activate" | "remove" | "warn_user" | "suspend_user", "reason": "…" }`. `reason` is required. `pending_review` is **not** accepted here; it is set only by the backend when a post is reported.

### #70 — Warning history

**User details: `GET /users/:id`** now returns for admins:

```json
{
  "warningCount": 2,
  "lastWarnedAt": "2026-11-28T10:30:00.000Z",
  "warnings": [
    { "reason": "Abusive language", "source": "post", "feed": "669c…", "issuedBy": "6650…", "createdAt": "2026-11-27T09:00:00.000Z" },
    { "reason": "Repeated spam", "source": "admin", "feed": null, "issuedBy": "6650…", "createdAt": "2026-11-28T10:30:00.000Z" }
  ]
}
```
- Show a section "Warnings ({warningCount})" with a list: date, reason, and source. For `source: "post"` link to the post (`feed`). For `source: "admin"` show "Admin".
- The users list (`GET /users`) returns `warningCount` and `lastWarnedAt` for an optional column.

**Warn from the status menu: `PATCH /users/change-status`**

```json
{ "userId": "665f…", "status": "warning", "reason": "Repeated spam" }
```
- Add a reason field when the admin picks Warning. `reason` is optional, up to 500 characters, and is shown to the user in the app notification and the email.

**Warn from a reported post:** `PATCH /feeds/:id/moderation` with `{ "moderationStatus": "warn_user", "reason": "…" }`. This also records the warning and emails the user.

---

## 2. DevOps / QA deployment checklist

Run these on the QA server (and later production), in order.

1. **Check the build.**
   ```bash
   git fetch && git log -1 --oneline        # must be 3bf63d0 or later on main
   git merge-base --is-ancestor 3bf63d0 HEAD && echo "QA fixes are in this build"
   npm ci && npm run build
   ```
2. **Set the environment variables** in `.env`:

   | Variable | Value | Needed for |
   |---|---|---|
   | `BREVO_SMTP_LOGIN` | Brevo SMTP login (`…@smtp-brevo.com`) | #18, #68, #70 and every other email |
   | `BREVO_SMTP_KEY` | Brevo **SMTP** key (`xsmtpsib-…`, not the API key `xkeysib-…`) | same |
   | `EMAIL_FROM_ADDRESS` | A sender verified in Brevo (e.g. `support@consultz.com`) | same |
   | `EMAIL_FROM_NAME` | `Consultz` (optional) | same |
   | `ADMIN_NOTIFY_EMAIL` | Moderation inbox; comma-separated for several | #68 |

   In Brevo, the `consultz.com` domain (SPF/DKIM) and the sender must be verified.
3. **Check the database indexes (#14).**
   ```bash
   npm run check:indexes              # report only
   npm run check:indexes -- --drop    # only if it flags a unique index on a referral field
   ```
4. **Normalize stored phone numbers (#12).**
   ```bash
   npm run migrate:normalize-phones             # dry run: lists what would change
   npm run migrate:normalize-phones -- --apply  # write
   ```
   Safe to run again. It also lists numbers that two verified accounts share and numbers without a country code. Those are not changed; pass the list to the backend team.
5. **New indexes (load test, 28 Nov).** The first start of the new build creates indexes on `users`, `bookings`, `follows`, `profileviews` and `withdraws` (list in [load_test.md](load_test.md)). That takes seconds at current sizes. On a large DB, create them before deploying.
6. **Restart, then check email.**
   ```bash
   npm run start:prod                           # or restart the process manager
   # the log must show: SMTP ready (brevo, smtp-relay.brevo.com:587, from …)
   npm run email:test -- qa-inbox@example.com   # sends one real email
   ```
7. **Release the app with the backend.** Payment endpoints now need the `Authorization` header. An old app build gets 401 on checkout.

**QA re-test after the steps above** (backend only, no app change needed): #14 (same referral code on two new emails), #18 (forgot-password email arrives), #68 (report a post: admin email arrives), #70 (Warn User: email arrives). Rows #12, #13, #15 and #32 also need the app changes below. Rows #67, #68 (bell) and #70 (history) also need the dashboard changes in section 1.

---

## 3. App developer: remaining API contracts (#12, #13, #15, #32)

### #12 — Duplicate phone number
- Send phone numbers in international format: `+447700163907`. The backend accepts and removes spaces, dashes and brackets, and turns a `00` prefix into `+`, but it can't add a missing country code. Validation counts digits (6–15), so `+44 7700 163 907` is valid. Letters or too few/many digits → 400.
- `POST /users/register` returns **409** "An account with this phone number already exists. Please log in instead." Show the message with a "Log in" button.
- The same 409 can come from `POST /otp/send-otp-via-token-in-phone` and `POST /otp/verify-with-phone`.

### #13 — Google/Apple onboarding
After a social login, or from `GET /users/my-profile`, read `data.user.needsOnboarding`. While it is `true`, show the onboarding flow. Booking returns 403 until it is finished.

| Step | Call | Header | Body | Result |
|---|---|---|---|---|
| 1 | `POST /otp/send-otp-via-token-in-phone` | access token | `{ "phoneNumber": "+44…" }` | `data.token` (OTP token) |
| 2 | `POST /otp/verify-with-phone` | OTP token from step 1 | `{ "otp": "1234" }` (always 4 digits) | phone saved and verified |
| 3 | `PATCH /users/complete-onboarding` | access token | `{ "dob": "YYYY-MM-DD", "termsAccepted": true }` | `data.needsOnboarding: false` |

- Under 18 → 400. Phone already used → 409.
- Steps 1–2 and step 3 can be done in either order.

### #15 — Resend OTP during sign-up
- The sign-up OTP now goes by **email**. "Resend" must call `POST /otp/send-otp-in-email` with `{ "email": "…" }`. Store the new token from the response.
- **404** "…Please start sign-up again." → send the user back to the first sign-up screen. This happens when the unfinished sign-up has expired (60 minutes) or was deleted.
- Don't call the phone OTP endpoints from the sign-up screens.

### #32 — Expert price
- Show `sessionDurations[].offeredPrice` (same value as `sessionDurations[].price`) from the API. Remove every price calculation in the app.
- On checkout, show `booking.price`, `booking.expertVat` and `booking.totalAmount`. `totalAmount` is exactly what Stripe charges.
- After an expert saves a new hourly rate, refetch the profile.
- An existing booking keeps its price when the rate changes later.

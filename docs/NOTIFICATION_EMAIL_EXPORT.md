# Notification and Email List

Short client-review version. Most push notifications are also saved as in-app notifications when delivery succeeds.

## Booking

- New booking request
  - Trigger: client pays and booking becomes pending.
  - Channel: push/in-app + email.
  - Receiver: consultant.
  - Wording: `Booking Request` -- `{SessionType} session requested by {clientName} on {sessionInfo}`.
  - Email subject: `New Booking Request Received`.

- Payment success
  - Trigger: client payment is confirmed.
  - Channel: email.
  - Receiver: client.
  - Email subject: `Payment Successful - Booking Pending Approval`.
  - Wording: payment processed; booking is pending consultant approval.

- Pending booking reminder
  - Trigger: consultant has not accepted yet; repeats around every 10 minutes.
  - Channel: push/in-app.
  - Receiver: consultant.
  - Wording: `Booking Request Reminder` -- `Reminder: {SessionType} session requested by {clientName} on {sessionInfo}`.

- Booking confirmed
  - Trigger: consultant accepts booking.
  - Channel: push/in-app.
  - Receiver: client.
  - Wording: `Booking Confirmed!` -- `{SessionType} session with {consultantName} on {sessionInfo}`.

- Booking declined
  - Trigger: consultant declines booking.
  - Channel: push/in-app + email.
  - Receiver: client and consultant.
  - Wording: `Booking Declined` / `Booking Cancelled`.

- Booking cancelled
  - Trigger: client or consultant cancels booking.
  - Channel: push/in-app + email.
  - Receiver: client and consultant.
  - Wording: clearly says who cancelled: client or consultant.
  - Email subject: `Booking Cancelled`.

- Booking rescheduled
  - Trigger: booking time is changed.
  - Channel: push/in-app + email.
  - Receiver: client and consultant.
  - Wording: `Booking Rescheduled` -- session rescheduled to `{sessionInfo}`.
  - Email subject: `Booking Rescheduled`.

- Schedule change requested
  - Trigger: consultant asks client to reschedule.
  - Channel: push/in-app + email.
  - Receiver: client.
  - Wording: `Schedule Change Requested` -- consultant requested reschedule for `{sessionInfo}`.

- Booking not responded
  - Trigger: booking expires or session is not completed because consultant did not respond.
  - Channel: push/in-app + email.
  - Receiver: client and consultant.
  - Client email subjects:
    - `Your Booking Has Been Cancelled - Full Refund Initiated`
    - `Your Booking Has Been Cancelled - Refund Processing Update`
  - Wording: booking cancelled because consultant did not respond; refund status explained.

- Session completed
  - Trigger: session is marked completed.
  - Channel: push/in-app + email.
  - Receiver: client gets points notification; consultant gets payment-processing notification/email.
  - Consultant email subject: `Session Completed - Payment Processing`.

## Session reminders

- 10-minute reminder
  - Trigger: 10 minutes before session.
  - Channel: push/in-app + email.
  - Receiver: client and consultant.
  - Push title: `10 Minutes to Go`.
  - Email subject: `Session Starting in 10 Minutes`.

- Call is live / join now
  - Trigger: session start time.
  - Channel: push/in-app + email.
  - Receiver: client and consultant.
  - Push title: `This Session is LIVE`.
  - Email subject: `Join Your Session Now`.

## Calling

- Incoming call
  - Trigger: one user starts a call.
  - Channel: push/in-app.
  - Receiver: other participant.
  - Wording: `Incoming Video Call` or `Incoming Voice Call` -- `{callerName} is calling you`.

- Call ended
  - Trigger: call ends.
  - Channel: push/in-app.
  - Receiver: caller and receiver.
  - Wording: `Call Ended` -- call duration shown.

## Payment and withdrawal

- First consultation booked
  - Trigger: first paid booking.
  - Channel: push/in-app.
  - Receiver: client.
  - Wording: `First Consultation Booked!` -- 300 points earned.

- Stripe/payment method connected
  - Trigger: Stripe account connected first time.
  - Channel: push/in-app.
  - Receiver: user.
  - Wording: `Payment Method Added!` -- 200 points earned.

- Withdrawal on hold
  - Trigger: withdrawal cannot be transferred because Stripe is not connected.
  - Channel: push/in-app + email.
  - Receiver: consultant.
  - Push title: `Action Required: Connect Your Stripe Account`.
  - Email subject: `Withdrawal On Hold - Stripe Connection Required`.

- Withdrawal completed
  - Trigger: transfer succeeds.
  - Channel: push/in-app + email.
  - Receiver: consultant.
  - Push title: `Withdrawal Completed`.
  - Email subject: `Withdrawal Completed - Funds Transferred`.

## Reviews

- Review reminder
  - Trigger: completed session, user has not reviewed yet.
  - Channel: push/in-app.
  - Receiver: client.
  - Wording: `Leave a review for {consultantName}` -- `How was your experience?`

- New review received
  - Trigger: client submits review.
  - Channel: push/in-app.
  - Receiver: consultant.
  - Wording: `New review!` -- `{clientName} left you a {rating}-star review`.

- Review rewards
  - Trigger: 5-star review, high rating streak, or verified review submitted.
  - Channel: push/in-app.
  - Receiver: consultant or reviewer.
  - Wording: points earned messages.

## User account and profile

- Expert account pending approval(previous flow)
  - Trigger: expert completes verification and remains pending.
  - Channel: email.
  - Receiver: expert.
  - Email subject: `Your Consultz Account Has Been Pending Approval`.

- Expert account approved
  - Trigger: admin activates pending expert.
  - Channel: push/in-app.
  - Receiver: expert.
  - Wording: `Expert Account Approved!` -- 300 points earned.

- Account blocked/reactivated
  - Trigger: admin changes user status.
  - Channel: push/in-app to admin + email to user.
  - Receiver: admin and user.
  - Email subjects:
    - `Your Consultz Account Has Been Blocked`
    - `Your Consultz Account Has Been Reactivated`

- Profile completed
  - Trigger: user completes required profile fields.
  - Channel: push/in-app.
  - Receiver: user.
  - Wording: `Profile Completed!` -- points earned.

- Availability updated
  - Trigger: expert updates availability.
  - Channel: push/in-app.
  - Receiver: expert.
  - Wording: `Availability Updated` -- new booking times generated dynamically.

## OTP and password

- OTP email
  - Trigger: OTP send/resend or forgot password.
  - Channel: email.
  - Receiver: user.
  - Email subject: `Your One-Time OTP`.

- Admin password notification
  - Trigger: admin password changed/reset.
  - Channel: push/in-app.
  - Receiver: admin.
  - Wording: password changed/reset message.

## Support and feedback

- Support request submitted
  - Trigger: user submits support request.
  - Channel: email.
  - Receiver: support inbox and submitter.
  - Support inbox subject: `[{referenceId}] Support Request: {subject}`.
  - User acknowledgement subject: `We received your support request -- {referenceId}`.

- App feedback submitted
  - Trigger: user submits app feedback.
  - Channel: email.
  - Receiver: support inbox and submitter.
  - Support inbox subject: `[{priority}] {feedbackType} -- {subject}`.
  - User acknowledgement subject: `We received your feedback -- {referenceId}`.

## Social and feed

- New follower
  - Trigger: user follows another user.
  - Channel: push/in-app after 10-minute batching.
  - Receiver: followed user.
  - Wording: `New Follower` or `You have {count} new followers!`

- New feed post
  - Trigger: expert/user publishes post.
  - Channel: push/in-app.
  - Receiver: followers.
  - Wording: `{authorName} has posted a new update!`

- Feed active/restricted
  - Trigger: admin changes feed status.
  - Channel: push/in-app.
  - Receiver: feed author.
  - Wording: post is live or restricted.

## Expert rewards

- Fast response reward
  - Trigger: weekly job, expert responds quickly to booking requests.
  - Channel: push/in-app.
  - Receiver: consultant.
  - Wording: `Fast Response Reward!` -- 50 points earned.

- Reliability reward
  - Trigger: 30-day no-show check.
  - Channel: push/in-app.
  - Receiver: consultant.
  - Wording: `Reliability Bonus Awarded!` -- 300 points earned.

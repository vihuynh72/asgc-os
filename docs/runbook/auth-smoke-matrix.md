# Auth Smoke Matrix

Use this checklist after auth-flow changes that affect login, password setup, password reset, or Office Hours routing.

## Preconditions

- Use a real Supabase-backed environment with email delivery working.
- Have one member account with an existing password.
- Have one member account without `password_ready_at`.
- Have one member account eligible for password reset.
- Have one non-admin member account with MFA enabled for MFA recovery validation.

## Scenarios

### Returning member, trusted browser

1. Sign in with campus email and password on a trusted browser.
2. Confirm there is no email code prompt.
3. Confirm the member lands on the requested safe target.

### Returning member, untrusted browser

1. Clear trusted-device state or use a fresh browser profile.
2. Sign in with campus email and password.
3. Confirm the browser verification code step appears.
4. Enter the emailed code.
5. Confirm the member lands on the requested safe target.

### First-time member

1. Start from `/login` with a safe `redirectTo`.
2. Use the first-time sign-in path.
3. Enter the emailed six-digit code.
4. Confirm the user is routed to `/password/setup?mode=first_time`.
5. Create a password.
6. Confirm the member lands on the original safe target without looping.

### Password reset from normal app target

1. Start from `/login?redirectTo=/dashboard`.
2. Request a password reset email.
3. Open the recovery link from email.
4. Confirm the user lands on `/password/setup?mode=reset`.
5. Save a new password.
6. Confirm the member lands on `/dashboard`.

### Password reset from Office Hours target

1. Start from `/login?redirectTo=/office-hours/kiosk`.
2. Request a password reset email.
3. Open the recovery link from email.
4. Confirm the user lands on `/password/setup?mode=reset&redirectTo=/office-hours/kiosk`.
5. Save a new password.
6. Confirm the member lands on `/office-hours/kiosk` without redirect loops.

### MFA recovery isolation

1. Trigger MFA recovery for a non-admin member account.
2. Open the recovery link from email.
3. Confirm the user lands on `/mfa/recover`, not `/password/setup`.
4. Confirm ordinary password reset links still land on `/password/setup`.

### Signed-in account password change

1. Sign in to `/account`.
2. Use the password change panel.
3. Confirm success messaging is specific and non-generic.
4. Sign out and sign back in with the new password.

### Expired or missing setup session

1. Reach `/password/setup` through first-time or reset flow.
2. Expire the session or clear auth cookies before submitting.
3. Submit a new password.
4. Confirm the user is routed back to `/login?error=password_setup_session_expired&redirectTo=<final target>`.
5. Confirm the login page shows the recovery message and the user can restart the correct flow.

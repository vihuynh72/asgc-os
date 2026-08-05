# Office Hours Specification
Status: Historical module specification. Current code, tests, and applied migrations take precedence.

## 0) Goal
Make office hours tracking accurate, low-friction, and hard to fake, while collecting minimal location data.

## 1) User experience (mobile-first)
Check-in:
- Open “Office Hours” page
- Tap “Check In”
- Allow location permission
- Confirm “Checked in” + timer starts

Check-out:
- Tap “Check Out”
- Location permission (again)
- Confirm session duration + weekly total shown

## 2) Presence validation
Geofence:
- Use office_locations(lat/lon/radius/grace_radius)
- Compute distance meters client-side (display) AND server-side (authoritative)

Rules:
- distance <= radius: allow
- radius < distance <= grace_radius: allow but mark “needs_review”
- distance > grace_radius: block

Ongoing presence:
- While checked in, periodically re-check location (every 10 minutes)
- If outside the office geofence, automatically check out
- If location cannot be verified for 60 minutes, automatically check out (Hobby-friendly)

## 3) Sessions
- Only 1 open session at a time per user
- Max open duration: [[MAX_SESSION_HOURS]] (default 8)
- If a user forgets to check out:
  - reminder at 2h
  - auto-close at max duration with status=auto_closed
  - notify user

## 4) Shifts (recommended, but can be introduced after MVP)
- Members can be assigned weekly shifts (coverage planning)
- A shift is “missed” if user not checked in by [[SHIFT_GRACE_MIN]] minutes
- Missed shift triggers reminder + suggests coverage request

## 5) Coverage workflow
- User requests coverage for a shift/time range
- Eligible members notified (same role or committee, configurable)
- First claimant locks the request
- Coverage noted in shift record

## 6) Weekly compliance logic
Compute per user per week:
- total_minutes = sum(closed sessions) + approved exceptions
- in_office_minutes = sum(sessions within radius) + approved exceptions tagged in_office
Compare vs office_hour_requirements for the user’s primary role (term-aware).

Outputs:
- compliant yes/no
- total deficit minutes
- in-office deficit minutes
- notes: missed shifts, auto-closed sessions, grace-range sessions

## 7) Notifications (email-first)
Types:
- Shift starts soon (T-30)
- Late to shift (T+15)
- Open session reminder (2h)
- Auto-closed session notice
- Mid-week “you’re behind” nudge (Wed/Thu)
- End-of-week summary (Sun)
- President/Advisor weekly digest (Mon morning)

Rules:
- Respect quiet hours
- Provide a direct link to fix (check in, request coverage, view timesheet)

## 8) Admin tools (President/Advisor)
- Live list: “Currently checked in”
- Disputed sessions queue (grace-range or suspicious patterns)
- Admin-close session (requires reason)
- Void a session (requires reason; never deletes record, only marks invalid)
- Weekly export CSV/PDF
- Config editor: office location + radii + requirements + reminder timings

## 9) Edge cases (must be handled)
- Location permission denied → block check-in (show clear instructions)
- Weak signal in office → allow cached UI state, but server must confirm geofence server-side
- Timezone/DST → store timestamptz, render in office timezone
- Role changes mid-week → requirement selection must be term/effective-date aware
- Check-out far away → mark disputed (not auto-invalid)

## 10) Acceptance tests (plain language)
A) Check-in
A1. In radius → open session created, audit logged
A2. Outside grace radius → blocked with clear error
A4. Already has open session → blocked

B) Check-out
B1. Open session → session closed, duration computed
B2. No open session → blocked
B3. Checkout far away → session closed but flagged needs_review

C) Auto-close
C1. Open > max duration → auto-closed, notified, audit logged
C2. Reminder at 2h open → notification_log written

D) Weekly compliance
D1. Totals include approved exceptions
D2. Correct deficits shown for total + in-office
D3. Weekly digest lists all users with deficits

E) Permissions
E1. Member cannot read another member’s sessions
E2. President/Advisor can read all sessions
E3. Admin-close/void creates audit_log entry

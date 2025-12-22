# Phase 30-40 Demo + Acceptance Checklists

## Phase 30 — Agenda builder v1
Demo checklist:
- Generate agenda PDF for a meeting with accepted items.
- Download agenda from the meeting docs panel.

Acceptance checks:
- Only admins can generate agenda PDFs.
- Generated PDF is stored as a doc with `doc_type=agenda`.
- Agenda PDF appears in meeting docs list.

## Phase 31 — Budget lines v1
Demo checklist:
- Create a budget line (fiscal year, category, amount).
- Archive a budget line and confirm it disappears from active views.

Acceptance checks:
- Executives can view budget lines.
- Finance admins can create/update/archive budget lines.
- RLS denies budget line access for non-finance users.

## Phase 32 — Funding request intake
Demo checklist:
- Create a draft funding request with a breakdown.
- Attach a doc to the funding request.

Acceptance checks:
- Breakdown JSON validates and totals match amount requested.
- Requestor can view and edit drafts.
- Executives can view all requests.

## Phase 33 — Threshold routing + state machine
Demo checklist:
- Submit a funding request and verify `needs_board_action`.
- Transition request state as finance admin.

Acceptance checks:
- State transitions enforce allowed order.
- Threshold uses `config_finance.board_action_threshold`.
- Audit log entries are created for state changes.

## Phase 34 — Vote capture v1
Demo checklist:
- Record a board vote linked to a funding request.
- Verify request status updates based on vote result.

Acceptance checks:
- Board members can record votes.
- Funding requests in `scheduled_for_vote` only accept votes.
- Vote records are visible to executives and requestors.

## Phase 35 — Expense logging v1
Demo checklist:
- Log an expense tied to a budget line and request.
- Attach a receipt doc and download it.

Acceptance checks:
- Only finance admins can create/update expenses.
- Receipts are stored as restricted docs.
- Audit log entries are created for expense edits.

## Phase 36 — Budget burn-down
Demo checklist:
- View burn-down table for a fiscal year.

Acceptance checks:
- Burn-down view sums approved/paid expenses only.
- Executives can view burn-down data.

## Phase 37 — Grant cycle v1
Demo checklist:
- Create a grant cycle with open/close dates and max amount.

Acceptance checks:
- Only finance admins can manage cycles.
- Grant cycles are readable by executives.

## Phase 38 — Grant intake
Demo checklist:
- Create and submit a grant application with a doc + breakdown.
- Review and approve a submitted application.

Acceptance checks:
- Grant max is enforced on submit.
- Only finance admins can approve/deny.
- Doc type for applications is `grant_application`.

## Phase 39 — Service contract lead-time warnings
Demo checklist:
- Mark a request as requiring contract with an event date.
- Verify warning flag toggles near the lead time threshold.

Acceptance checks:
- Warnings use `config_finance.lead_time_days`.
- Warning flag updates on request changes.

## Phase 40 — Finance dashboard exports
Demo checklist:
- Generate monthly export (PDF + CSV).
- Download both exports from Finance page.

Acceptance checks:
- Exports are restricted docs with `doc_type=finance_export`.
- Only executives can generate/download exports.

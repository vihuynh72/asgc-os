# 02_data_model.md
Status: DRAFT / Internal schema + rules mapping (Postgres/Supabase)

## 0) Data model goals
- Every operational record ties back to: person, term, committee, meeting, or finance request
- Auditability is built-in (audit_log)
- Policies are configurable (requirements, deadlines, thresholds)

## 1) Core entities (tables)
IDENTITY
- profiles(id, display_name, email, phone?, status, created_at)
- terms(id, name, start_date, end_date, is_current)
- roles(role_key pk, description)
- role_assignments(id, user_id, role_key, term_id, starts_at, ends_at, is_primary)

COMMITTEES
- committees(id, name, type, chair_user_id, advisor_user_id?, active)
- committee_memberships(id, committee_id, user_id, role_in_committee, starts_at, ends_at)

TASKS/PROJECTS
- projects(id, name, committee_id?, status, start_date?, end_date?, created_by)
- tasks(id, title, description, status, priority, due_at?, assigned_to?, project_id?, committee_id?, created_by, created_at, updated_at)
- task_comments(id, task_id, user_id, body, created_at)

MEETINGS & AGENDA/MINUTES
- meetings(id, meeting_type, title, starts_at, ends_at?, location, status, created_by)
- agenda_items(id, meeting_id, submitted_by, submitted_at, title, category, background, recommended_motion?, fiscal_impact?, attachments_json, state)
- docs(id, doc_type, title, storage_path, mime_type, size_bytes, uploaded_by, uploaded_at, committee_id?, meeting_id?, visibility, version_of_doc_id?, checksum_sha256?)
- doc_summaries(id, doc_id, summary_text, status(draft/approved/rejected), created_by, model_info_json, created_at)
- suggested_tasks(id, source_doc_id, proposed_title, proposed_description, proposed_assignee?, status(draft/approved/rejected), created_at)

OFFICE HOURS
- office_locations(id, name, lat, lon, radius_m, grace_radius_m, timezone, active)
- office_hour_requirements(id, role_key, weekly_total_hours, weekly_in_office_hours, committee_hours_cap?, effective_start, effective_end)
- presence_tokens(id, office_location_id, token_type, token_value_hash, valid_from, valid_to, created_by)
- office_hour_shift(id, user_id, office_location_id, starts_at, ends_at, status, covered_by_user_id?, notes?)
- office_hour_session(id, user_id, office_location_id, checkin_at, checkout_at?, duration_minutes?, checkin_method, distance_m_at_checkin, distance_m_at_checkout?, status, device_info_json, created_at)
- office_hour_exceptions(id, user_id, week_start_date, type, minutes, approved_by, reason, created_at)
- coverage_requests(id, requestor_user_id, shift_id?, starts_at, ends_at, reason, status, claimed_by_user_id?)

FINANCE
- budget_lines(id, fiscal_year, name, category, allocated_amount, notes?)
- funding_requests(id, requestor_user_id, committee_id?, title, purpose, amount_requested, breakdown_json, needs_board_action, state, submitted_at)
- board_votes(id, meeting_id, funding_request_id?, motion_text, moved_by, seconded_by, vote_yes, vote_no, vote_abstain, result, notes?, created_at)
- expenses(id, funding_request_id?, budget_line_id, payee, description, amount, purchased_at, receipt_doc_id?, status, entered_by, created_at)

GRANTS
- grant_cycles(id, name, opens_at, closes_at, max_amount, board_meeting_target_id?)
- grant_applications(id, cycle_id, applicant_type, club_id?, title, event_date?, amount_requested, breakdown_json, advisor_approved, doc_id, state, created_at)

CLUBS / ICC (optional module)
- clubs(id, name, status, advisor_name, advisor_email, constitution_doc_id?, members_count, benefit_card_count?, last_charter_at?)
- icc_meetings(id, starts_at, location, called_to_order_at?)
- icc_attendance(id, icc_meeting_id, club_id, present_at_call_to_order, notes?)

AUDIT / NOTIFICATIONS
- audit_log(id, actor_user_id?, action_key, target_type, target_id, metadata_json, created_at)
- notification_log(id, user_id, type, channel, status, metadata_json, created_at)

## 2) Constraints (DB-level safety)
- Prevent overlapping office_hour_session per user:
  - unique partial index on (user_id) where status='open'
- Prevent negative durations:
  - check constraint: checkout_at >= checkin_at
- Funding request validation:
  - check: amount_requested > 0
  - breakdown_json must include at least 1 line item

## 3) Views (for dashboards)
- v_my_weekly_hours(user_id, week_start, total_minutes, in_office_minutes, deficit_minutes)
- v_budget_burndown(fiscal_year, budget_line_id, allocated, spent, remaining)
- v_open_tasks_by_committee(committee_id, count_by_status)
- v_upcoming_deadlines(meeting_id, agenda_cutoff, posting_deadline)

## 4) RLS helper functions (pseudo)
- is_role(uid, role_key) -> bool
- is_committee_member(uid, committee_id) -> bool
- can_view_doc(uid, doc_row) -> bool

## 5) Data retention defaults
- Keep audit_log permanently (internal accountability).
- Do NOT store raw GPS coords by default; store only distance meters + boolean.
- Receipts/contracts: keep for minimum of the fiscal retention period your Advisor wants (config).

## 6) Policy mapping (config tables)
- config_deadlines: agenda_submit_hours, agenda_post_hours, special_post_hours
- config_finance: board_action_threshold, grant_max, lead_time_days
- config_office_hours: per-role requirement rows, max_session_duration, reminder timings

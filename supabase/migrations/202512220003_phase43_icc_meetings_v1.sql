-- PHASE 43 — ICC meetings + attendance v1
-- Source of truth: 02_data_model.md, ICC manual (2024)

begin;

create table if not exists public.icc_meetings (
  id uuid primary key default gen_random_uuid(),
  term_id uuid null references public.terms(id) on delete set null default public.current_term_id(),
  starts_at timestamptz not null,
  location text null,
  called_to_order_at timestamptz null,
  advisor_present boolean not null default false,
  status text not null default 'scheduled',
  notes text null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint icc_meetings_status_check check (status in ('scheduled', 'cancelled', 'completed')),
  constraint icc_meetings_starts_at_nonempty check (starts_at is not null)
);

create index if not exists icc_meetings_term_idx on public.icc_meetings (term_id);
create index if not exists icc_meetings_starts_at_idx on public.icc_meetings (starts_at);
create index if not exists icc_meetings_status_idx on public.icc_meetings (status);

alter table public.icc_meetings enable row level security;

drop trigger if exists trg_icc_meetings_set_updated_at on public.icc_meetings;
create trigger trg_icc_meetings_set_updated_at
before update on public.icc_meetings
for each row
execute function public.set_updated_at();

create policy "icc_meetings_select_authenticated"
  on public.icc_meetings
  for select
  to authenticated
  using (true);

create policy "icc_meetings_insert_admin"
  on public.icc_meetings
  for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

create policy "icc_meetings_update_admin"
  on public.icc_meetings
  for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "icc_meetings_delete_admin"
  on public.icc_meetings
  for delete
  to authenticated
  using (public.is_admin(auth.uid()));

revoke all on table public.icc_meetings from authenticated;
grant select, insert, update, delete on table public.icc_meetings to authenticated;

create table if not exists public.icc_attendance (
  id uuid primary key default gen_random_uuid(),
  icc_meeting_id uuid not null references public.icc_meetings(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  status text not null default 'absent',
  present_at_call_to_order boolean not null default false,
  excused_reason text null,
  excused_by uuid null references public.profiles(id) on delete set null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint icc_attendance_status_check check (status in ('present', 'absent', 'excused')),
  constraint icc_attendance_present_check check (
    (status = 'present' and present_at_call_to_order = true)
    or (status <> 'present' and present_at_call_to_order = false)
  )
);

create unique index if not exists icc_attendance_unique_idx
  on public.icc_attendance (icc_meeting_id, club_id);

create index if not exists icc_attendance_meeting_idx
  on public.icc_attendance (icc_meeting_id);

alter table public.icc_attendance enable row level security;

drop trigger if exists trg_icc_attendance_set_updated_at on public.icc_attendance;
create trigger trg_icc_attendance_set_updated_at
before update on public.icc_attendance
for each row
execute function public.set_updated_at();

create policy "icc_attendance_select_authenticated"
  on public.icc_attendance
  for select
  to authenticated
  using (true);

create policy "icc_attendance_insert_admin"
  on public.icc_attendance
  for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

create policy "icc_attendance_update_admin"
  on public.icc_attendance
  for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "icc_attendance_delete_admin"
  on public.icc_attendance
  for delete
  to authenticated
  using (public.is_admin(auth.uid()));

revoke all on table public.icc_attendance from authenticated;
grant select, insert, update, delete on table public.icc_attendance to authenticated;

commit;

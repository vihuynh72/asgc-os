-- PHASE 37 — Grant cycle v1
-- Source of truth: 02_data_model.md

begin;

create table if not exists public.grant_cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  max_amount numeric(12,2) not null,
  board_meeting_target_id uuid null references public.meetings(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grant_cycles_name_nonempty check (char_length(btrim(name)) > 0),
  constraint grant_cycles_dates_check check (closes_at > opens_at),
  constraint grant_cycles_max_positive check (max_amount > 0)
);

create index if not exists grant_cycles_open_idx on public.grant_cycles (opens_at, closes_at);

alter table public.grant_cycles enable row level security;

drop trigger if exists trg_grant_cycles_set_updated_at on public.grant_cycles;
create trigger trg_grant_cycles_set_updated_at
before update on public.grant_cycles
for each row
execute function public.set_updated_at();

create policy "grant_cycles_select_finance"
  on public.grant_cycles
  for select
  to authenticated
  using (public.is_finance_admin(auth.uid()));

create policy "grant_cycles_insert_finance"
  on public.grant_cycles
  for insert
  to authenticated
  with check (public.is_finance_admin(auth.uid()));

create policy "grant_cycles_update_finance"
  on public.grant_cycles
  for update
  to authenticated
  using (public.is_finance_admin(auth.uid()))
  with check (public.is_finance_admin(auth.uid()));

create policy "grant_cycles_delete_finance"
  on public.grant_cycles
  for delete
  to authenticated
  using (public.is_finance_admin(auth.uid()));

revoke all on table public.grant_cycles from authenticated;
grant select, insert, update, delete on table public.grant_cycles to authenticated;

commit;

-- PHASE 41 — Clubs registry v1
-- Source of truth: 02_data_model.md, ASGC bylaws + ICC manual (2024)

begin;

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'pending',
  advisor_name text null,
  advisor_email text null,
  constitution_doc_id uuid null references public.docs(id) on delete set null,
  members_count integer not null default 0,
  benefit_card_count integer not null default 0,
  last_charter_at timestamptz null,
  charter_term_id uuid null references public.terms(id) on delete set null,
  status_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clubs_name_nonempty check (char_length(btrim(name)) > 0),
  constraint clubs_status_check check (status in ('pending', 'chartered', 'suspended', 'revoked', 'inactive')),
  constraint clubs_members_count_nonneg check (members_count >= 0),
  constraint clubs_benefit_card_count_nonneg check (benefit_card_count >= 0),
  constraint clubs_benefit_card_count_valid check (benefit_card_count <= members_count)
);

create index if not exists clubs_name_idx on public.clubs (name);
create index if not exists clubs_status_idx on public.clubs (status);
create index if not exists clubs_charter_term_idx on public.clubs (charter_term_id);

alter table public.clubs enable row level security;

drop trigger if exists trg_clubs_set_updated_at on public.clubs;
create trigger trg_clubs_set_updated_at
before update on public.clubs
for each row
execute function public.set_updated_at();

create policy "clubs_select_authenticated"
  on public.clubs
  for select
  to authenticated
  using (true);

create policy "clubs_insert_admin"
  on public.clubs
  for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

create policy "clubs_update_admin"
  on public.clubs
  for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "clubs_delete_admin"
  on public.clubs
  for delete
  to authenticated
  using (public.is_admin(auth.uid()));

revoke all on table public.clubs from authenticated;
grant select, insert, update, delete on table public.clubs to authenticated;

commit;

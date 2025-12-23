-- PHASE 42 — Charter checklist
-- Source of truth: ASGC bylaws + ICC manual + student organization registration packet (2024-2025)

begin;

create table if not exists public.club_charter_checklist_items (
  item_key text primary key,
  label text not null,
  description text null,
  is_required boolean not null default true,
  sort_order integer not null default 0,
  source_reference text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_charter_checklist_items_key_nonempty check (char_length(btrim(item_key)) > 0),
  constraint club_charter_checklist_items_label_nonempty check (char_length(btrim(label)) > 0)
);

create index if not exists club_charter_items_sort_idx on public.club_charter_checklist_items (sort_order);

alter table public.club_charter_checklist_items enable row level security;

drop trigger if exists trg_club_charter_items_set_updated_at on public.club_charter_checklist_items;
create trigger trg_club_charter_items_set_updated_at
before update on public.club_charter_checklist_items
for each row
execute function public.set_updated_at();

create policy "club_charter_items_select_authenticated"
  on public.club_charter_checklist_items
  for select
  to authenticated
  using (true);

create policy "club_charter_items_insert_admin"
  on public.club_charter_checklist_items
  for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

create policy "club_charter_items_update_admin"
  on public.club_charter_checklist_items
  for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "club_charter_items_delete_admin"
  on public.club_charter_checklist_items
  for delete
  to authenticated
  using (public.is_admin(auth.uid()));

revoke all on table public.club_charter_checklist_items from authenticated;
grant select, insert, update, delete on table public.club_charter_checklist_items to authenticated;

create table if not exists public.club_charter_checklist (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  item_key text not null references public.club_charter_checklist_items(item_key) on delete cascade,
  status text not null default 'pending',
  checked_at timestamptz null,
  checked_by uuid null references public.profiles(id) on delete set null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_charter_checklist_status_check check (status in ('pending', 'submitted', 'complete', 'waived'))
);

create unique index if not exists club_charter_checklist_unique_idx
  on public.club_charter_checklist (club_id, item_key);

create index if not exists club_charter_checklist_club_idx
  on public.club_charter_checklist (club_id);

alter table public.club_charter_checklist enable row level security;

drop trigger if exists trg_club_charter_checklist_set_updated_at on public.club_charter_checklist;
create trigger trg_club_charter_checklist_set_updated_at
before update on public.club_charter_checklist
for each row
execute function public.set_updated_at();

create policy "club_charter_checklist_select_authenticated"
  on public.club_charter_checklist
  for select
  to authenticated
  using (true);

create policy "club_charter_checklist_insert_admin"
  on public.club_charter_checklist
  for insert
  to authenticated
  with check (public.is_admin(auth.uid()));

create policy "club_charter_checklist_update_admin"
  on public.club_charter_checklist
  for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "club_charter_checklist_delete_admin"
  on public.club_charter_checklist
  for delete
  to authenticated
  using (public.is_admin(auth.uid()));

revoke all on table public.club_charter_checklist from authenticated;
grant select, insert, update, delete on table public.club_charter_checklist to authenticated;

insert into public.club_charter_checklist_items (item_key, label, description, is_required, sort_order, source_reference)
values
  (
    'registration_packet_part_i',
    'Registration Packet Part I submitted',
    'Student Organization Registration Packet Part I on file.',
    true,
    10,
    'Student Organization Registration Packet 2024-2025'
  ),
  (
    'registration_packet_part_ii',
    'Registration Packet Part II signed',
    'Officer/Principle Member Signatory Form completed.',
    true,
    20,
    'Student Organization Registration Packet 2024-2025'
  ),
  (
    'advisor_agreement',
    'Advisor agreement on file',
    'Faculty advisor agreement completed and on file.',
    true,
    30,
    'Student Organization Registration Packet 2024-2025'
  ),
  (
    'constitution_on_file',
    'Constitution approved and on file',
    'Official constitution approved by ASGC and filed with Student Affairs.',
    true,
    40,
    'Student Organization Registration Packet 2024-2025'
  ),
  (
    'minimum_members',
    'Minimum membership met',
    'Club has at least five (5) members.',
    true,
    50,
    'Student Organization Registration Packet 2024-2025'
  ),
  (
    'advisor_assigned',
    'Advisor assigned',
    'Club has at least one faculty advisor.',
    true,
    60,
    'Student Organization Registration Packet 2024-2025'
  ),
  (
    'icc_representative',
    'ICC representative identified',
    'ICC representative listed for the club.',
    true,
    70,
    'ASGC Bylaws Article IX + ICC Manual'
  ),
  (
    'membership_roster_submitted',
    'Membership roster submitted',
    'Full membership roster submitted for the current term.',
    true,
    80,
    'Student Organization Registration Packet 2024-2025'
  )
on conflict (item_key) do update
set
  label = excluded.label,
  description = excluded.description,
  is_required = excluded.is_required,
  sort_order = excluded.sort_order,
  source_reference = excluded.source_reference;

commit;

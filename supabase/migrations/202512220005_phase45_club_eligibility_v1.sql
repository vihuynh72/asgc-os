-- PHASE 45 — Club funding eligibility v1
-- Source of truth: ICC manual + registration packet (2024-2025)

begin;

create table if not exists public.config_club_eligibility (
  id boolean primary key default true,
  min_members integer not null default 5,
  benefit_ratio numeric(6,4) not null default 0.6667,
  benefit_min_count integer not null default 17,
  require_charter_complete boolean not null default true,
  require_charter_status boolean not null default true,
  require_constitution boolean not null default true,
  citations jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint config_club_eligibility_singleton check (id is true),
  constraint config_club_eligibility_min_members_check check (min_members >= 0),
  constraint config_club_eligibility_benefit_ratio_check check (benefit_ratio >= 0 and benefit_ratio <= 1),
  constraint config_club_eligibility_benefit_min_check check (benefit_min_count >= 0)
);

alter table public.config_club_eligibility enable row level security;

create policy "config_club_eligibility_select_authenticated"
  on public.config_club_eligibility
  for select
  to authenticated
  using (true);

create policy "config_club_eligibility_update_admin"
  on public.config_club_eligibility
  for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

revoke all on table public.config_club_eligibility from authenticated;
grant select, update on table public.config_club_eligibility to authenticated;

insert into public.config_club_eligibility (id, citations)
values (
  true,
  jsonb_build_object(
    'min_members', 'Student Organization Registration Packet 2024-2025: minimum five members.',
    'benefit_cards', 'ICC Manual 2024: Benefit Card Status requires 2/3 members or 17, whichever is lower.',
    'constitution', 'Student Organization Registration Packet 2024-2025: constitution on file.'
  )
)
on conflict (id) do update
set citations = excluded.citations;

drop trigger if exists trg_config_club_eligibility_set_updated_at on public.config_club_eligibility;
create trigger trg_config_club_eligibility_set_updated_at
before update on public.config_club_eligibility
for each row
execute function public.set_updated_at();

create or replace view public.v_club_charter_completion
with (security_invoker = true) as
select
  c.id as club_id,
  count(i.item_key) filter (where i.is_required)::int as required_items,
  count(s.item_key) filter (where i.is_required and s.status = 'complete')::int as completed_items,
  case
    when count(i.item_key) filter (where i.is_required) = 0 then false
    else count(s.item_key) filter (where i.is_required and s.status = 'complete')
      = count(i.item_key) filter (where i.is_required)
  end as charter_complete
from public.clubs c
left join public.club_charter_checklist_items i on true
left join public.club_charter_checklist s
  on s.club_id = c.id
  and s.item_key = i.item_key
group by c.id;

grant select on public.v_club_charter_completion to authenticated;

create table if not exists public.club_eligibility (
  club_id uuid primary key references public.clubs(id) on delete cascade,
  term_id uuid null references public.terms(id) on delete set null,
  members_count integer not null default 0,
  benefit_card_count integer not null default 0,
  required_benefit_cards integer not null default 0,
  meets_min_members boolean not null default false,
  meets_benefit_cards boolean not null default false,
  charter_complete boolean not null default false,
  charter_status_ok boolean not null default false,
  constitution_on_file boolean not null default false,
  eligible_for_funding boolean not null default false,
  reasons jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.club_eligibility enable row level security;

drop trigger if exists trg_club_eligibility_set_updated_at on public.club_eligibility;
create trigger trg_club_eligibility_set_updated_at
before update on public.club_eligibility
for each row
execute function public.set_updated_at();

create policy "club_eligibility_select_authenticated"
  on public.club_eligibility
  for select
  to authenticated
  using (true);

create policy "club_eligibility_update_admin"
  on public.club_eligibility
  for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

revoke all on table public.club_eligibility from authenticated;
grant select, update on table public.club_eligibility to authenticated;

create or replace function public.refresh_club_eligibility(_club_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with cfg as (
    select *
    from public.config_club_eligibility
    where id = true
  ),
  completion as (
    select *
    from public.v_club_charter_completion
  ),
  club_base as (
    select
      c.id as club_id,
      c.charter_term_id as term_id,
      c.members_count,
      c.benefit_card_count,
      c.status,
      c.constitution_doc_id,
      coalesce(comp.charter_complete, false) as charter_complete,
      cfg.min_members,
      cfg.benefit_ratio,
      cfg.benefit_min_count,
      cfg.require_charter_complete,
      cfg.require_charter_status,
      cfg.require_constitution
    from public.clubs c
    cross join cfg
    left join completion comp on comp.club_id = c.id
    where (_club_id is null or c.id = _club_id)
  ),
  computed as (
    select
      club_id,
      term_id,
      members_count,
      benefit_card_count,
      least(ceil(members_count * benefit_ratio)::int, benefit_min_count) as required_benefit_cards,
      (members_count >= min_members) as meets_min_members,
      (benefit_card_count >= least(ceil(members_count * benefit_ratio)::int, benefit_min_count)) as meets_benefit_cards,
      charter_complete as charter_complete,
      (not require_charter_status or status = 'chartered') as charter_status_ok,
      (not require_constitution or constitution_doc_id is not null) as constitution_on_file,
      array_remove(
        array[
          case when members_count < min_members then 'min_members' end,
          case when benefit_card_count < least(ceil(members_count * benefit_ratio)::int, benefit_min_count) then 'benefit_cards' end,
          case when require_charter_complete and not charter_complete then 'charter_checklist' end,
          case when require_charter_status and status <> 'chartered' then 'not_chartered' end,
          case when require_constitution and constitution_doc_id is null then 'constitution_missing' end
        ],
        null
      ) as reasons_array
    from club_base
  )
  insert into public.club_eligibility (
    club_id,
    term_id,
    members_count,
    benefit_card_count,
    required_benefit_cards,
    meets_min_members,
    meets_benefit_cards,
    charter_complete,
    charter_status_ok,
    constitution_on_file,
    eligible_for_funding,
    reasons
  )
  select
    club_id,
    term_id,
    members_count,
    benefit_card_count,
    required_benefit_cards,
    meets_min_members,
    meets_benefit_cards,
    charter_complete,
    charter_status_ok,
    constitution_on_file,
    (array_length(reasons_array, 1) is null or array_length(reasons_array, 1) = 0),
    to_jsonb(reasons_array)
  from computed
  on conflict (club_id) do update
  set
    term_id = excluded.term_id,
    members_count = excluded.members_count,
    benefit_card_count = excluded.benefit_card_count,
    required_benefit_cards = excluded.required_benefit_cards,
    meets_min_members = excluded.meets_min_members,
    meets_benefit_cards = excluded.meets_benefit_cards,
    charter_complete = excluded.charter_complete,
    charter_status_ok = excluded.charter_status_ok,
    constitution_on_file = excluded.constitution_on_file,
    eligible_for_funding = excluded.eligible_for_funding,
    reasons = excluded.reasons,
    updated_at = now();
end;
$$;

revoke all on function public.refresh_club_eligibility(uuid) from public;
grant execute on function public.refresh_club_eligibility(uuid) to service_role;

create or replace function public.trigger_refresh_club_eligibility_from_clubs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_club_eligibility(coalesce(new.id, old.id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_clubs_refresh_eligibility on public.clubs;
create trigger trg_clubs_refresh_eligibility
after insert or update on public.clubs
for each row
execute function public.trigger_refresh_club_eligibility_from_clubs();

create or replace function public.trigger_refresh_club_eligibility_from_checklist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_club_eligibility(coalesce(new.club_id, old.club_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_club_checklist_refresh_eligibility on public.club_charter_checklist;
create trigger trg_club_checklist_refresh_eligibility
after insert or update or delete on public.club_charter_checklist
for each row
execute function public.trigger_refresh_club_eligibility_from_checklist();

commit;

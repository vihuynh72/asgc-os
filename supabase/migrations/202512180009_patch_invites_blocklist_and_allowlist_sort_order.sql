-- PATCH — Invites allowlist management
--
-- Adds:
-- - `invites_blocklist`: ban specific emails/domains (overrides allowlist)
-- - `invites_allowlist.sort_order`: manual ordering/pinning in admin UI
-- - Updates `is_email_allowlisted` to enforce blocklist

begin;

-- 1) Blocklist / denylist (server-only; no client-facing policies)
create table if not exists public.invites_blocklist (
  id uuid primary key default gen_random_uuid(),
  pattern text not null,
  pattern_normalized text generated always as (lower(btrim(pattern))) stored,
  is_active boolean not null default true,
  banned_by uuid null,
  banned_at timestamptz not null default now(),
  unbanned_at timestamptz null,
  notes text null,
  constraint invites_blocklist_pattern_nonempty check (char_length(btrim(pattern)) > 0)
);

create unique index if not exists invites_blocklist_pattern_normalized_uniq
  on public.invites_blocklist (pattern_normalized);

alter table public.invites_blocklist enable row level security;

-- 2) Allowlist ordering for admin UX
alter table public.invites_allowlist
  add column if not exists sort_order bigint;

update public.invites_allowlist
set sort_order = (extract(epoch from invited_at) * 1000)::bigint
where sort_order is null;

alter table public.invites_allowlist
  alter column sort_order set not null;

alter table public.invites_allowlist
  alter column sort_order set default ((extract(epoch from now()) * 1000)::bigint);

create index if not exists invites_allowlist_sort_order_idx
  on public.invites_allowlist (sort_order desc, invited_at desc);

-- 3) is_email_allowlisted() now enforces blocklist (block wins)
create or replace function public.is_email_allowlisted(_email text)
returns boolean
language sql
stable
as $$
  with n as (
    select lower(btrim(coalesce(_email, ''))) as email_norm
  ),
  d as (
    select split_part((select email_norm from n), '@', 2) as domain
  ),
  parts as (
    select regexp_split_to_array((select domain from d), '\\.') as parts
  ),
  suffixes as (
    -- Build domain suffixes with at least 2 labels ("example.com").
    select array_to_string(parts[i:array_length(parts, 1)], '.') as suffix
    from parts, generate_series(1, array_length(parts, 1) - 1) as i
    where array_length(parts, 1) >= 2
  ),
  blocked as (
    select exists (
      select 1
      from public.invites_blocklist ib, n
      where ib.is_active = true
        and (
          ib.pattern_normalized = n.email_norm
          or (
            (select domain from d) <> ''
            and ib.pattern_normalized in (select '@' || s.suffix from suffixes s)
          )
        )
    ) as is_blocked
  ),
  allowed as (
    select exists (
      select 1
      from public.invites_allowlist ia, n
      where ia.is_active = true
        and (
          ia.email_normalized = n.email_norm
          or (
            (select domain from d) <> ''
            and ia.email_normalized in (select '@' || s.suffix from suffixes s)
          )
        )
    ) as is_allowed
  )
  select (select is_allowed from allowed) and not (select is_blocked from blocked);
$$;

revoke all on function public.is_email_allowlisted(text) from public;
revoke all on function public.is_email_allowlisted(text) from authenticated;
grant execute on function public.is_email_allowlisted(text) to service_role;

commit;


-- PATCH — Fix notification_log dedupe_key uniqueness inference
-- Postgres `INSERT ... ON CONFLICT (dedupe_key)` requires a non-partial UNIQUE index/constraint.
-- A partial UNIQUE index (WHERE dedupe_key IS NOT NULL) does NOT match that conflict target.

begin;

alter table public.notification_log
  add column if not exists dedupe_key text null;

-- If earlier inserts created duplicates, de-dupe so we can enforce uniqueness.
with ranked as (
  select
    id,
    row_number() over (partition by dedupe_key order by created_at asc, id asc) as rn
  from public.notification_log
  where dedupe_key is not null
)
delete from public.notification_log nl
using ranked r
where nl.id = r.id
  and r.rn > 1;

drop index if exists public.notification_log_dedupe_key_uq;

create unique index if not exists notification_log_dedupe_key_uq
  on public.notification_log (dedupe_key);

commit;


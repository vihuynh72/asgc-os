-- PHASE 13 — Presence token generator v1 (PIN)
-- Implements a rotating PIN derived deterministically from a per-office secret.
-- Stores only a hash of the PIN in presence_tokens for audit/validation.

begin;

-- 1) Secret per office + token type.
create table if not exists public.presence_token_secrets (
  office_location_id uuid not null references public.office_locations(id) on delete cascade,
  token_type text not null,
  secret_key_hex text not null,
  window_seconds integer not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint presence_token_secrets_token_type_check check (token_type in ('pin')),
  constraint presence_token_secrets_window_seconds_check check (window_seconds between 30 and 60),
  constraint presence_token_secrets_secret_nonempty check (char_length(btrim(secret_key_hex)) >= 32),
  primary key (office_location_id, token_type)
);

alter table public.presence_token_secrets enable row level security;

drop trigger if exists trg_presence_token_secrets_set_updated_at on public.presence_token_secrets;
create trigger trg_presence_token_secrets_set_updated_at
before update on public.presence_token_secrets
for each row
execute function public.set_updated_at();

-- 2) Issued tokens (hash only). No SELECT policy for authenticated.
create table if not exists public.presence_tokens (
  id uuid primary key default gen_random_uuid(),
  office_location_id uuid not null references public.office_locations(id) on delete cascade,
  token_type text not null,
  token_value_hash text not null,
  valid_from timestamptz not null,
  valid_to timestamptz not null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint presence_tokens_token_type_check check (token_type in ('pin')),
  constraint presence_tokens_window_check check (valid_to > valid_from)
);

create unique index if not exists presence_tokens_window_unique
  on public.presence_tokens (office_location_id, token_type, valid_from, valid_to);

create index if not exists presence_tokens_office_window_idx
  on public.presence_tokens (office_location_id, valid_from desc);

alter table public.presence_tokens enable row level security;

-- 3) Token issuing RPC (service-role only).
create or replace function public.issue_presence_pin(_office_location_id uuid)
returns table (
  pin text,
  valid_from timestamptz,
  valid_to timestamptz,
  window_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz;
  secret_hex text;
  secret_bytes bytea;
  win integer;
  counter bigint;
  digest bytea;
  n bigint;
  pin_int integer;
  vf timestamptz;
  vt timestamptz;
begin
  now_ts := now();

  select s.secret_key_hex, s.window_seconds
    into secret_hex, win
  from public.presence_token_secrets s
  where s.office_location_id = _office_location_id
    and s.token_type = 'pin';

  if not found then
    -- One-time seed for this office. Stored as hex to keep it transport-friendly.
    secret_hex := encode(gen_random_bytes(32), 'hex');
    win := 60;

    insert into public.presence_token_secrets (office_location_id, token_type, secret_key_hex, window_seconds)
    values (_office_location_id, 'pin', secret_hex, win)
    on conflict (office_location_id, token_type)
    do nothing;

    -- Re-read to handle races.
    select s.secret_key_hex, s.window_seconds
      into secret_hex, win
    from public.presence_token_secrets s
    where s.office_location_id = _office_location_id
      and s.token_type = 'pin';
  end if;

  secret_bytes := decode(secret_hex, 'hex');

  counter := floor(extract(epoch from now_ts) / win)::bigint;
  vf := to_timestamp(counter * win);
  vt := to_timestamp((counter + 1) * win);

  digest := hmac(counter::text::bytea, secret_bytes, 'sha256');

  -- Convert first 4 bytes into a positive integer.
  n := (get_byte(digest, 0)::bigint << 24)
     + (get_byte(digest, 1)::bigint << 16)
     + (get_byte(digest, 2)::bigint << 8)
     + (get_byte(digest, 3)::bigint);

  if n < 0 then
    n := n * -1;
  end if;

  pin_int := (n % 1000000)::integer;

  pin := lpad(pin_int::text, 6, '0');
  valid_from := vf;
  valid_to := vt;
  window_seconds := win;

  insert into public.presence_tokens (office_location_id, token_type, token_value_hash, valid_from, valid_to, created_by)
  values (
    _office_location_id,
    'pin',
    crypt(pin, gen_salt('bf')),
    vf,
    vt,
    auth.uid()
  )
  on conflict (office_location_id, token_type, valid_from, valid_to)
  do nothing;

  return next;
end;
$$;

revoke all on function public.issue_presence_pin(uuid) from public;
revoke all on function public.issue_presence_pin(uuid) from authenticated;
grant execute on function public.issue_presence_pin(uuid) to service_role;

-- 4) Validation helper (service-role only; used later by check-in).
create or replace function public.validate_presence_pin(
  _office_location_id uuid,
  _pin text,
  _at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  secret_hex text;
  secret_bytes bytea;
  win integer;
  counter bigint;
  digest bytea;
  n bigint;
  expected_int integer;
  expected text;
begin
  select s.secret_key_hex, s.window_seconds
    into secret_hex, win
  from public.presence_token_secrets s
  where s.office_location_id = _office_location_id
    and s.token_type = 'pin';

  if not found then
    return false;
  end if;

  secret_bytes := decode(secret_hex, 'hex');
  counter := floor(extract(epoch from _at) / win)::bigint;
  digest := hmac(counter::text::bytea, secret_bytes, 'sha256');

  n := (get_byte(digest, 0)::bigint << 24)
     + (get_byte(digest, 1)::bigint << 16)
     + (get_byte(digest, 2)::bigint << 8)
     + (get_byte(digest, 3)::bigint);

  if n < 0 then
    n := n * -1;
  end if;

  expected_int := (n % 1000000)::integer;
  expected := lpad(expected_int::text, 6, '0');

  return _pin = expected;
end;
$$;

revoke all on function public.validate_presence_pin(uuid, text, timestamptz) from public;
revoke all on function public.validate_presence_pin(uuid, text, timestamptz) from authenticated;
grant execute on function public.validate_presence_pin(uuid, text, timestamptz) to service_role;

commit;

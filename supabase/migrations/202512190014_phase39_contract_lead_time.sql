-- PHASE 39 — Service contract lead-time warnings
-- Source of truth: 00_product_brief.md, 02_data_model.md

begin;

alter table public.funding_requests
  add column if not exists requires_contract boolean not null default false,
  add column if not exists event_date date null,
  add column if not exists contract_warning boolean not null default false;

-- Compute contract warning based on config_finance lead time.
create or replace function public.set_funding_request_contract_warning()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_days integer;
  warning_date date;
begin
  select cf.lead_time_days into lead_days
  from public.config_finance cf where cf.id = true;

  lead_days := coalesce(lead_days, 42);

  if new.requires_contract and new.event_date is not null then
    warning_date := new.event_date - lead_days;
    new.contract_warning := (current_date >= warning_date);
  else
    new.contract_warning := false;
  end if;

  return new;
end;
$$;

revoke all on function public.set_funding_request_contract_warning() from public;

-- Trigger to keep warning flag up to date.
drop trigger if exists trg_funding_request_contract_warning on public.funding_requests;
create trigger trg_funding_request_contract_warning
before insert or update on public.funding_requests
for each row
execute function public.set_funding_request_contract_warning();

-- Backfill existing rows.
update public.funding_requests
set contract_warning = contract_warning;

commit;

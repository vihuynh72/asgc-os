-- PHASE 31 — Budget lines v1
-- Source of truth: 01_stack_and_architecture.md, 02_data_model.md

begin;

create table if not exists public.budget_lines (
  id uuid primary key default gen_random_uuid(),
  fiscal_year integer not null,
  name text not null,
  category text not null,
  allocated_amount numeric(12,2) not null,
  notes text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budget_lines_fiscal_year_check check (fiscal_year >= 2000),
  constraint budget_lines_name_nonempty check (char_length(btrim(name)) > 0),
  constraint budget_lines_category_nonempty check (char_length(btrim(category)) > 0),
  constraint budget_lines_allocated_amount_check check (allocated_amount >= 0)
);

create index if not exists budget_lines_fiscal_year_idx on public.budget_lines (fiscal_year);
create index if not exists budget_lines_category_idx on public.budget_lines (category);
create index if not exists budget_lines_active_idx on public.budget_lines (is_active);

alter table public.budget_lines enable row level security;

drop trigger if exists trg_budget_lines_set_updated_at on public.budget_lines;
create trigger trg_budget_lines_set_updated_at
before update on public.budget_lines
for each row
execute function public.set_updated_at();

create policy "budget_lines_select_finance"
  on public.budget_lines
  for select
  to authenticated
  using (public.is_finance_admin(auth.uid()));

create policy "budget_lines_insert_finance"
  on public.budget_lines
  for insert
  to authenticated
  with check (public.is_finance_admin(auth.uid()));

create policy "budget_lines_update_finance"
  on public.budget_lines
  for update
  to authenticated
  using (public.is_finance_admin(auth.uid()))
  with check (public.is_finance_admin(auth.uid()));

create policy "budget_lines_delete_finance"
  on public.budget_lines
  for delete
  to authenticated
  using (public.is_finance_admin(auth.uid()));

revoke all on table public.budget_lines from authenticated;
grant select, insert, update, delete on table public.budget_lines to authenticated;

commit;

-- PHASE 49 — Budget line uniqueness

begin;

create unique index if not exists budget_lines_year_name_active_unique
  on public.budget_lines (fiscal_year, lower(btrim(name)))
  where is_active;

commit;

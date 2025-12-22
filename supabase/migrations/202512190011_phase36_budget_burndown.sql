-- PHASE 36 — Budget burn-down view
-- Source of truth: 02_data_model.md

begin;

create or replace view public.v_budget_burndown as
select
  bl.fiscal_year,
  bl.id as budget_line_id,
  bl.name,
  bl.category,
  bl.allocated_amount,
  coalesce(
    sum(
      case
        when e.status in ('approved', 'paid') then e.amount
        else 0
      end
    ),
    0
  ) as spent,
  (bl.allocated_amount - coalesce(
    sum(
      case
        when e.status in ('approved', 'paid') then e.amount
        else 0
      end
    ),
    0
  )) as remaining
from public.budget_lines bl
left join public.expenses e on e.budget_line_id = bl.id
group by bl.fiscal_year, bl.id, bl.name, bl.category, bl.allocated_amount;

revoke all on table public.v_budget_burndown from authenticated;
grant select on table public.v_budget_burndown to authenticated;

commit;

-- PHASE 35 — Expense logging v1
-- Source of truth: 02_data_model.md, 03_security_and_permissions.md

begin;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  funding_request_id uuid null references public.funding_requests(id) on delete set null,
  budget_line_id uuid not null references public.budget_lines(id) on delete restrict,
  payee text not null,
  description text null,
  amount numeric(12,2) not null,
  purchased_at timestamptz not null,
  receipt_doc_id uuid null references public.docs(id) on delete set null,
  status text not null default 'pending',
  entered_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_payee_nonempty check (char_length(btrim(payee)) > 0),
  constraint expenses_amount_positive check (amount > 0),
  constraint expenses_status_check check (status in ('pending', 'approved', 'rejected', 'paid'))
);

create index if not exists expenses_budget_line_idx on public.expenses (budget_line_id);
create index if not exists expenses_request_idx on public.expenses (funding_request_id);
create index if not exists expenses_status_idx on public.expenses (status);

alter table public.expenses enable row level security;

drop trigger if exists trg_expenses_set_updated_at on public.expenses;
create trigger trg_expenses_set_updated_at
before update on public.expenses
for each row
execute function public.set_updated_at();

create policy "expenses_select_finance"
  on public.expenses
  for select
  to authenticated
  using (public.is_finance_admin(auth.uid()));

create policy "expenses_select_requestor"
  on public.expenses
  for select
  to authenticated
  using (
    funding_request_id is not null
    and exists (
      select 1
      from public.funding_requests fr
      where fr.id = expenses.funding_request_id
        and fr.requestor_user_id = auth.uid()
    )
  );

create policy "expenses_insert_finance"
  on public.expenses
  for insert
  to authenticated
  with check (public.is_finance_admin(auth.uid()));

create policy "expenses_update_finance"
  on public.expenses
  for update
  to authenticated
  using (public.is_finance_admin(auth.uid()))
  with check (public.is_finance_admin(auth.uid()));

create policy "expenses_delete_finance"
  on public.expenses
  for delete
  to authenticated
  using (public.is_finance_admin(auth.uid()));

revoke all on table public.expenses from authenticated;
grant select, insert, update, delete on table public.expenses to authenticated;

-- RPC: create expense.
create or replace function public.create_expense(
  _funding_request_id uuid,
  _budget_line_id uuid,
  _payee text,
  _description text,
  _amount numeric,
  _purchased_at timestamptz,
  _receipt_doc_id uuid,
  _status text default 'pending'
)
returns public.expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  exp public.expenses;
  doc_row public.docs;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if not public.is_finance_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  if _payee is null or char_length(btrim(_payee)) = 0 then
    raise exception 'payee_required';
  end if;

  if _amount is null or _amount <= 0 then
    raise exception 'amount_required';
  end if;

  if _purchased_at is null then
    raise exception 'purchased_at_required';
  end if;

  if _status not in ('pending', 'approved', 'rejected', 'paid') then
    raise exception 'invalid_status';
  end if;

  if _receipt_doc_id is not null then
    select * into doc_row from public.docs where id = _receipt_doc_id;
    if not found then
      raise exception 'receipt_doc_not_found';
    end if;
    if doc_row.doc_type <> 'receipt' then
      raise exception 'invalid_receipt_doc_type';
    end if;
  end if;

  insert into public.expenses (
    funding_request_id,
    budget_line_id,
    payee,
    description,
    amount,
    purchased_at,
    receipt_doc_id,
    status,
    entered_by
  )
  values (
    _funding_request_id,
    _budget_line_id,
    btrim(_payee),
    nullif(btrim(_description), ''),
    _amount,
    _purchased_at,
    _receipt_doc_id,
    _status,
    auth.uid()
  )
  returning * into exp;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'finance.expense.created',
    'expense',
    exp.id,
    jsonb_build_object('amount', exp.amount, 'status', exp.status)
  );

  return exp;
end;
$$;

revoke all on function public.create_expense(uuid, uuid, text, text, numeric, timestamptz, uuid, text) from public;
grant execute on function public.create_expense(uuid, uuid, text, text, numeric, timestamptz, uuid, text) to authenticated;

-- RPC: update expense.
create or replace function public.update_expense(
  _expense_id uuid,
  _payee text default null,
  _description text default null,
  _amount numeric default null,
  _purchased_at timestamptz default null,
  _receipt_doc_id uuid default null,
  _status text default null,
  _budget_line_id uuid default null,
  _funding_request_id uuid default null
)
returns public.expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  exp public.expenses;
  doc_row public.docs;
  next_status text;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  if not public.is_finance_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  select * into exp from public.expenses where id = _expense_id for update;
  if not found then
    raise exception 'expense_not_found';
  end if;

  if _receipt_doc_id is not null then
    select * into doc_row from public.docs where id = _receipt_doc_id;
    if not found then
      raise exception 'receipt_doc_not_found';
    end if;
    if doc_row.doc_type <> 'receipt' then
      raise exception 'invalid_receipt_doc_type';
    end if;
  end if;

  next_status := coalesce(_status, exp.status);
  if next_status not in ('pending', 'approved', 'rejected', 'paid') then
    raise exception 'invalid_status';
  end if;

  update public.expenses
  set
    payee = coalesce(nullif(btrim(_payee), ''), payee),
    description = coalesce(nullif(btrim(_description), ''), description),
    amount = coalesce(_amount, amount),
    purchased_at = coalesce(_purchased_at, purchased_at),
    receipt_doc_id = coalesce(_receipt_doc_id, receipt_doc_id),
    status = next_status,
    budget_line_id = coalesce(_budget_line_id, budget_line_id),
    funding_request_id = coalesce(_funding_request_id, funding_request_id)
  where id = _expense_id
  returning * into exp;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'finance.expense.updated',
    'expense',
    exp.id,
    jsonb_build_object('status', exp.status)
  );

  return exp;
end;
$$;

revoke all on function public.update_expense(uuid, text, text, numeric, timestamptz, uuid, text, uuid, uuid) from public;
grant execute on function public.update_expense(uuid, text, text, numeric, timestamptz, uuid, text, uuid, uuid) to authenticated;

commit;

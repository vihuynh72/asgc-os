-- PHASE 27 - AI summarize (single doc type)
-- Source of truth: 02_data_model.md, 00_product_brief.md (AI guardrails)

begin;

create table if not exists public.doc_summaries (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.docs(id) on delete cascade,
  summary_text text not null,
  status text not null default 'draft',
  created_by uuid null references public.profiles(id) on delete set null,
  model_info_json jsonb not null default '{}'::jsonb,
  prompt_text text null,
  created_at timestamptz not null default now(),
  reviewed_by uuid null references public.profiles(id) on delete set null,
  reviewed_at timestamptz null,
  constraint doc_summaries_status_check check (status in ('draft', 'approved', 'rejected')),
  constraint doc_summaries_summary_nonempty check (char_length(btrim(summary_text)) > 0)
);

create index if not exists doc_summaries_doc_id_idx on public.doc_summaries (doc_id);
create index if not exists doc_summaries_status_idx on public.doc_summaries (status);

alter table public.doc_summaries enable row level security;

create policy "doc_summaries_select_scoped"
  on public.doc_summaries
  for select
  to authenticated
  using (public.can_view_doc(doc_id));

revoke all on table public.doc_summaries from authenticated;
grant select on table public.doc_summaries to authenticated;

create or replace function public.create_doc_summary(
  _doc_id uuid,
  _summary_text text,
  _model_info_json jsonb default '{}'::jsonb,
  _prompt_text text default null
)
returns public.doc_summaries
language plpgsql
security definer
set search_path = public
as $$
declare
  doc_row public.docs;
  summary public.doc_summaries;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  select * into doc_row from public.docs where id = _doc_id;

  if not found then
    raise exception 'doc_not_found';
  end if;

  if doc_row.doc_type <> 'committee_notes' then
    raise exception 'invalid_doc_type';
  end if;

  if not public.can_view_doc(_doc_id) then
    raise exception 'forbidden';
  end if;

  if _summary_text is null or char_length(btrim(_summary_text)) = 0 then
    raise exception 'summary_required';
  end if;

  insert into public.doc_summaries (
    doc_id,
    summary_text,
    status,
    created_by,
    model_info_json,
    prompt_text
  )
  values (
    _doc_id,
    btrim(_summary_text),
    'draft',
    auth.uid(),
    coalesce(_model_info_json, '{}'::jsonb),
    _prompt_text
  )
  returning * into summary;

  insert into public.audit_log (actor_user_id, action_key, target_type, target_id, metadata)
  values (
    auth.uid(),
    'docs.summary_created',
    'doc_summary',
    summary.id,
    jsonb_build_object('doc_id', _doc_id)
  );

  return summary;
end;
$$;

revoke all on function public.create_doc_summary(uuid, text, jsonb, text) from public;

grant execute on function public.create_doc_summary(uuid, text, jsonb, text) to authenticated;

commit;

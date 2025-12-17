-- PHASE 18.1 — Fix mark_missed_shifts return count (should count shifts marked missed)

begin;

create or replace function public.mark_missed_shifts(_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  tz text;
  updated_count integer;
  r record;
begin
  tz := public.office_timezone();
  updated_count := 0;

  for r in
    update public.office_hour_shifts s
    set status = 'missed'
    where s.status = 'scheduled'
      and _now >= s.ends_at
      and not exists (
        select 1
        from public.office_hour_sessions sess
        where sess.user_id = s.user_id
          and sess.checkin_at <= s.ends_at
          and (sess.checkout_at is null or sess.checkout_at >= s.starts_at)
      )
    returning s.id as shift_id, s.user_id, s.starts_at, s.ends_at
  loop
    updated_count := updated_count + 1;

    insert into public.notification_log (
      actor_user_id,
      user_id,
      type,
      channel,
      provider,
      to_email,
      subject,
      status,
      send_after,
      dedupe_key,
      metadata
    )
    select
      null,
      r.user_id,
      'office_hours.shift_missed',
      'email',
      'resend',
      pp.email,
      'You missed your office hours shift',
      'queued',
      public.defer_if_quiet_hours(_now),
      'office_hours.shift_missed:' || r.shift_id::text,
      jsonb_build_object(
        'shift_id', r.shift_id,
        'starts_at', r.starts_at,
        'ends_at', r.ends_at,
        'office_tz', tz,
        'starts_at_local', to_char(r.starts_at at time zone tz, 'YYYY-MM-DD HH24:MI'),
        'ends_at_local', to_char(r.ends_at at time zone tz, 'YYYY-MM-DD HH24:MI')
      )
    from public.profile_private pp
    where pp.id = r.user_id
      and pp.email is not null
      and char_length(btrim(pp.email)) > 0
    on conflict (dedupe_key) do nothing;
  end loop;

  return updated_count;
end;
$$;

revoke all on function public.mark_missed_shifts(timestamptz) from public;
revoke all on function public.mark_missed_shifts(timestamptz) from authenticated;
grant execute on function public.mark_missed_shifts(timestamptz) to service_role;

commit;

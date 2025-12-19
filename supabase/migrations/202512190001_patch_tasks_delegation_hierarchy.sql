-- PATCH — Tasks delegation hierarchy + fix chair assignment
--
-- Fixes: committee chairs could not assign tasks because the trigger function queried
-- `committee_memberships`, but RLS prevented chairs from reading other members.
-- Solution: run the assignment enforcement as a SECURITY DEFINER trigger function and
-- allow assignment based on a simple role hierarchy:
-- - advisor/president (is_admin): assign to anyone (existing behavior)
-- - executive: assign to director/board_member/volunteer
-- - director: assign to board_member/volunteer
-- - committee chair: assign within committee

begin;

create or replace function public.enforce_task_assignment_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
  is_chair boolean;
  assignee_is_member boolean;
  actor_role text;
  assignee_role text;
begin
  is_admin := public.is_admin(auth.uid());

  if new.assigned_to is not null then
    -- Prevent assigning non-members (must be able to see the task via committee scoping).
    select exists (
      select 1
      from public.committee_memberships cm
      where cm.committee_id = new.committee_id
        and cm.user_id = new.assigned_to
    ) into assignee_is_member;

    if not assignee_is_member then
      raise exception 'invalid assignee';
    end if;

    -- Only allow assigning others when the actor is permitted to delegate.
    if not is_admin and new.assigned_to <> auth.uid() then
      -- Committee chair can assign within committee.
      is_chair := public.is_committee_chair(new.committee_id);
      if is_chair then
        return new;
      end if;

      -- Role-based delegation (term-scoped).
      actor_role := public.primary_role_key_for_requirements(auth.uid());
      assignee_role := public.primary_role_key_for_requirements(new.assigned_to);

      if actor_role = 'executive' and assignee_role in ('director','board_member','volunteer') then
        return new;
      elsif actor_role = 'director' and assignee_role in ('board_member','volunteer') then
        return new;
      else
        raise exception 'forbidden';
      end if;
    end if;
  end if;

  return new;
end;
$$;

commit;


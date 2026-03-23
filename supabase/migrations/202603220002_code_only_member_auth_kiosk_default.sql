alter table public.login_email_challenges
  add column if not exists supabase_token_hash text null,
  add column if not exists supabase_verification_type text null;

alter table public.login_email_challenges
  drop constraint if exists login_email_challenges_kind_check;

alter table public.login_email_challenges
  add constraint login_email_challenges_kind_check
  check (challenge_kind in ('password_signin', 'first_time_signin'));

alter table public.login_email_challenges
  drop constraint if exists login_email_challenges_supabase_verification_type_check;

alter table public.login_email_challenges
  add constraint login_email_challenges_supabase_verification_type_check
  check (
    supabase_verification_type is null
    or supabase_verification_type in ('magiclink', 'invite')
  );

comment on column public.login_email_challenges.supabase_token_hash is
  'Hidden Supabase token hash stored for first-time code-only sign-in completion.';

comment on column public.login_email_challenges.supabase_verification_type is
  'Supabase verification type paired with supabase_token_hash for first-time code-only sign-in.';

-- Capture self-description for onboarding personalization
alter table public.profiles
  add column if not exists user_about_context text not null default 'Not provided';

-- Backfill any existing rows with a non-empty placeholder
update public.profiles
set user_about_context = coalesce(nullif(user_about_context, ''), 'Not provided')
where user_about_context is null
   or user_about_context = '';

-- Disable legacy default seeding; onboarding now personalizes topics per user context
drop trigger if exists seed_topics_on_user_created on auth.users;
drop function if exists public.seed_topics_for_new_user();

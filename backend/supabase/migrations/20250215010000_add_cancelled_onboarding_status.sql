-- Allow cancelled onboarding transcripts and permit deletion cleanup
alter table public.onboarding_transcripts
  drop constraint if exists onboarding_transcripts_status_check;

alter table public.onboarding_transcripts
  add constraint onboarding_transcripts_status_check
    check (status in ('in_progress', 'completed', 'failed', 'cancelled'));

-- Capture onboarding speech-to-text transcripts per user session
create table if not exists public.onboarding_transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  transcript text not null default '',
  status text not null default 'in_progress',
  extracted_topics jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint onboarding_transcripts_status_check
    check (status in ('in_progress', 'completed', 'failed'))
);

create index if not exists idx_onboarding_transcripts_user on public.onboarding_transcripts (user_id);
create index if not exists idx_onboarding_transcripts_user_status on public.onboarding_transcripts (user_id, status);

alter table public.onboarding_transcripts enable row level security;

drop policy if exists "Users can read own onboarding transcripts" on public.onboarding_transcripts;
drop policy if exists "Users can insert own onboarding transcripts" on public.onboarding_transcripts;
drop policy if exists "Users can update own onboarding transcripts" on public.onboarding_transcripts;

create policy "Users can read own onboarding transcripts" on public.onboarding_transcripts
  for select using (auth.uid() = user_id);

create policy "Users can insert own onboarding transcripts" on public.onboarding_transcripts
  for insert with check (auth.uid() = user_id);

create policy "Users can update own onboarding transcripts" on public.onboarding_transcripts
  for update using (auth.uid() = user_id);

-- Track Mastra workflow run id for each episode
alter table public.episodes
  add column if not exists workflow_run_id text;

-- Optional: index for quick lookup by run id if needed
create index if not exists episodes_workflow_run_id_idx on public.episodes(workflow_run_id);

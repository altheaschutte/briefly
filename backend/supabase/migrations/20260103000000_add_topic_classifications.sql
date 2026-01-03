alter table public.topics
  add column if not exists classification_id text,
  add column if not exists classification_short_label text;

create index if not exists idx_topics_user_classification on public.topics (user_id, classification_id);


-- Recreate memory_messages with 1536-dim embeddings to match text-embedding-3-small
create extension if not exists vector;

drop table if exists public.memory_messages;

create table public.memory_messages (
  id text primary key,
  embedding vector(1536) not null,
  metadata jsonb,
  thread_id text,
  resource_id text,
  created_at timestamptz default now()
);

create index memory_messages_thread_idx
  on public.memory_messages (thread_id);

create index memory_messages_resource_idx
  on public.memory_messages (resource_id);

-- Default to cosine; adjust via a follow-up migration if using a different metric
create index memory_messages_embedding_idx
  on public.memory_messages
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

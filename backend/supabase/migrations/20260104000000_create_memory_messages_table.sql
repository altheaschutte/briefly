-- Enable pgvector for semantic recall embeddings
create extension if not exists vector;

-- Table used by Mastra semantic recall (default index name: memory_messages)
create table if not exists public.memory_messages (
  id text primary key,
  embedding vector(1536) not null,
  metadata jsonb,
  thread_id text,
  resource_id text,
  created_at timestamptz default now()
);

create index if not exists memory_messages_thread_idx
  on public.memory_messages (thread_id);

create index if not exists memory_messages_resource_idx
  on public.memory_messages (resource_id);

-- Adjust metric if you override SUPABASE_VECTOR_METRIC (dotproduct/euclidean/cosine)
create index if not exists memory_messages_embedding_idx
  on public.memory_messages
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

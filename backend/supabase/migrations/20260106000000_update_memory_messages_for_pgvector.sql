-- Align memory_messages with @mastra/pg expectations (vector_id PK, metadata JSON filters)
create extension if not exists vector;

-- Ensure vector_id exists and is populated from legacy id values
alter table if exists public.memory_messages
  add column if not exists vector_id text;

update public.memory_messages
  set vector_id = id
  where vector_id is null;

-- Move the primary key to vector_id and relax the legacy id column
alter table if exists public.memory_messages
  drop constraint if exists memory_messages_pkey;

alter table if exists public.memory_messages
  alter column id drop not null;

alter table if exists public.memory_messages
  alter column vector_id set not null;

alter table if exists public.memory_messages
  add constraint memory_messages_pkey primary key (vector_id);

-- Make sure embedding dimension matches text-embedding-3-small (1536)
alter table if exists public.memory_messages
  alter column embedding type vector(1536);

-- Rebuild indexes for the columns the new PgVector adapter actually queries
drop index if exists memory_messages_thread_idx;
drop index if exists memory_messages_resource_idx;
create index if not exists memory_messages_thread_idx on public.memory_messages ((metadata ->> 'thread_id'));
create index if not exists memory_messages_resource_idx on public.memory_messages ((metadata ->> 'resource_id'));

-- PgVector expects the vector index to be named ${indexName}_vector_idx
drop index if exists memory_messages_embedding_idx;
drop index if exists memory_messages_vector_idx;
create index if not exists memory_messages_vector_idx
  on public.memory_messages
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

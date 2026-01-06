import { openai } from '@ai-sdk/openai';
import { PgVector } from '@mastra/pg';

const connectionString =
  process.env.SUPABASE_POSTGRES_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.SUPABASE_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'SUPABASE_POSTGRES_URL (or SUPABASE_DB_URL/SUPABASE_DATABASE_URL/DATABASE_URL) is required to enable semantic recall.',
  );
}

export const supabaseVector = new PgVector({
  connectionString,
  schemaName: process.env.SUPABASE_SCHEMA || 'public',
});

export const semanticEmbedder = openai.embedding(
  process.env.SUPABASE_EMBEDDING_MODEL || 'text-embedding-3-small',
);

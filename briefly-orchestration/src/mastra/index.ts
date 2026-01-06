import { Mastra } from '@mastra/core';
import { PostgresStore } from '@mastra/pg';
import { producerAgent } from './agents/producerAgent';
import { episodeEditorAgent } from './agents/episodeEditorAgent';
import { supabaseVector } from './vectors';
import { researchAgent } from './agents/researchAgent';
import { scriptWriterAgent } from './agents/scriptWriterAgent';
import { recencyClassifierAgent } from './agents/recencyClassifierAgent';
import { topicSuggestionAgent } from './agents/topicSuggestionAgent';
import { audioRewriterAgent } from './agents/audioRewriterAgent';
import { producerChatResumeRoute, producerChatStreamRoute, producerChatThreadRoute } from './server/producerChatRoutes';
import { producerConversationWorkflow } from './workflows/producer-converation';
import { researchAndScriptWorkflow } from './workflows/research-script';


const postgresConnectionString =
  process.env.SUPABASE_POSTGRES_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.SUPABASE_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!postgresConnectionString) {
  throw new Error(
    'SUPABASE_POSTGRES_URL (or SUPABASE_DB_URL/SUPABASE_DATABASE_URL/DATABASE_URL) is required to persist memory.',
  );
}

export const mastra = new Mastra({
  storage: new PostgresStore({
    connectionString: postgresConnectionString,
    schemaName: process.env.SUPABASE_SCHEMA || 'public',
  }),

  vectors: {
    supabase: supabaseVector,
  },

  agents: {
    producerAgent,
    episodeEditorAgent,
    researchAgent,
    scriptWriterAgent,
    recencyClassifierAgent,
    topicSuggestionAgent,
    audioRewriterAgent,
  },
  workflows: { producerConversationWorkflow, researchAndScriptWorkflow },
  observability: {
    default: {
      enabled: true,
    },
  },
  server: {
    apiRoutes: [producerChatStreamRoute, producerChatResumeRoute, producerChatThreadRoute],
  },
});

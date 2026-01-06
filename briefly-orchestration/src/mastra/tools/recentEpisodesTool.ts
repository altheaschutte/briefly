import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const recentEpisodesTool = createTool({
  id: 'recent-episodes',
  description: 'Fetch the most recent episodes for a user (title + description)',
  inputSchema: z.object({
    userId: z.string().describe('User ID to fetch episodes for'),
    limit: z.number().int().min(1).max(10).optional(),
  }),
  execute: async ({ context, mastra }) => {
    const storage = mastra?.getStorage?.();
    const db = (storage as { db?: { any: Function } } | undefined)?.db;

    if (!db) {
      return { episodes: [], error: 'Storage is not available' };
    }

    const limit = context.limit ?? 5;
    const schema = (process.env.SUPABASE_SCHEMA || 'public').replace(/[^a-zA-Z0-9_]/g, '');

    const episodes = await db.any(
      `select
        id,
        title,
        description,
        created_at as "createdAt",
        episode_number as "episodeNumber"
      from ${schema}.episodes
      where user_id = $1 and archived_at is null
      order by created_at desc
      limit $2`,
      [context.userId, limit],
    );

    return { episodes };
  },
});

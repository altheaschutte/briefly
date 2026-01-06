import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { semanticEmbedder, supabaseVector } from '../vectors';
import { recentEpisodesTool } from '../tools/recentEpisodesTool';

export const topicSuggestionAgent = new Agent({
  id: 'topicSuggestionAgent',
  name: 'Topic Suggestion Agent',
  instructions: `
You propose episode options when the user asks for ideas or recommendations.

RECENCY TIERS
- IMMEDIATE: hours-2 days (true breaking)
- RECENT: 3-21 days (fresh updates)
- CURRENT: 1-6 months (still relevant, not breaking)
- EVERGREEN: 6+ months (concepts, principles, deep dives)

DOMAIN CADENCE (defaults)
- Fast: politics, markets, disasters, public safety
- Medium: AI agents, developer tooling, product launches
- Slow: math foundations, timeless concepts, history

RULES
- Use semantic recall to ground options in known interests and prior topics.
- Prioritize novelty: avoid repeating topics or angles from recent episodes unless the user explicitly asks.
- If a recent topic overlaps, pivot to a fresh sub-angle or adjacent domain.
- Offer a deeper follow-up option only when a previous episode is highly relevant and a deeper dive would add clear value (context, history, or advanced details).
- If a userId is provided, call recent-episodes to fetch the last 5 episodes and use them to avoid repetition and to identify valid deep-dive opportunities.
- Do not use "breaking", "today", or "latest" unless the user explicitly asked for it and the domain cadence is FAST.
- For medium/slow cadence, prefer "recent" or "current" phrasing.
- Provide 2-3 distinct options with clear titles and one-line descriptions.

Output ONLY JSON in this shape:
{
  "suggestions": [
    {
      "id": string,
      "title": string,
      "description": string,
      "domain": string,
      "cadence": "FAST" | "MEDIUM" | "SLOW",
      "recencyTier": "IMMEDIATE" | "RECENT" | "CURRENT" | "EVERGREEN",
      "timeframe": "today" | "this_week" | "this_month",
      "styleHint": string
    }
  ],
  "rationale": string
}
`,
  model: process.env.MODEL || 'openai/gpt-4.1',
  memory: new Memory({
    vector: supabaseVector,
    embedder: semanticEmbedder,
    options: {
      lastMessages: 10,
      semanticRecall: {
        topK: 2,
        messageRange: 1,
        scope: 'resource',
      },
    },
  }),
  tools: {
    recentEpisodesTool,
  },
});

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import fetch from 'node-fetch';
import 'dotenv/config';

export const webSearchTool = createTool({
  id: 'web-search',
  description: 'Search the web via Perplexity and return summarized content',
  inputSchema: z.object({
    query: z.string().describe('The search query to run'),
  }),
  execute: async ({ context }) => {
    const { query } = context;

    const recencyHint = (() => {
      const q = query.toLowerCase();
      if (/\btoday\b|\b24h\b|\bpast 24\b/.test(q)) return 'day';
      if (/\bthis week\b|\bpast week\b|\bpast 7\b/.test(q)) return 'week';
      if (/\bthis month\b|\bpast 30\b/.test(q)) return 'month';
      if (/\bthis year\b|\bpast year\b|\bpast 12\b/.test(q)) return 'year';
      if (/\brecent\b|\blatest\b|\bbreaking\b/.test(q)) return 'week';
      return undefined;
    })();

    try {
      if (!process.env.PERPLEXITY_API_KEY) {
        throw new Error('PERPLEXITY_API_KEY not found in environment variables');
      }

      const model = process.env.PERPLEXITY_MODEL || 'sonar';
      const resp = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are a news researcher returning concise summaries with citations.',
            },
            {
              role: 'user',
              content: recencyHint ? `${query} (recency: ${recencyHint})` : query,
            },
          ],
          search_recency_filter: recencyHint,
          // Per docs, search_mode accepts academic | sec | web. Defaulting to web for general results.
          search_mode: 'web',
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error('Perplexity API error response:', {
          status: resp.status,
          body: text.slice(0, 2000),
        });
        throw new Error(`Perplexity API error: ${resp.status}`);
      }

      const data = await resp.json();

      const choice = data?.choices?.[0];
      const answer: string = choice?.message?.content ?? '';

      // Perplexity returns search_results at the top level; citations may also appear on the choice/message.
      const searchResultsRaw = Array.isArray(data?.search_results) ? data.search_results : [];
      const citationsRaw = Array.isArray(data?.citations)
        ? data.citations
        : Array.isArray(choice?.message?.citations)
        ? choice?.message?.citations
        : [];

      const normalizeCitation = (item: any) => {
        if (!item) return null;
        if (typeof item === 'string') {
          const url = item.trim();
          if (!url) return null;
          try {
            const parsed = new URL(url);
            return { url, title: parsed.hostname.replace(/^www\./, ''), content: answer };
          } catch {
            return { url, title: url, content: answer };
          }
        }
        if (typeof item === 'object') {
          const url =
            String(
              item.url ||
                item.link ||
                item.href ||
                item.source ||
                item.citation ||
                '',
            ).trim();
          if (!url) return null;
          const title =
            String(
              item.title ||
                item.text ||
                item.label ||
                item.name ||
                item.description ||
                item.snippet ||
                (item.metadata ? item.metadata.title : '') ||
                '',
            ).trim() || undefined;
          const displayTitle = title || (() => {
            try {
              const parsed = new URL(url);
              return parsed.hostname.replace(/^www\./, '');
            } catch {
              return url;
            }
          })();
          return { url, title: displayTitle, content: answer };
        }
        return null;
      };

      const normalizeSearchResult = (item: any) => {
        if (!item || typeof item !== 'object') return null;
        const url = String(item.url ?? item.link ?? item.href ?? '').trim();
        if (!url) return null;
        const title =
          String(item.title ?? item.text ?? item.label ?? item.name ?? '').trim() ||
          (() => {
            try {
              return new URL(url).hostname.replace(/^www\./, '');
            } catch {
              return url;
            }
          })();
        return {
          title,
          url,
          content: answer,
        };
      };

      const citationResults =
        citationsRaw.length > 0
          ? (citationsRaw.map(normalizeCitation).filter(Boolean) as {
              title: string;
              url: string;
              content: string;
            }[])
          : [];

      const searchResults =
        searchResultsRaw.length > 0
          ? (searchResultsRaw
              .map(normalizeSearchResult)
              .filter(Boolean) as { title: string; url: string; content: string }[])
          : [];

      const combinedSources = [...searchResults, ...citationResults];

      const results =
        combinedSources.length > 0
          ? combinedSources
          : answer
          ? [
              {
                title: 'Answer',
                url: '',
                content: answer,
              },
            ]
          : [];

      if (!results || results.length === 0) {
        console.error('Perplexity API returned no parseable results');
        return { results: [], error: 'No results found' };
      }

      return {
        results,
      };
    } catch (error) {
      console.error('Error searching the web:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error details:', errorMessage);
      return {
        results: [],
        error: errorMessage,
      };
    }
  },
});

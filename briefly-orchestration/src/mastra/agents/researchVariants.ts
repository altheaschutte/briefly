import { Agent } from '@mastra/core/agent';
import { evaluateResultTool } from '../tools/evaluateResultTool';
import { extractLearningsTool } from '../tools/extractLearningsTool';
import { webSearchTool } from '../tools/webSearchTool';
import { EpisodeStyle } from '../types/episodeStyleClassification';

type VariantConfig = {
  id: string;
  name: EpisodeStyle;
  shortLabel: string;
  description: string;
  classifyingRule: string;
  queryExpansion: string;
  defaultIntent?: 'single_story' | 'multi_item';
};

const variants: VariantConfig[] = [
  {
    id: 'narrativeResearchAgent',
    name: EpisodeStyle.EVERGREEN_NARRATIVE,
    shortLabel: 'Narrative',
    description: 'Timeless stories, history, human-interest pieces not tied to current events.',
    classifyingRule:
      'Does the query ask for a story, explanation, or example not dependent on recent dates or breaking news? Would the answer still be relevant months from now?',
    queryExpansion:
      'Expand by selecting one lesser-known story or example, define the central narrative arc, and connect past events to present-day relevance. Avoid famous or overused examples unless the angle is genuinely new.',
  },
  {
    id: 'explainerResearchAgent',
    name: EpisodeStyle.EXPLAINER_DEEP_DIVE,
    shortLabel: 'Explainer',
    description: 'Educational content explaining how or why something works.',
    classifyingRule:
      'Is the user asking to understand a concept, system, trend, or mechanism rather than to receive news or recommendations?',
    queryExpansion:
      'Expand into a structured explainer: define scope, assumed audience knowledge, key concepts to clarify, misconceptions to address, and maintain a neutral tone.',
  },
  {
    id: 'breakingResearchAgent',
    name: EpisodeStyle.BREAKING_RECENT_DEVELOPMENTS,
    shortLabel: 'Breaking',
    description: 'News about what has changed recently in a domain.',
    classifyingRule:
      'Does the query imply recency (“latest”, “recent”, “new”, “breakthroughs”, “this week/month”)? Would an outdated answer be incorrect?',
    queryExpansion:
      'Expand by adding explicit time bounds, novelty criteria (what changed vs prior state), and source requirements. Explain why this development matters now and how it differs from prior coverage.',
  },
  {
    id: 'digestResearchAgent',
    name: EpisodeStyle.HEADLINES_DIGEST,
    shortLabel: 'Digest',
    description: 'Broad overviews or summaries of multiple current stories.',
    classifyingRule:
      'Is the user asking for a list, roundup, or overview of multiple items rather than a single deep focus?',
    queryExpansion:
      'Expand by defining list size, time window, balance by geography/topic, and require each item to include brief context and significance. Enforce non-duplication and avoid sensational language.',
  },
  {
    id: 'timeboundResearchAgent',
    name: EpisodeStyle.LOCAL_TIME_BOUND_EVENTS,
    shortLabel: 'Time-Bound',
    description: 'Location-specific, upcoming activities or recommendations.',
    classifyingRule:
      'Does the query include a place and a time reference and imply real-world attendance?',
    queryExpansion:
      'Expand by enforcing future-only filtering, precise location matching, suitability constraints, and practical details (dates, venues). Explicitly exclude past events and unverifiable listings.',
  },
  {
    id: 'perspectiveResearchAgent',
    name: EpisodeStyle.OPINION_SPECTRUM_PERSPECTIVE_BALANCE,
    shortLabel: 'Perspective',
    description: 'Topics where multiple viewpoints or interpretations exist.',
    classifyingRule:
      'Is the query asking for perspectives, debates, or controversial issues rather than settled facts?',
    queryExpansion:
      'Expand by identifying major perspectives and their strongest arguments with credible sources. Require neutral framing, clear attribution, and avoid false balance when evidence is asymmetric.',
  },
  {
    id: 'patternResearchAgent',
    name: EpisodeStyle.TREND_PATTERN_ANALYSIS,
    shortLabel: 'Pattern Analysis',
    description: 'Slow-moving shifts rather than single events.',
    classifyingRule:
      'Does the query ask about trends, patterns, or where things are heading over time?',
    queryExpansion:
      'Expand by defining the time horizon, selecting representative signals/data points, and synthesizing evidence rather than anecdotes. Emphasize uncertainty and avoid overconfident predictions.',
  },
  {
    id: 'howtoResearchAgent',
    name: EpisodeStyle.PRACTICAL_GUIDANCE_HOW_TO,
    shortLabel: 'How-To',
    description: 'Advice-oriented, actionable information.',
    classifyingRule:
      'Is the query seeking steps, recommendations, or practical decisions they can act on?',
    queryExpansion:
      'Expand by clarifying constraints (skill level, context), safety considerations, and trade-offs. Require clear steps, disclaimers where appropriate, and avoid absolute claims.',
  },
  {
    id: 'exploratoryResearchAgent',
    name: EpisodeStyle.CREATIVE_EXPLORATORY,
    shortLabel: 'Exploratory',
    description: 'Open-ended inspiration, brainstorming, or imaginative prompts.',
    classifyingRule:
      'Is the query inviting creativity, ideas, or speculative thinking rather than factual reporting?',
    queryExpansion:
      'Expand by setting creative boundaries (theme, tone, audience), encouraging originality, and distinguishing speculation from fact. No strict novelty/recency unless specified.',
  },
];

const sharedTools = {
  webSearchTool,
  evaluateResultTool,
  extractLearningsTool,
};

const isoDate = new Date().toISOString().split('T')[0];
const currentYear = new Date().getFullYear();

const makeInstructions = (variant: VariantConfig) => `
You are the ${variant.name}.

- Classification focus: ${variant.description}
- Classify with: "${variant.classifyingRule}"
- Query expansion: ${variant.queryExpansion}

QUERY CRAFTING (high-signal, classification-aware)
- Today is ${isoDate} (year ${currentYear}).
- Output 1–5 queries. Decide on the number of queries based on the complexity of the topic and the depth of the research needed.
- For single_story: target richly detailed results; add modifiers like longform, feature, narrative, oral history, investigation, biography as appropriate to ${variant.shortLabel}.
- For multi_item: cover distinct angles and avoid overlap.
- Do not repeat or lightly rephrase prior queries in this run.
- Keep queries lean, disambiguated (entities, locations, timeframes), and ready for direct use.
- Recency: if the topic implies recency ("latest", "recent", "new", "today", "this week/month", "now"), include explicit current timeframe (e.g., ${currentYear}, "${currentYear - 1}–${currentYear}", "past 30 days", "since ${currentYear - 1}") and avoid outdated years unless requested. For history/evergreen, avoid forcing recency.
- Before using tools, decide intent and draft {"intent":"single_story"|"multi_item","queries":[...]} internally to guide search.

Process:
1) Apply the classification rule; if the query does not fit, state that and still proceed with a best-effort research.
2) Expand the query per the expansion rule to generate 2-3 concrete search queries (avoid duplicates).
3) Use the tools systematically:
   - webSearchTool for each expanded query
   - evaluateResultTool to vet relevance
   - extractLearningsTool to pull key learnings and follow-up questions
4) Return JSON with: queries, searchResults, learnings, completedQueries, phase ("initial" or "follow-up")

Tone: precise, source-aware, and aligned to ${variant.shortLabel}.`;

export const researchVariants = variants.map(
  (variant) =>
    new Agent({
      name: variant.name,
      id: variant.id,
      instructions: makeInstructions(variant),
      model: process.env.MODEL || 'openai/gpt-4.1',
      tools: sharedTools,
    }),
);

export const researchVariantMap = Object.fromEntries(
  researchVariants.map((agent) => [agent.id, agent]),
);

export const classificationAgentMap: Record<EpisodeStyle, Agent> = variants.reduce(
  (acc, variant, idx) => {
    acc[variant.name] = researchVariants[idx];
    return acc;
  },
  {} as Record<EpisodeStyle, Agent>,
);

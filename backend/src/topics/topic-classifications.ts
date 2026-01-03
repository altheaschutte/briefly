export const TOPIC_CLASSIFICATIONS = [
  {
    id: 'topic_cls_evergreen_narrative',
    classification: 'Evergreen Narrative',
    description: 'Timeless stories, history, human-interest pieces that are not tied to current events.',
    classifyingRulesPrompt:
      'Does the query ask for a story, explanation, or example that is not dependent on recent dates, breaking news, or immediate action? Would the answer still be relevant months from now?',
    icon: '📖',
    queryExpansionInstruction:
      'Expand the query by selecting one lesser-known story or example, define the central narrative arc, and add a rule to connect past events to present-day relevance or insight. Avoid famous or overused examples unless the angle is genuinely new.',
    shortLabel: 'Narrative',
  },
  {
    id: 'topic_cls_explainer_deep_dive',
    classification: 'Explainer / Deep Dive',
    description: 'Educational content explaining how or why something works.',
    classifyingRulesPrompt:
      'Is the user asking to understand a concept, system, trend, or mechanism rather than to receive news or recommendations?',
    icon: '🧠',
    queryExpansionInstruction:
      'Expand into a structured explainer brief: define scope, assumed audience knowledge, key concepts to clarify, common misconceptions to address, and a neutral explanatory tone. Require clear definitions and avoid persuasive framing.',
    shortLabel: 'Explainer',
  },
  {
    id: 'topic_cls_breaking_recent_developments',
    classification: 'Breaking / Recent Developments',
    description: 'News about what has changed recently in a domain.',
    classifyingRulesPrompt:
      'Does the query imply recency (“latest”, “recent”, “new”, “breakthroughs”, “this week/month”)? Would an outdated answer be incorrect or misleading?',
    icon: '📰',
    queryExpansionInstruction:
      'Expand the query by adding explicit time bounds, novelty criteria (“what changed vs what already existed”), and source requirements. Require explanation of why this development matters now and how it differs from prior coverage.',
    shortLabel: 'Breaking',
  },
  {
    id: 'topic_cls_headlines_digest',
    classification: 'Headlines / Digest',
    description: 'Broad overviews or summaries of multiple current stories.',
    classifyingRulesPrompt:
      'Is the user asking for a list, roundup, or overview of multiple items rather than a single deep focus?',
    icon: '🗂️',
    queryExpansionInstruction:
      'Expand by defining list size, time window, geographic or topical balance, and a requirement that each item include brief context and significance. Enforce non-duplication and avoid sensational language.',
    shortLabel: 'Digest',
  },
  {
    id: 'topic_cls_local_time_bound_events',
    classification: 'Local / Time-Bound Events',
    description: 'Location-specific, upcoming activities or recommendations.',
    classifyingRulesPrompt:
      'Does the query include a place and a time reference (“this weekend”, “near me”, dates) and imply real-world attendance?',
    icon: '📍',
    queryExpansionInstruction:
      'Expand the query by enforcing future-only filtering, precise location matching, suitability constraints (age, accessibility), and practical details (dates, venues). Explicitly exclude past events and unverifiable listings.',
    shortLabel: 'Time-Bound',
  },
  {
    id: 'topic_cls_opinion_spectrum_perspective_balance',
    classification: 'Opinion Spectrum / Perspective Balance',
    description: 'Topics where multiple viewpoints or interpretations exist.',
    classifyingRulesPrompt:
      'Is the query asking for perspectives, debates, or controversial issues rather than settled facts?',
    icon: '⚖️',
    queryExpansionInstruction:
      'Expand by identifying major perspectives, their strongest arguments, and credible sources for each. Require neutral framing, clear attribution, and avoidance of false balance where evidence is asymmetric.',
    shortLabel: 'Perspective',
  },
  {
    id: 'topic_cls_trend_pattern_analysis',
    classification: 'Trend / Pattern Analysis',
    description: 'Slow-moving shifts rather than single events.',
    classifyingRulesPrompt:
      'Does the query ask about “trends”, “patterns”, “where things are heading”, or gradual change over time?',
    icon: '📈',
    queryExpansionInstruction:
      'Expand by defining the time horizon, selecting representative signals or data points, and requiring synthesis rather than anecdotes. Emphasise uncertainty and avoid overconfident predictions.',
    shortLabel: 'Pattern Analysis',
  },
  {
    id: 'topic_cls_practical_guidance_how_to',
    classification: 'Practical Guidance / How-To',
    description: 'Advice-oriented, actionable information.',
    classifyingRulesPrompt:
      'Is the user seeking steps, recommendations, or practical decisions they can act on?',
    icon: '🛠️',
    queryExpansionInstruction:
      'Expand by clarifying constraints (skill level, context), safety considerations, and trade-offs. Require clear steps, disclaimers where appropriate, and avoidance of absolute claims.',
    shortLabel: 'How-To',
  },
  {
    id: 'topic_cls_creative_exploratory',
    classification: 'Creative / Exploratory',
    description: 'Open-ended inspiration, brainstorming, or imaginative prompts.',
    classifyingRulesPrompt:
      'Is the user inviting creativity, ideas, or speculative thinking rather than factual reporting?',
    icon: '🎨',
    queryExpansionInstruction:
      'Expand by setting creative boundaries (theme, tone, audience), encouraging originality, and explicitly distinguishing speculation from fact. No strict novelty or recency constraints unless specified.',
    shortLabel: 'Exploratory',
  },
] as const;

export type TopicClassification = (typeof TOPIC_CLASSIFICATIONS)[number];
export type TopicClassificationId = TopicClassification['id'];

export const TOPIC_CLASSIFICATIONS_BY_ID = TOPIC_CLASSIFICATIONS.reduce(
  (acc, classification) => {
    acc[classification.id] = classification;
    return acc;
  },
  {} as Record<TopicClassificationId, TopicClassification>,
);

export const DEFAULT_TOPIC_CLASSIFICATION_ID: TopicClassificationId = 'topic_cls_explainer_deep_dive';
export const DEFAULT_TOPIC_CLASSIFICATION = TOPIC_CLASSIFICATIONS_BY_ID[DEFAULT_TOPIC_CLASSIFICATION_ID];

export function resolveTopicClassification(id: string | null | undefined): TopicClassification | undefined {
  if (!id) {
    return undefined;
  }
  return (TOPIC_CLASSIFICATIONS_BY_ID as Record<string, TopicClassification | undefined>)[id];
}

export function resolveTopicClassificationByShortLabel(
  shortLabel: string | null | undefined,
): TopicClassification | undefined {
  const normalized = (shortLabel || '').trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return TOPIC_CLASSIFICATIONS.find((classification) => classification.shortLabel.toLowerCase() === normalized);
}

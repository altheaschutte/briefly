import { classificationAgentMap } from './researchVariants';
import { EpisodeStyle } from '../types/episodeStyleClassification';

// Map classification labels 1:1 to agent ids
const episodeStyleToAgentId: Record<EpisodeStyle, string> = Object.fromEntries(
  Object.entries(classificationAgentMap).map(([classification, agent]) => [classification, agent.id]),
) as Record<EpisodeStyle, string>;

// Heuristic f

export function selectResearchAgentId(opts: {
  classification: EpisodeStyle;
}): string {


  const episodeStyleAgentId = episodeStyleToAgentId[opts.classification];
  if (episodeStyleAgentId) {
    return episodeStyleAgentId;
  }

  return 'researchAgent';
}

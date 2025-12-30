export type TopicIntent = 'single_story' | 'multi_item';

export interface TopicQueryPlan {
  intent: TopicIntent;
  queries: string[];
}

export type Speaker = 'SPEAKER_1' | 'SPEAKER_2';

export interface DialogueTurn {
  speaker: Speaker;
  text: string;
}

export interface SegmentDialogueScript {
  title?: string;
  intent?: TopicIntent;
  turns: DialogueTurn[];
}

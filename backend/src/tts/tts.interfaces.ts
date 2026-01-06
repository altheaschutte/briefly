import { SegmentDialogueScript } from '../llm/llm.types';

export interface TtsSynthesisResult {
  audioUrl: string;
  storageKey?: string;
  durationSeconds?: number;
}

export interface TtsProvider {
  synthesize(
    script: SegmentDialogueScript,
    options: { voice: string; storageKey?: string },
  ): Promise<TtsSynthesisResult>;
}

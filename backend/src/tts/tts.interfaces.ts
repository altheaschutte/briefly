import { SegmentDialogueScript } from '../llm/llm.types';

export interface TtsSynthesisResult {
  audioUrl: string;
  storageKey?: string;
  durationSeconds?: number;
}

export interface TtsProvider {
  synthesize(
    script: SegmentDialogueScript,
    options: { voiceA: string; voiceB: string; storageKey?: string },
  ): Promise<TtsSynthesisResult>;
}

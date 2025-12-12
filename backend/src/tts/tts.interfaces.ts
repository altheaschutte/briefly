export interface TtsSynthesisResult {
  audioUrl: string;
  storageKey?: string;
  durationSeconds?: number;
}

export interface TtsProvider {
  synthesize(
    script: string,
    options: { voiceA: string; voiceB: string; storageKey?: string },
  ): Promise<TtsSynthesisResult>;
}

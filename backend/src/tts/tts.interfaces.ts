export interface TtsSynthesisResult {
  audioUrl: string;
  storageKey?: string;
}

export interface TtsProvider {
  synthesize(script: string, options: { voiceA: string; voiceB: string }): Promise<TtsSynthesisResult>;
}

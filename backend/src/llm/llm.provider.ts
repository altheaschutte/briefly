export interface ScriptGenerationResult {
  script: string;
  prompt: string;
}

export interface LlmProvider {
  rewriteTopic(topic: string): Promise<string>;
  generateScript(segments: any[], targetDurationMinutes?: number): Promise<ScriptGenerationResult>;
}

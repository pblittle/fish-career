import type { JevAnswers } from '../domain/answers.js';

// The judge port. `ask` receives the assembled state string (profile plus
// posting plus rubric questions live inside the adapter) and returns typed
// answers with the cost data every trace needs.
export interface JudgeAnswer {
  answers: JevAnswers;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  model: string;
  attempts: number;
}

export interface Judge {
  ask(state: string): Promise<JudgeAnswer>;
}

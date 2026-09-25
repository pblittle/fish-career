import type { Posting } from '../domain/posting.js';

// One public ATS API surface. `detail` exists only where the list endpoint
// omits the posting body (SmartRecruiters); the type says so, which is why the
// fetch use case needs no cast to ask.
export interface AtsProvider {
  readonly id: string;
  list(slug: string): Promise<Posting[]>;
  detail?(posting: Posting): Promise<string>;
}

export type AtsProviders = Readonly<Record<string, AtsProvider>>;

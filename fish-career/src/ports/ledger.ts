import type { LedgerProvenance, LedgerRead } from '../domain/ledger.js';
import type { PostingId } from '../domain/posting.js';

export interface Ledger {
  read(): Promise<LedgerRead>;
  mark(scores: Record<PostingId, number>, provenance: LedgerProvenance): Promise<void>;
}

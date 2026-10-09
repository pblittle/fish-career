// A stable, machine-readable failure. Use cases throw these; interfaces map
// them to protocol-level error codes and recovery hints instead of parsing
// message text.

export type ErrorCode =
  | 'NO_JUDGE'
  | 'NO_PROFILE'
  | 'EMPTY_WATCHLIST'
  | 'NOTHING_TO_SCORE'
  | 'NO_PREFERENCES'
  | 'POSTING_NOT_FOUND'
  | 'INVALID_RANKING'
  | 'NO_PENDING_CALIBRATION'
  | 'NO_CALIBRATION_HISTORY'
  | 'LEDGER_UNREADABLE'
  | 'INVALID_COMPANY'
  | 'INVALID_GRADE'
  | 'VERDICTS_UNREADABLE'
  | 'UNKNOWN';

// Two use cases refuse without a judge; they must say the same thing.
export const NO_JUDGE_MESSAGE =
  'No judge is configured. Put a TypeSafe API key in FISH_HOME/.env, or set FISH_JUDGE=fake for the stand-in judge.';

export class ApplicationError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
  }
}

export const isApplicationError = (err: unknown): err is ApplicationError =>
  err instanceof ApplicationError;

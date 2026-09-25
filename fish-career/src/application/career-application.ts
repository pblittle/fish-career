// The application: one object of use cases over the ports. MCP, CLI, the
// demo, and any future surface call these methods; none of them read a
// directory, build a prompt, or decide a ranking themselves.

import type { CalibrationRecord } from '../domain/calibration.js';
import type { TraceRecord } from '../ports/trace-sink.js';
import { rescoreCalibration, startCalibration, submitCalibration } from './calibrate-ranking.js';
import type { CareerDependencies } from './dependencies.js';
import { evaluateRanking } from './evaluate-ranking.js';
import { explainPosting, previewPosting } from './explain-posting.js';
import { fetchPostings } from './fetch-postings.js';
import { getProfile, listPostings, readPosting, updateProfile } from './postings.js';
import { rankPostings } from './rank-postings.js';
import { type RubricSummary, rubricSummary } from './rubric-summary.js';
import { addCompany, listWatchlist, probeCompany, removeCompany } from './watchlist.js';

export interface CareerApplication {
  fetchPostings: ReturnType<typeof fetchPostings>;
  rankPostings: ReturnType<typeof rankPostings>;
  evaluateRanking: ReturnType<typeof evaluateRanking>;
  startCalibration: ReturnType<typeof startCalibration>;
  submitCalibration: ReturnType<typeof submitCalibration>;
  rescoreCalibration: ReturnType<typeof rescoreCalibration>;
  pendingCalibration: () => ReturnType<CareerDependencies['calibrations']['readPending']>;
  latestCalibration: () => Promise<CalibrationRecord | null>;
  recentTraces: (limit?: number) => Promise<TraceRecord[]>;
  probeCompany: ReturnType<typeof probeCompany>;
  addCompany: ReturnType<typeof addCompany>;
  removeCompany: ReturnType<typeof removeCompany>;
  listWatchlist: ReturnType<typeof listWatchlist>;
  getProfile: ReturnType<typeof getProfile>;
  updateProfile: ReturnType<typeof updateProfile>;
  listPostings: ReturnType<typeof listPostings>;
  readPosting: ReturnType<typeof readPosting>;
  explainPosting: ReturnType<typeof explainPosting>;
  previewPosting: ReturnType<typeof previewPosting>;
  rubric: () => RubricSummary;
}

export const createApplication = (deps: CareerDependencies): CareerApplication => ({
  fetchPostings: fetchPostings(deps),
  rankPostings: rankPostings(deps),
  evaluateRanking: evaluateRanking(deps),
  startCalibration: startCalibration(deps),
  submitCalibration: submitCalibration(deps),
  rescoreCalibration: rescoreCalibration(deps),
  pendingCalibration: () => deps.calibrations.readPending(),
  latestCalibration: () => deps.calibrations.latest(),
  recentTraces: (limit = 100) => deps.traceReader.recent(limit),
  probeCompany: probeCompany(deps),
  addCompany: addCompany(deps),
  removeCompany: removeCompany(deps),
  listWatchlist: listWatchlist(deps),
  getProfile: getProfile(deps),
  updateProfile: updateProfile(deps),
  listPostings: listPostings(deps),
  readPosting: readPosting(deps),
  explainPosting: explainPosting(deps),
  previewPosting: previewPosting(deps),
  rubric: rubricSummary,
});

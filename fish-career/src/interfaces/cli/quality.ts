// The quality report command: reads the bundled eval dataset and the
// recorded baseline run, rebuilds the ranked rows from the recorded answers,
// and reports agreement with the operator's labels. Deterministic and
// offline; re-record the baseline with `npm run record:eval` when the
// dataset or the rubric changes.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type JevAnswers, rowFromAnswers } from '../../domain/answers.js';
import type { Labels } from '../../domain/metrics.js';
import { postingIdFromFile } from '../../domain/posting.js';
import { type QualityReport, qualityReport, renderQualityReport } from '../../domain/quality.js';

export interface LabelsFile {
  postings: { postingId: string; file: string; relevance: number; notes?: string }[];
}

export interface BaselineFile {
  capturedAt: string;
  model: string;
  rubric: number;
  entries: {
    postingId: string;
    file: string;
    title: string;
    company: string;
    answers: JevAnswers;
  }[];
}

export interface QualityOptions {
  dir: string;
  k?: number;
  json?: boolean;
}

export const runQuality = async (
  opts: QualityOptions,
): Promise<{ report: QualityReport; text: string }> => {
  const labelsFile = JSON.parse(readFileSync(join(opts.dir, 'labels.json'), 'utf8')) as LabelsFile;
  const baseline = JSON.parse(
    readFileSync(join(opts.dir, 'base-run.json'), 'utf8'),
  ) as BaselineFile;
  const labels: Labels = Object.fromEntries(
    labelsFile.postings.map((p) => [p.postingId, p.relevance]),
  );
  const rows = baseline.entries.map((e) =>
    rowFromAnswers(postingIdFromFile(e.file), e.answers, { title: e.title, company: e.company }),
  );
  const report = qualityReport(rows, labels, { k: opts.k ?? 5 });
  const text = opts.json
    ? JSON.stringify(
        {
          baseline: {
            capturedAt: baseline.capturedAt,
            model: baseline.model,
            rubric: baseline.rubric,
          },
          ...report,
        },
        null,
        2,
      )
    : renderQualityReport(report);
  return { report, text };
};

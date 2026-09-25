// The MCP tools: input schema, output schema, safety annotations, and one
// call into the application per handler. Rendering lives here; decisions do
// not.

import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { CareerApplication } from '../../application/career-application.js';
import { renderCalibration } from '../../domain/calibration.js';
import { postingIdFromFile } from '../../domain/posting.js';
import { renderEval } from '../../domain/preferences.js';
import { collapseVariants, renderTable } from '../../domain/ranking.js';
import {
  calibrationResultOutput,
  calibrationStartOutput,
  evaluateRankingOutput,
  failure,
  fetchPostingsOutput,
  ok,
  profileUpdateOutput,
  triagePostingsOutput,
  watchlistAddOutput,
  watchlistProbeOutput,
  watchlistRemoveOutput,
} from './schemas.js';

const providerEnum = z.enum(['ashby', 'greenhouse', 'lever', 'smartrecruiters']);

export const registerTools = (server: McpServer, app: CareerApplication): void => {
  server.registerTool(
    'watchlist_probe',
    {
      title: 'Probe the public ATS boards for a company',
      description:
        'Checks all four public ATS APIs for a board slug and returns live posting counts plus sample titles. Read-only: nothing is written. Read a title or two before calling watchlist_add, because slugs collide (a "gamma" board might not be the company you mean).',
      inputSchema: z.object({
        slug: z.string().describe('The board token to look for on each provider'),
      }),
      outputSchema: watchlistProbeOutput,
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ slug }) => {
      try {
        const probe = await app.probeCompany({ slug });
        const counts = Object.entries(probe.counts).map(([p, n]) => `${p}: ${n} postings`);
        const samples = probe.samples
          .map((s) => `${s.provider}: ${s.titles.slice(0, 3).join(' | ')}`)
          .join('\n');
        return ok(
          [
            `Probe of "${probe.slug}":`,
            counts.join('\n') || 'no board found on any provider',
            ...(samples ? ['', 'Sample titles:', samples] : []),
          ].join('\n'),
          probe as unknown as Record<string, unknown>,
        );
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'watchlist_add',
    {
      title: 'Add a company to the watchlist',
      description:
        'Writes a verified company to the watchlist. Probe first with watchlist_probe and confirm the board identity from its titles; this tool writes what you give it. Adding a name already on the watchlist is a no-op.',
      inputSchema: z.object({
        name: z.string().describe('Company display name'),
        provider: providerEnum.describe('ATS provider, from the probe result'),
        slug: z.string().describe('The board token on that provider'),
      }),
      outputSchema: watchlistAddOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ name, provider, slug }) => {
      try {
        const { added } = await app.addCompany({ name, provider, slug });
        return ok(
          added ? `Added ${name} (${provider}/${slug}).` : `${name} is already on the watchlist.`,
          { name, provider, slug, added },
        );
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'watchlist_remove',
    {
      title: 'Remove a company from the watchlist',
      description:
        'Removes a company by display name (case-insensitive). The postings already fetched stay in the cache; only future polls stop.',
      inputSchema: z.object({ name: z.string().describe('Company display name') }),
      outputSchema: watchlistRemoveOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ name }) => {
      try {
        const { removed } = await app.removeCompany({ name });
        return ok(removed ? `Removed ${name}.` : `${name} was not on the watchlist.`, {
          name,
          removed,
        });
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'fetch_postings',
    {
      title: 'Poll watchlist boards for new remote postings',
      description:
        "Polls every watchlist company's public ATS board, keeps remote postings only, writes the ones never seen before into the postings cache, and returns the diff. Every remote posting a poll observes is marked seen, written or not, so later polls deliver arrivals only. First-ever poll writes only postings newer than 14 days. Compensation is included when the board provides it (Ashby usually, Greenhouse never).",
      inputSchema: z.object({}),
      outputSchema: fetchPostingsOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const outcome = await app.fetchPostings();
        const lines = outcome.arrivals.map(
          (a) => `${a.company}: ${a.title} (${a.comp}) -> ${a.postingId}`,
        );
        return ok(
          [
            `${outcome.arrivals.length} new posting${outcome.arrivals.length === 1 ? '' : 's'}.`,
            ...lines,
            ...(outcome.failures.length > 0
              ? ['', `Boards that failed: ${outcome.failures.join('; ')}`]
              : []),
            ...(outcome.firstRun
              ? ['', 'First poll: only postings newer than 14 days were written.']
              : []),
            outcome.arrivals.length > 0 ? '\nTriage them with triage_postings.' : '',
          ]
            .filter(Boolean)
            .join('\n'),
          outcome as unknown as Record<string, unknown>,
        );
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'triage_postings',
    {
      title: 'Score postings against the profile with the judge',
      description:
        'Scores postings and returns the ranked table: per-dimension values and confidences, a composite, and a blocker probability. By default scores only postings never scored before under the current profile and rubric; pass explicit posting IDs to score a chosen slice without touching the ledger, or rescore=true to redo the cache. A "?" marks a low-confidence dimension; a blocker at 0.5+ demotes the row below clean rows whatever the composite. Requires a judge (a TypeSafe key, or FISH_JUDGE=fake).',
      inputSchema: z.object({
        postingIds: z
          .array(z.string())
          .optional()
          .describe(
            'Explicit posting IDs; overrides the unscored default and never marks the ledger',
          ),
        rescore: z
          .boolean()
          .default(false)
          .describe('Score every posting again, ignoring the ledger'),
      }),
      outputSchema: triagePostingsOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ postingIds, rescore }) => {
      try {
        const outcome = await app.rankPostings({
          ...(postingIds ? { postingIds } : {}),
          rescore,
        });
        const collapsed = collapseVariants(outcome.rows);
        return ok(
          [
            renderTable(collapsed),
            ...(outcome.errors.length > 0 ? ['', `Failed: ${outcome.errors.join('; ')}`] : []),
            ...(outcome.ledgerOk
              ? []
              : [
                  '',
                  'WARNING: the scored ledger could not be read; it was treated as empty and this run rewrote it.',
                ]),
            '',
            `Run ${outcome.runId} (read it at fish://runs/${outcome.runId}).`,
          ].join('\n'),
          {
            runId: outcome.runId,
            rows: collapsed,
            errors: outcome.errors,
            scored: outcome.scored,
            skipped: outcome.skipped,
            ledgerOk: outcome.ledgerOk,
          },
        );
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'evaluate_ranking',
    {
      title: "Measure the rubric against the operator's written judgment",
      description:
        'Scores the postings named in preferences and reports how often the ranking satisfies the pairwise preferences the profile already states; each violation quotes its source line. This is the eval: run it after any profile or weight change. calibration_submit remains the stronger measurement when the operator will hand-rank a slice.',
      inputSchema: z.object({}),
      outputSchema: evaluateRankingOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const { evaluation, errors } = await app.evaluateRanking();
        return ok(
          [
            renderEval(evaluation),
            ...(errors.length > 0 ? ['', `Failed: ${errors.join('; ')}`] : []),
          ].join('\n'),
          {
            satisfied: evaluation.satisfied,
            total: evaluation.total,
            violations: evaluation.violations.map((v) => ({
              better: v.preference.better,
              worse: v.preference.worse,
              betterRank: v.betterRank,
              worseRank: v.worseRank,
              source: v.preference.source,
            })),
          },
        );
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'calibration_start',
    {
      title: 'Start a calibration round',
      description:
        'Draws a stratified sample of cached postings with a recorded seed and returns them numbered. The operator ranks them by their own judgment, best opportunity first, BEFORE anything is scored; then calibration_submit records that ranking, scores the same slice, and measures agreement. The seed makes the draw reproducible; pass it back to redraw the same slice.',
      inputSchema: z.object({
        count: z.number().int().min(2).max(30).default(10).describe('How many postings to draw'),
        seed: z.number().int().optional().describe('Redraw a previous slice by its recorded seed'),
      }),
      outputSchema: calibrationStartOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ count, seed }) => {
      try {
        const started = await app.startCalibration({
          count,
          ...(seed !== undefined ? { seed } : {}),
        });
        const summaries = await app.listPostings();
        const byId = new Map(summaries.map((s) => [s.postingId, s]));
        const slice = started.postingIds.map((postingId) => ({
          postingId,
          company: byId.get(postingId)?.company ?? '',
          title: byId.get(postingId)?.title ?? '',
        }));
        const lines = slice.map((s, i) => `${i + 1}. ${s.company}: ${s.title} (${s.postingId})`);
        return ok(
          [
            `Calibration slice drawn (seed ${started.seed}). Rank every posting below by YOUR judgment, best first, before any scoring happens.`,
            '',
            ...lines,
            '',
            'Then call calibration_submit with ranking: the posting IDs in your order, best first.',
          ].join('\n'),
          { postingIds: started.postingIds, seed: started.seed, slice },
        );
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'calibration_submit',
    {
      title: 'Submit the human ranking and measure agreement',
      description:
        "Records the operator's ranking of the pending calibration slice, scores the same postings with the judge, and reports Spearman agreement plus the biggest disagreements with the dimension cells that drove them. The calibration is persisted; after adjusting weights or profile lines, calibration_rescore re-measures the same slice.",
      inputSchema: z.object({
        ranking: z
          .array(z.string())
          .describe("The slice's posting IDs in the operator's order, best first"),
      }),
      outputSchema: calibrationResultOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ ranking }) => {
      try {
        const { record, errors } = await app.submitCalibration({
          ranking: ranking.map(postingIdFromFile),
        });
        return ok(
          [
            renderCalibration(record.humanRanking, record.rows, record.rho),
            ...(errors.length > 0 ? ['', `Failed: ${errors.join('; ')}`] : []),
          ].join('\n'),
          { ...record, errors },
        );
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'calibration_rescore',
    {
      title: 'Re-measure the last calibration under the current rubric',
      description:
        'Re-scores the most recent calibration slice with the current weights and profile, and reports the new Spearman agreement against the recorded human ranking. Use after changing weights or sharpening the profile, to see whether the rubric moved toward the operator.',
      inputSchema: z.object({}),
      outputSchema: calibrationResultOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const { record, errors, previousRho } = await app.rescoreCalibration();
        return ok(
          [
            `Previous rho: ${previousRho === null || previousRho === undefined ? 'n/a' : previousRho.toFixed(2)}`,
            renderCalibration(record.humanRanking, record.rows, record.rho),
            ...(errors.length > 0 ? ['', `Failed: ${errors.join('; ')}`] : []),
          ].join('\n'),
          { ...record, previousRho: previousRho ?? null, errors },
        );
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'profile_update',
    {
      title: 'Write the candidate profile',
      description:
        'Replaces the profile wholesale. The profile is the judgment target and is sent verbatim to the judge on every scoring call, so keep contact details out and role-relevant facts in: target roles, level, location and remote constraint, compensation floor, core skills, domains, hard constraints.',
      inputSchema: z.object({ content: z.string().describe('Full new profile markdown') }),
      outputSchema: profileUpdateOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ content }) => {
      try {
        await app.updateProfile(content);
        return ok('Profile written.', { written: true });
      } catch (err) {
        return failure(err);
      }
    },
  );
};

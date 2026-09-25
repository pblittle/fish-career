// The MCP surface: registration only. Every handler calls one application
// use case and renders the result; none of them reads a directory, builds a
// prompt, or decides an order.

import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import type { CareerApplication } from '../../application/career-application.js';
import { renderCalibration } from '../../domain/calibration.js';
import { ApplicationError } from '../../domain/errors.js';
import { postingIdFromFile } from '../../domain/posting.js';
import { renderEval } from '../../domain/preferences.js';
import { collapseVariants, renderTable } from '../../domain/ranking.js';

export interface ServerOptions {
  version: string;
  name?: string;
}

const text = (value: string, isError = false) => ({
  content: [{ type: 'text' as const, text: value }],
  ...(isError ? { isError: true } : {}),
});

const failure = (err: unknown) => {
  if (err instanceof ApplicationError) return text(err.message);
  return text(String((err as Error).message ?? err), true);
};

export const createServer = (app: CareerApplication, opts: ServerOptions): McpServer => {
  const server = new McpServer({ name: opts.name ?? 'fish.career', version: opts.version });

  server.registerTool(
    'watchlist_add',
    {
      title: 'Add a company to the watchlist',
      description:
        'Adds a company to the watchlist by probing the four public ATS APIs for the slug. With confirm=false (the default) it reports live posting counts and sample titles per provider and writes nothing; call again with confirm=true to write the entry. Always read a title or two from the board before confirming: slugs collide (a "gamma" board might not be the company you mean).',
      inputSchema: {
        name: z.string().describe('Company display name'),
        provider: z
          .enum(['ashby', 'greenhouse', 'lever', 'smartrecruiters'])
          .describe('ATS provider, from the probe result'),
        slug: z.string().describe('The board token on that provider'),
        confirm: z
          .boolean()
          .default(false)
          .describe('Probe only by default; true writes the entry'),
      },
    },
    async ({ name, provider, slug, confirm }) => {
      try {
        if (confirm) {
          const { added } = await app.addCompany({ name, provider, slug });
          return text(
            added ? `Added ${name} (${provider}/${slug}).` : `${name} is already on the watchlist.`,
          );
        }
        const probe = await app.probeCompany({ slug });
        const counts = Object.entries(probe.counts).map(([p, n]) => `${p}: ${n} postings`);
        const samples = probe.samples
          .map((s) => `${s.provider}: ${s.titles.slice(0, 2).join(' | ')}`)
          .join('\n');
        return text(
          [
            `Probe of "${slug}":`,
            counts.join('\n') || 'no board found on any provider',
            ...(samples ? ['', 'Sample titles:', samples] : []),
            '',
            'Call again with confirm=true and a provider to write.',
          ].join('\n'),
        );
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'watchlist_list',
    {
      title: 'List the watchlist',
      description: 'Every company on the watchlist with its provider and board slug.',
    },
    async () => {
      try {
        const entries = await app.listWatchlist();
        return text(
          entries.length === 0
            ? 'The watchlist is empty.'
            : entries.map((e) => `${e.name} (${e.provider}/${e.slug})`).join('\n'),
        );
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
        'Polls every watchlist company\u2019s public ATS board, keeps remote postings only, writes the ones never seen before into the postings cache, and returns the diff. Every remote posting a poll observes is marked seen, written or not, so later polls deliver arrivals only. First-ever poll writes only postings newer than 14 days. Compensation is included when the board provides it (Ashby usually, Greenhouse never).',
    },
    async () => {
      try {
        const outcome = await app.fetchPostings();
        const lines = outcome.arrivals.map(
          (a) => `${a.company}: ${a.title} (${a.comp}) -> ${a.postingId}`,
        );
        return text(
          [
            `${outcome.arrivals.length} new posting${outcome.arrivals.length === 1 ? '' : 's'}.`,
            ...lines,
            ...(outcome.failures.length > 0
              ? ['', `Boards that failed: ${outcome.failures.join('; ')}`]
              : []),
            ...(outcome.firstRun
              ? ['', 'First poll: only postings newer than 14 days were written.']
              : []),
            outcome.arrivals.length > 0 ? '\nTriage them with the triage tool.' : '',
          ]
            .filter(Boolean)
            .join('\n'),
        );
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'triage',
    {
      title: 'Score postings against the profile with the judge',
      description:
        'Scores postings and returns a ranked table with per-dimension scores and confidences. By default scores only postings never scored before under the current profile and rubric (the ledger skips repeats). Pass explicit posting IDs to score a chosen slice without touching the ledger; pass rescore=true to redo everything. Low-confidence dimensions are marked "?" and a blocker at 0.5+ flags a likely unmet hard requirement.',
      inputSchema: {
        postingIds: z
          .array(z.string())
          .optional()
          .describe(
            'Optional posting IDs; overrides the unscored default and never marks the ledger',
          ),
        rescore: z
          .boolean()
          .default(false)
          .describe('Score every posting again, ignoring the ledger'),
      },
    },
    async ({ postingIds, rescore }) => {
      try {
        const outcome = await app.rankPostings({ postingIds, rescore });
        return text(
          [
            renderTable(collapseVariants(outcome.rows)),
            ...(outcome.errors.length > 0 ? ['', `Failed: ${outcome.errors.join('; ')}`] : []),
            ...(outcome.ledgerOk
              ? []
              : [
                  '',
                  'WARNING: the scored ledger could not be read; it was treated as empty and this run rewrote it.',
                ]),
          ].join('\n'),
        );
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'evaluate',
    {
      title: "Measure the rubric against the operator's written judgment",
      description:
        'Scores the postings named in preferences and reports how often the ranking satisfies the pairwise preferences the profile already states; each preference quotes its source line. This is the eval: run it after any profile or weight change. The calibrate_* tools remain the stronger measurement when the operator will hand-rank a slice.',
    },
    async () => {
      try {
        const { evaluation, errors } = await app.evaluateRanking();
        return text(
          [
            renderEval(evaluation),
            ...(errors.length > 0 ? ['', `Failed: ${errors.join('; ')}`] : []),
          ].join('\n'),
        );
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'read_posting',
    {
      title: 'Read one posting in full',
      description: 'Returns the full text and header of one posting from the cache.',
      inputSchema: { postingId: z.string().describe('Posting ID from the cache') },
    },
    async ({ postingId }) => {
      try {
        const record = await app.readPosting({ postingId: postingIdFromFile(postingId) });
        return text(record.text);
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'get_profile',
    {
      title: 'Read the candidate profile',
      description: 'The profile every triage judgment is made against.',
    },
    async () => {
      const profile = await app.getProfile();
      return text(profile || 'No profile yet. Write one with update_profile.');
    },
  );

  server.registerTool(
    'update_profile',
    {
      title: 'Write the candidate profile',
      description:
        'Replaces profile.md wholesale. The profile is sent verbatim to the judge on every scoring call, so keep contact details out and role-relevant facts in.',
      inputSchema: { content: z.string().describe('Full new profile markdown') },
    },
    async ({ content }) => {
      try {
        await app.updateProfile(content);
        return text('Profile written.');
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'calibrate_start',
    {
      title: 'Start a calibration round',
      description:
        'Draws a stratified sample of postings (one per company, count defaults to 10) with a recorded seed and returns them numbered. The operator ranks them by their own judgment, best opportunity first, BEFORE anything is scored; then calibrate_submit records that ranking, scores the same slice, and measures agreement. This is the first thing a new user does.',
      inputSchema: {
        count: z.number().int().min(2).max(30).default(10).describe('How many postings to draw'),
        seed: z.number().int().optional().describe('Redraw a previous slice by its recorded seed'),
      },
    },
    async ({ count, seed }) => {
      try {
        const started = await app.startCalibration({ count, seed });
        const summaries = await app.listPostings();
        const byId = new Map(summaries.map((s) => [s.postingId, s]));
        const lines = started.postingIds.map((id, i) => {
          const s = byId.get(id);
          return `${i + 1}. ${s ? `${s.company}: ${s.title}` : id} (${id})`;
        });
        return text(
          [
            `Calibration slice drawn (seed ${started.seed}). Rank every posting below by YOUR judgment, best first, before any scoring happens.`,
            '',
            ...lines,
            '',
            'Then call calibrate_submit with ranking: the posting IDs in your order, best first.',
          ].join('\n'),
        );
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'calibrate_submit',
    {
      title: 'Submit the human ranking and measure agreement',
      description:
        "Records the operator's ranking of the pending calibration slice, scores the same postings with the judge, and reports Spearman agreement plus the disagreements that carry the tuning signal. The calibration is persisted; later, after adjusting weights, calibrate_rescore re-measures the same slice.",
      inputSchema: {
        ranking: z
          .array(z.string())
          .describe("The slice's posting IDs in the operator's order, best first"),
      },
    },
    async ({ ranking }) => {
      try {
        const { record, errors } = await app.submitCalibration({
          ranking: ranking.map(postingIdFromFile),
        });
        return text(
          [
            renderCalibration(record.humanRanking, record.rows, record.rho),
            ...(errors.length > 0 ? ['', `Failed: ${errors.join('; ')}`] : []),
          ].join('\n'),
        );
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'calibrate_rescore',
    {
      title: 'Re-measure the last calibration under the current rubric',
      description:
        'Re-scores the most recent calibration slice with the current weights and profile, and reports the new Spearman agreement against the recorded human ranking. Use after changing weights or sharpening the profile, to see whether the rubric moved toward the operator.',
    },
    async () => {
      try {
        const { record, errors, previousRho } = await app.rescoreCalibration();
        return text(
          [
            `Previous rho: ${previousRho === null || previousRho === undefined ? 'n/a' : previousRho.toFixed(2)}`,
            renderCalibration(record.humanRanking, record.rows, record.rho),
            ...(errors.length > 0 ? ['', `Failed: ${errors.join('; ')}`] : []),
          ].join('\n'),
        );
      } catch (err) {
        return failure(err);
      }
    },
  );

  return server;
};

export const startStdioServer = async (server: McpServer): Promise<void> => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
};

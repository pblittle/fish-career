// The CLI surface: argument parsing and rendering only. Every command calls
// one application use case, so a score means the same thing however it was
// asked for.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CareerApplication } from '../../application/career-application.js';
import { renderCalibration } from '../../domain/calibration.js';
import { ApplicationError } from '../../domain/errors.js';
import { postingIdFromFile } from '../../domain/posting.js';
import { renderEval } from '../../domain/preferences.js';
import { collapseVariants, renderTable } from '../../domain/ranking.js';
import { runQuality } from './quality.js';

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

export interface CliDeps {
  app: CareerApplication;
  io?: CliIo;
  evalDir?: string;
}

const defaultEvalDir = (): string =>
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'eval');

export const USAGE = `fish.career — a local-first MCP server that finds job opportunities,
interprets their fit, scores them with an explicit rubric, and hones that
rubric against human judgment.

Usage:
  fish                        start the MCP server over stdio (what hosts run)
  fish demo [--keep]          run the credential-free end-to-end demo
  fish fetch [--company X] [--days N] [--all]
  fish triage [--rescore] [postingId...]
  fish evaluate
  fish quality [--k N] [--json]     ranking quality against the labeled dataset
  fish calibrate start [--count N] [--seed N]
  fish calibrate submit <postingId...>
  fish calibrate reuse
  fish calibrate rescore
  fish watchlist list | probe <slug> | add <name> <provider> <slug> | remove <name>
  fish profile get | set <path>
  fish postings list | read <postingId> | explain <postingId> [--dry-run]
  fish --version
  fish --help

State lives in FISH_HOME (default ~/.config/fish); the package holds none.`;

const valuesFor = (args: string[], flag: string): string[] => {
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === flag) {
      const v = args[i + 1];
      if (v !== undefined && !v.startsWith('--')) out.push(v);
    }
  }
  return out;
};

const valueFor = (args: string[], flag: string): string | undefined => valuesFor(args, flag)[0];

const positional = (args: string[]): string[] => args.filter((a) => !a.startsWith('-'));

const fail = (io: CliIo, message: string): number => {
  io.err(message);
  return 1;
};

export const runCli = async (argv: string[], deps: CliDeps): Promise<number> => {
  const io = deps.io ?? { out: console.log, err: console.error };
  const app = deps.app;
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case 'fetch': {
        let days: number | null | undefined;
        if (rest.includes('--all')) {
          days = null;
        } else if (valueFor(rest, '--days') !== undefined) {
          const n = Number(valueFor(rest, '--days'));
          if (!Number.isFinite(n) || n <= 0) return fail(io, '--days needs a positive number.');
          days = n;
        }
        const outcome = await app.fetchPostings({ companies: valuesFor(rest, '--company'), days });
        for (const c of outcome.perCompany) {
          io.out(`${c.name}: ${c.total} postings, ${c.remote} remote, ${c.written} new`);
        }
        io.out(
          `\n${outcome.arrivals.length} new posting${outcome.arrivals.length === 1 ? '' : 's'} written to the cache.`,
        );
        if (outcome.firstRun) {
          io.out(`First run: only postings newer than ${days ?? 14} days were written.`);
        }
        if (outcome.failures.length > 0) {
          io.out(`Boards that failed: ${outcome.failures.join(', ')}`);
        }
        if (outcome.arrivals.length > 0) io.out('Rank them with: fish triage');
        return 0;
      }

      case 'triage': {
        const ids = positional(rest).map(postingIdFromFile);
        const outcome = await app.rankPostings({
          ...(ids.length > 0 ? { postingIds: ids } : {}),
          rescore: rest.includes('--rescore'),
        });
        io.out(renderTable(collapseVariants(outcome.rows)));
        io.out(`\nRun ${outcome.runId}.`);
        if (outcome.skipped > 0) {
          io.out(`\nSkipped ${outcome.skipped} already-scored postings from earlier runs.`);
        }
        if (!outcome.ledgerOk) {
          io.out('\nWARNING: the scored ledger could not be read; it was treated as empty.');
        }
        if (outcome.errors.length > 0) io.out(`Failed: ${outcome.errors.join('; ')}`);
        return 0;
      }

      case 'evaluate': {
        const { evaluation, errors } = await app.evaluateRanking();
        io.out(renderEval(evaluation));
        if (errors.length > 0) io.out(`Failed: ${errors.join('; ')}`);
        return 0;
      }

      case 'quality': {
        let k = 5;
        const kRaw = valueFor(rest, '--k');
        if (kRaw !== undefined) {
          const n = Number(kRaw);
          if (!Number.isInteger(n) || n < 1 || n > 50) {
            return fail(io, '--k needs an integer between 1 and 50.');
          }
          k = n;
        }
        const { text } = await runQuality({
          dir: deps.evalDir ?? defaultEvalDir(),
          k,
          json: rest.includes('--json'),
        });
        io.out(text);
        return 0;
      }

      case 'calibrate': {
        const [sub, ...args] = rest;
        if (sub === 'start') {
          let count: number | undefined;
          if (valueFor(args, '--count') !== undefined) {
            const n = Number(valueFor(args, '--count'));
            if (!Number.isInteger(n) || n < 2 || n > 30) {
              return fail(io, '--count needs an integer between 2 and 30.');
            }
            count = n;
          }
          let seed: number | undefined;
          if (valueFor(args, '--seed') !== undefined) {
            const n = Number(valueFor(args, '--seed'));
            if (!Number.isInteger(n)) return fail(io, '--seed needs an integer.');
            seed = n;
          }
          const started = await app.startCalibration({
            ...(count !== undefined ? { count } : {}),
            ...(seed !== undefined ? { seed } : {}),
          });
          const summaries = await app.listPostings();
          const byId = new Map(summaries.map((s) => [s.postingId, s]));
          io.out(
            `Calibration slice drawn (seed ${started.seed}). Rank every posting below by YOUR judgment, best first, before any scoring happens.\n`,
          );
          started.postingIds.forEach((id, i) => {
            const s = byId.get(id);
            io.out(`${i + 1}. ${s ? `${s.company}: ${s.title}` : id} (${id})`);
          });
          io.out('\nThen: fish calibrate submit <postingId...> in your order, best first.');
          return 0;
        }
        if (sub === 'submit') {
          const ranking = positional(args).map(postingIdFromFile);
          if (ranking.length === 0) return fail(io, 'Name the slice postings in your order.');
          const { record, errors } = await app.submitCalibration({ ranking });
          io.out(renderCalibration(record.humanRanking, record.rows, record.rho));
          if (errors.length > 0) io.out(`Failed: ${errors.join('; ')}`);
          return 0;
        }
        if (sub === 'rescore') {
          const { record, errors, previousRho } = await app.rescoreCalibration();
          io.out(
            `Previous rho: ${previousRho === null || previousRho === undefined ? 'n/a' : previousRho.toFixed(2)}`,
          );
          io.out(renderCalibration(record.humanRanking, record.rows, record.rho));
          if (errors.length > 0) io.out(`Failed: ${errors.join('; ')}`);
          return 0;
        }
        if (sub === 'reuse') {
          const pending = await app.pendingCalibration();
          if (!pending) {
            return fail(io, 'No saved calibration slice to reuse. Run: fish calibrate start');
          }
          const started = await app.startCalibration({
            count: pending.postingIds.length,
            seed: pending.seed,
          });
          const summaries = await app.listPostings();
          const byId = new Map(summaries.map((s) => [s.postingId, s]));
          io.out(`Reusing the saved slice (seed ${started.seed}).\n`);
          started.postingIds.forEach((id, i) => {
            const s = byId.get(id);
            io.out(`${i + 1}. ${s ? `${s.company}: ${s.title}` : id} (${id})`);
          });
          return 0;
        }
        return fail(io, 'Usage: fish calibrate start | submit | reuse | rescore');
      }

      case 'watchlist': {
        const [sub, ...args] = rest;
        if (sub === 'list' || sub === undefined) {
          const entries = await app.listWatchlist();
          io.out(
            entries.length === 0
              ? 'The watchlist is empty.'
              : entries.map((e) => `${e.name} (${e.provider}/${e.slug})`).join('\n'),
          );
          return 0;
        }
        if (sub === 'probe') {
          const slug = positional(args)[0];
          if (!slug) return fail(io, 'Usage: fish watchlist probe <slug>');
          const probe = await app.probeCompany({ slug });
          const counts = Object.entries(probe.counts).map(([p, n]) => `${p}: ${n} postings`);
          io.out(
            [`Probe of "${slug}":`, ...(counts.length ? counts : ['no board found'])].join('\n'),
          );
          for (const s of probe.samples) {
            io.out(`${s.provider}: ${s.titles.slice(0, 3).join(' | ')}`);
          }
          io.out('\nThen: fish watchlist add <name> <provider> <slug>');
          return 0;
        }
        if (sub === 'add') {
          const [name, provider, slug] = positional(args);
          if (!name || !provider || !slug) {
            return fail(io, 'Usage: fish watchlist add <name> <provider> <slug>');
          }
          const { added } = await app.addCompany({ name, provider, slug });
          io.out(
            added ? `Added ${name} (${provider}/${slug}).` : `${name} is already on the watchlist.`,
          );
          return 0;
        }
        if (sub === 'remove') {
          const name = positional(args)[0];
          if (!name) return fail(io, 'Usage: fish watchlist remove <name>');
          const { removed } = await app.removeCompany({ name });
          io.out(removed ? `Removed ${name}.` : `${name} was not on the watchlist.`);
          return 0;
        }
        return fail(io, 'Usage: fish watchlist list | probe | add | remove');
      }

      case 'profile': {
        const [sub, path] = rest;
        if (sub === 'get' || sub === undefined) {
          const profile = await app.getProfile();
          io.out(profile || 'No profile yet. Write one with: fish profile set <path>');
          return 0;
        }
        if (sub === 'set') {
          if (!path) return fail(io, 'Usage: fish profile set <path>');
          const { readFileSync } = await import('node:fs');
          await app.updateProfile(readFileSync(path, 'utf8'));
          io.out('Profile written.');
          return 0;
        }
        return fail(io, 'Usage: fish profile get | set <path>');
      }

      case 'postings': {
        const [sub, id] = rest;
        if (sub === 'list' || sub === undefined) {
          const postings = await app.listPostings();
          io.out(
            postings.length === 0
              ? 'The posting cache is empty.'
              : postings.map((p) => `${p.postingId}\t${p.company}: ${p.title}`).join('\n'),
          );
          return 0;
        }
        if (sub === 'read') {
          if (!id) return fail(io, 'Usage: fish postings read <postingId>');
          const record = await app.readPosting({ postingId: postingIdFromFile(id) });
          io.out(record.text);
          return 0;
        }
        if (sub === 'explain') {
          if (!id) return fail(io, 'Usage: fish postings explain <postingId> [--dry-run]');
          const postingId = postingIdFromFile(id);
          if (rest.includes('--dry-run')) {
            const preview = await app.previewPosting({ postingId });
            io.out(`Dry run: the request for ${postingId}, not sent.\n`);
            io.out(
              JSON.stringify(
                { state: preview.state, model: preview.model, questions: preview.questions },
                null,
                2,
              ),
            );
            return 0;
          }
          const explanation = await app.explainPosting({ postingId });
          io.out(renderTable([explanation.row]));
          io.out(`\nFull answers for ${postingId}:`);
          io.out(JSON.stringify(explanation.answers, null, 2));
          io.out(
            `\ncost: ${explanation.inputTokens} in / ${explanation.outputTokens} out tokens, ${explanation.latencyMs}ms (${explanation.model})`,
          );
          return 0;
        }
        return fail(io, 'Usage: fish postings list | read <postingId> | explain <postingId>');
      }

      default:
        io.err(USAGE);
        return 1;
    }
  } catch (err) {
    if (err instanceof ApplicationError) {
      io.err(err.message);
      return err.code === 'NOTHING_TO_SCORE' ? 0 : 1;
    }
    io.err(String((err as Error).message ?? err));
    return 1;
  }
};

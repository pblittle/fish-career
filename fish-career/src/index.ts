#!/usr/bin/env node
// fish.career: the pipeline as an MCP server. Tools for the agent to
// manage a watchlist, poll public ATS boards, triage arrivals against
// the operator's profile with Jev, and run the calibration loop that
// keeps the rubric honest. State lives in ~/.config/fish (or FISH_HOME),
// never in the package, so the npm install stays stateless.

import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { type CalibrationRecord, renderCalibration, spearman } from './compare.js';
import {
  ensureHome,
  hasApiKey,
  loadEnv,
  PATHS,
  readJson,
  readProfile,
  readWatchlist,
  statePath,
  type WatchlistEntry,
  writeJson,
  writeProfile,
  writeWatchlist,
} from './config.js';
import { evaluatePreferences, type Preference, renderEval } from './evaluate.js';
import { fetchAll } from './fetch.js';
import { collapseVariants, profileHash, RUBRIC_VERSION, renderTable } from './jev.js';
import { markScored, readLedger, unscored } from './ledger.js';
import { probeSlug } from './providers.js';
import { scoreFiles } from './triage.js';

ensureHome();
loadEnv();

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
  version: string;
};

const server = new McpServer({ name: 'fish.career', version });

// --- watchlist_add: probe first, write only what the caller confirmed ---
server.registerTool(
  'watchlist_add',
  {
    title: 'Add a company to the watchlist',
    description:
      'Adds a company to the watchlist by probing the four public ATS APIs for the slug. With confirm=false (the default) it reports live posting counts per provider and writes nothing; call again with confirm=true to write the entry. Always read a title or two from the board before confirming: slugs collide (a "gamma" board might not be the company you mean).',
    inputSchema: {
      name: z.string().describe('Company display name'),
      provider: z
        .enum(['ashby', 'greenhouse', 'lever', 'smartrecruiters'])
        .describe('ATS provider, from the probe result'),
      slug: z.string().describe('The board token on that provider'),
      confirm: z.boolean().default(false).describe('Probe only by default; true writes the entry'),
    },
  },
  async ({ name, provider, slug, confirm }) => {
    if (confirm) {
      const entries = readWatchlist();
      if (entries.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
        return {
          content: [{ type: 'text' as const, text: `${name} is already on the watchlist.` }],
        };
      }
      writeWatchlist([...entries, { name, provider, slug }]);
      return { content: [{ type: 'text' as const, text: `Added ${name} (${provider}/${slug}).` }] };
    }
    const counts = await probeSlug(slug);
    const lines = Object.entries(counts).map(([p, n]) => `${p}: ${n} postings`);
    return {
      content: [
        {
          type: 'text' as const,
          text: `Probe of "${slug}":\n${lines.join('\n') || 'no board found on any provider'}\n\nCall again with confirm=true and a provider to write.`,
        },
      ],
    };
  },
);

// --- watchlist_list ---
server.registerTool(
  'watchlist_list',
  {
    title: 'List the watchlist',
    description: 'Every company on the watchlist with its provider and board slug.',
  },
  async () => {
    const entries = readWatchlist();
    return {
      content: [
        {
          type: 'text' as const,
          text:
            entries.length === 0
              ? 'The watchlist is empty.'
              : entries
                  .map((e: WatchlistEntry) => `${e.name} (${e.provider}/${e.slug})`)
                  .join('\n'),
        },
      ],
    };
  },
);

// --- fetch_postings: poll the watchlist, write arrivals ---
server.registerTool(
  'fetch_postings',
  {
    title: 'Poll watchlist boards for new remote postings',
    description:
      "Polls every watchlist company's public ATS board, keeps remote postings only, writes the ones never seen before into the postings cache, and returns the diff. Every remote posting a poll observes is marked seen, written or not, so later polls deliver arrivals only. First-ever poll writes only postings newer than 14 days. Compensation is included when the board provides it (Ashby usually, Greenhouse never).",
  },
  async () => {
    const watchlist = readWatchlist();
    if (watchlist.length === 0) {
      return {
        content: [{ type: 'text' as const, text: 'The watchlist is empty; add companies first.' }],
      };
    }
    const seenPath = statePath('seen.json');
    const seen = readJson<Record<string, unknown>>(seenPath, {});
    const firstRun = Object.keys(seen).length === 0;
    const outcome = await fetchAll(watchlist, {
      postingsDir: PATHS.postings,
      seen,
      days: firstRun ? 14 : null,
    });
    if (Object.keys(outcome.newSeen).length > 0) {
      writeJson(seenPath, { ...seen, ...outcome.newSeen });
    }
    const lines = outcome.arrivals.map((a) => `${a.company}: ${a.title} (${a.comp}) -> ${a.file}`);
    return {
      content: [
        {
          type: 'text' as const,
          text: [
            `${outcome.arrivals.length} new posting${outcome.arrivals.length === 1 ? '' : 's'}.`,
            ...lines,
            ...(outcome.failures.length > 0
              ? ['', `Boards that failed: ${outcome.failures.join('; ')}`]
              : []),
            ...(firstRun ? ['', 'First poll: only postings newer than 14 days were written.'] : []),
            outcome.arrivals.length > 0 ? '\nTriage them with the triage tool.' : '',
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    };
  },
);

// --- triage: score unscored postings (or a named slice) ---
server.registerTool(
  'triage',
  {
    title: 'Score postings against the profile with Jev',
    description:
      'Scores postings and returns a ranked table with per-dimension scores and confidences. By default scores only postings never scored before (the scored ledger skips repeats). Pass explicit files to score a chosen slice without touching the ledger; pass rescore=true to redo everything. Requires TYPESAFE_API_KEY. Low-confidence dimensions are marked "?" and a blocker at 0.5+ flags a likely unmet hard requirement.',
    inputSchema: {
      files: z
        .array(z.string())
        .optional()
        .describe(
          'Optional explicit filenames from the postings cache; overrides the unscored default and never marks the ledger',
        ),
      rescore: z
        .boolean()
        .default(false)
        .describe('Score every posting again, ignoring the ledger'),
    },
  },
  async ({ files, rescore }) => {
    if (!hasApiKey()) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `No TYPESAFE_API_KEY. Put one from https://console.typesafe.ai/keys into ${PATHS.env} as TYPESAFE_API_KEY=...`,
          },
        ],
      };
    }
    const profile = readProfile();
    if (!profile) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `No profile at ${PATHS.profile}; write one with update_profile first.`,
          },
        ],
      };
    }
    const scoredPath = statePath('scored.json');
    const ledger = readLedger(scoredPath);
    const provenance = { profileHash: profileHash(profile), rubric: RUBRIC_VERSION };
    const explicit = files !== undefined;
    let candidates = (readdirSync(PATHS.postings) as string[])
      .filter((f) => f.endsWith('.txt') || f.endsWith('.md'))
      .sort();
    if (explicit) {
      candidates = files.map((f) => basename(f));
    } else if (!rescore) {
      candidates = unscored(candidates, ledger.entries, provenance);
    }
    const ledgerWarning = ledger.ok
      ? ''
      : `WARNING: the scored ledger at ${scoredPath} could not be read; it was treated as empty and this run rewrote it.`;
    if (candidates.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: ['Nothing new to score.', ledgerWarning].filter(Boolean).join('\n'),
          },
        ],
      };
    }

    const { rows, errors } = await scoreFiles(candidates, {
      profile,
      postingsDir: PATHS.postings,
      tracePath: statePath('traces.jsonl'),
      ...(explicit
        ? {}
        : {
            checkpoint: (file: string, score: number) =>
              markScored(scoredPath, { [file]: score }, provenance),
          }),
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: [
            renderTable(collapseVariants(rows)),
            ...(errors.length > 0 ? ['', `Failed: ${errors.join('; ')}`] : []),
            ...(ledgerWarning ? ['', ledgerWarning] : []),
          ].join('\n'),
        },
      ],
    };
  },
);

// --- evaluate: hold the rubric to preferences.json ---
server.registerTool(
  'evaluate',
  {
    title: "Measure the rubric against the operator's written judgment",
    description:
      'Scores the postings named in preferences.json and reports how often the ranking satisfies the pairwise preferences the profile already states; each preference quotes its source line. This is the eval: run it after any profile or weight change. The calibrate_* tools remain the stronger measurement when the operator will hand-rank a slice.',
  },
  async () => {
    if (!hasApiKey()) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `No TYPESAFE_API_KEY. Put one from https://console.typesafe.ai/keys into ${PATHS.env} as TYPESAFE_API_KEY=...`,
          },
        ],
      };
    }
    const profile = readProfile();
    if (!profile) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `No profile at ${PATHS.profile}; write one with update_profile first.`,
          },
        ],
      };
    }
    let prefs: { preferences: Preference[] };
    try {
      prefs = JSON.parse(readFileSync(join(PATHS.home, 'preferences.json'), 'utf8'));
    } catch {
      return {
        content: [
          {
            type: 'text' as const,
            text: `No preferences.json in ${PATHS.home}. Name the pairs the rubric must respect, each with the profile line it came from.`,
          },
        ],
      };
    }
    const wanted = [...new Set(prefs.preferences.flatMap((p) => [p.better, p.worse]))].filter((f) =>
      existsSync(join(PATHS.postings, f)),
    );
    if (wanted.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'None of the postings named in preferences.json are in the cache.',
          },
        ],
      };
    }
    const { rows, errors } = await scoreFiles(wanted, {
      profile,
      postingsDir: PATHS.postings,
      tracePath: statePath('traces.jsonl'),
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: [
            renderEval(evaluatePreferences(rows, prefs.preferences)),
            ...(errors.length > 0 ? ['', `Failed: ${errors.join('; ')}`] : []),
          ].join('\n'),
        },
      ],
    };
  },
);

// --- read_posting ---
server.registerTool(
  'read_posting',
  {
    title: 'Read one posting in full',
    description: 'Returns the full text and header of one posting file from the cache.',
    inputSchema: { file: z.string().describe('Filename from the postings cache') },
  },
  async ({ file }) => {
    try {
      const name = file.split('/').pop() ?? file;
      return {
        content: [
          { type: 'text' as const, text: readFileSync(join(PATHS.postings, name), 'utf8') },
        ],
      };
    } catch {
      return { content: [{ type: 'text' as const, text: `No posting named ${file}.` }] };
    }
  },
);

// --- get_profile / update_profile ---
server.registerTool(
  'get_profile',
  {
    title: 'Read the candidate profile',
    description: 'The profile every triage judgment is made against.',
  },
  async () => ({
    content: [
      { type: 'text' as const, text: readProfile() || `No profile yet at ${PATHS.profile}.` },
    ],
  }),
);

server.registerTool(
  'update_profile',
  {
    title: 'Write the candidate profile',
    description:
      'Replaces profile.md wholesale. The profile is sent verbatim to the TypeSafe API on every scoring call, so keep contact details out and role-relevant facts in.',
    inputSchema: { content: z.string().describe('Full new profile markdown') },
  },
  async ({ content }) => {
    writeProfile(content);
    return { content: [{ type: 'text' as const, text: `Profile written to ${PATHS.profile}.` }] };
  },
);

// --- calibration: the project's first-run flow ---
// calibrate_start draws a stratified slice (one posting per company) and
// holds it; the human ranks it BLIND, before any scoring; calibrate_submit
// scores the same slice and measures agreement; calibrate_rescore re-runs
// the measurement under the current rubric after a weights change. Records
// persist, because the accumulated set is the evidence about whether the
// rubric tracks real judgment at all.

interface PendingCalibration {
  files: string[];
  startedAt: string;
}

server.registerTool(
  'calibrate_start',
  {
    title: 'Start a calibration round',
    description:
      'Draws a stratified sample of postings (one per company, count defaults to 10) and returns them numbered. The operator ranks them by their own judgment, best opportunity first, BEFORE anything is scored; then calibrate_submit records that ranking, scores the same slice, and measures agreement. This is the first thing a new user does.',
    inputSchema: {
      count: z.number().int().min(2).max(30).default(10).describe('How many postings to draw'),
    },
  },
  async ({ count }) => {
    const files = (readdirSync(PATHS.postings) as string[])
      .filter((f) => f.endsWith('.txt') || f.endsWith('.md'))
      .sort();
    if (files.length < 2) {
      return {
        content: [
          { type: 'text' as const, text: 'Not enough postings cached; run fetch_postings first.' },
        ],
      };
    }
    const byCompany = new Map<string, string[]>();
    for (const f of files) {
      const head = readFileSync(join(PATHS.postings, f), 'utf8').slice(0, 600);
      const company = head.match(/^COMPANY: (.+)$/m)?.[1] ?? 'unknown';
      byCompany.set(company, [...(byCompany.get(company) ?? []), f]);
    }
    const companies = [...byCompany.keys()].sort(() => Math.random() - 0.5);
    const picked: string[] = [];
    for (const c of companies) {
      if (picked.length >= count) break;
      const fs = byCompany.get(c) ?? [];
      const pick = fs[Math.floor(Math.random() * fs.length)];
      if (pick !== undefined) picked.push(pick);
    }
    writeJson(statePath('calibration-pending.json'), {
      files: picked,
      startedAt: new Date().toISOString(),
    } satisfies PendingCalibration);
    const lines = picked.map((f, i) => {
      const head = readFileSync(join(PATHS.postings, f), 'utf8').slice(0, 600);
      const title = head.match(/^TITLE: (.+)$/m)?.[1] ?? f;
      const company = head.match(/^COMPANY: (.+)$/m)?.[1] ?? '?';
      return `${i + 1}. ${company}: ${title} (${f})`;
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: [
            'Calibration slice drawn. Rank every posting below by YOUR judgment, best first, before any scoring happens.',
            '',
            ...lines,
            '',
            'Then call calibrate_submit with ranking: the filenames in your order, best first.',
          ].join('\n'),
        },
      ],
    };
  },
);

server.registerTool(
  'calibrate_submit',
  {
    title: 'Submit the human ranking and measure agreement',
    description:
      "Records the operator's ranking of the pending calibration slice, scores the same postings with Jev, and reports Spearman agreement plus the disagreements that carry the tuning signal. The calibration is persisted; later, after adjusting weights, calibrate_rescore re-measures the same slice.",
    inputSchema: {
      ranking: z
        .array(z.string())
        .describe("The slice filenames in the operator's order, best first"),
    },
  },
  async ({ ranking }) => {
    if (!hasApiKey()) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `No TYPESAFE_API_KEY. Put one from https://console.typesafe.ai/keys into ${PATHS.env}.`,
          },
        ],
      };
    }
    const profile = readProfile();
    if (!profile) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `No profile at ${PATHS.profile}; write one with update_profile first.`,
          },
        ],
      };
    }
    let pending: PendingCalibration | null = null;
    try {
      pending = JSON.parse(
        readFileSync(statePath('calibration-pending.json'), 'utf8'),
      ) as PendingCalibration;
    } catch {
      // No pending slice; fall back to the ranking itself.
    }
    const files = pending?.files ?? ranking;
    const missing = files.filter((f) => !ranking.includes(f));
    if (missing.length > 0 && pending) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `The ranking is missing ${missing.length} of the pending slice's postings; rank all of them so the correlation means something.`,
          },
        ],
      };
    }
    const { rows, errors } = await scoreFiles(files, { profile, postingsDir: PATHS.postings });
    const human = files.slice().sort((a, b) => ranking.indexOf(a) - ranking.indexOf(b));
    const rho = spearman(
      human.map((f) => ranking.indexOf(f)),
      human.map((f) => rows.findIndex((r) => r.file === f)),
    );
    const record: CalibrationRecord = {
      at: new Date().toISOString(),
      files,
      humanRanking: human,
      rho,
      rows,
    };
    mkdirSync(join(PATHS.state, 'calibrations'), { recursive: true });
    writeJson(join(PATHS.state, 'calibrations', `${record.at.replace(/[:.]/g, '-')}.json`), record);
    return {
      content: [
        {
          type: 'text' as const,
          text: [
            renderCalibration(human, rows, rho),
            ...(errors.length > 0 ? ['', `Failed: ${errors.join('; ')}`] : []),
          ].join('\n'),
        },
      ],
    };
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
    if (!hasApiKey()) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `No TYPESAFE_API_KEY. Put one from https://console.typesafe.ai/keys into ${PATHS.env}.`,
          },
        ],
      };
    }
    const profile = readProfile();
    const dir = join(PATHS.state, 'calibrations');
    let latest: CalibrationRecord | null = null;
    try {
      const names = (readdirSync(dir) as string[]).sort();
      const newest = names[names.length - 1];
      if (newest !== undefined) {
        latest = JSON.parse(readFileSync(join(dir, newest), 'utf8')) as CalibrationRecord;
      }
    } catch {
      // No calibration history.
    }
    if (!latest) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'No calibration on record yet; run calibrate_start first.',
          },
        ],
      };
    }
    const current = latest;
    const { rows, errors } = await scoreFiles(current.files, {
      profile,
      postingsDir: PATHS.postings,
    });
    const rho = spearman(
      current.humanRanking.map((f) => current.humanRanking.indexOf(f)),
      current.humanRanking.map((f) => rows.findIndex((r) => r.file === f)),
    );
    const record: CalibrationRecord = {
      at: new Date().toISOString(),
      files: current.files,
      humanRanking: current.humanRanking,
      rho,
      rows,
    };
    writeJson(join(dir, `${record.at.replace(/[:.]/g, '-')}.json`), record);
    return {
      content: [
        {
          type: 'text' as const,
          text: [
            `Previous rho: ${latest.rho === null ? 'n/a' : latest.rho.toFixed(2)}`,
            renderCalibration(latest.humanRanking, rows, rho),
            ...(errors.length > 0 ? ['', `Failed: ${errors.join('; ')}`] : []),
          ].join('\n'),
        },
      ],
    };
  },
);

const main = async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
};

main();

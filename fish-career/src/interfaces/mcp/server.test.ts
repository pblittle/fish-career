// Protocol-level tests: a real client and a real server over the SDK's
// in-memory transport. These pin the public contract (tool names, schemas,
// annotations, resources, prompts, structured results, error envelopes)
// rather than the application internals.

import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  fixedClock,
  memoryCalibrationStore,
  memoryLedger,
  memoryPostingRepository,
  memoryPreferencesStore,
  memoryProfileStore,
  memorySeenStore,
  memoryTraceReader,
  memoryTraceSink,
  memoryWatchlistStore,
} from '../../adapters/fake/in-memory.js';
import { memoryProvider } from '../../adapters/fake/providers.js';
import { fakeJudge } from '../../adapters/judge/fake.js';
import { type CareerApplication, createApplication } from '../../application/career-application.js';
import type { CareerDependencies } from '../../application/dependencies.js';
import type { Posting } from '../../domain/posting.js';
import { createServer } from './server.js';

const PROFILE = [
  'Remote US only; not open to relocation.',
  'Compensation floor: $180,000.',
  'Core skills: TypeScript, Node.js, Postgres, AWS, distributed systems.',
  'Domains I want: developer tools, AI infrastructure.',
].join('\n');

const body = (extra = '') =>
  `TypeScript, Node.js, Postgres, AWS, and distributed systems. ${extra}`.padEnd(120, ' ');

const posting = (key: string, title: string, over: Partial<Posting> = {}): Posting => ({
  key,
  title,
  location: 'Remote (US)',
  workplace: 'Remote',
  remote: true,
  comp: '$200,000 – $240,000',
  url: `https://example.com/${key}`,
  date: '2026-09-20T00:00:00Z',
  text: body(),
  ...over,
});

const board = (): Record<string, Posting[]> => ({
  acme: [
    posting('fixture:acme:1', 'Senior Backend Engineer'),
    posting('fixture:acme:2', 'Junior Backend Engineer', { comp: '$110,000 – $130,000' }),
  ],
});

const app = (): CareerApplication => {
  const traces = memoryTraceSink();
  const deps: CareerDependencies = {
    providers: {
      fixture: memoryProvider('fixture', board()),
      // An empty real provider, so watchlist_add's provider enum is satisfied
      // without polluting the probe counts.
      ashby: memoryProvider('ashby', {}),
    },
    judge: fakeJudge,
    postings: memoryPostingRepository(),
    seen: memorySeenStore(),
    ledger: memoryLedger(),
    traces,
    traceReader: memoryTraceReader(traces.records),
    profile: memoryProfileStore(PROFILE),
    watchlist: memoryWatchlistStore([{ name: 'Acme', provider: 'fixture', slug: 'acme' }]),
    preferences: memoryPreferencesStore([
      { better: 'acme-1', worse: 'acme-2', source: 'fixture profile: compensation floor' },
    ]),
    calibrations: memoryCalibrationStore(),
    clock: fixedClock('2026-09-25T12:00:00.000Z'),
    random: { int: () => 0, shuffle: (xs) => [...xs] },
  };
  return createApplication(deps);
};

let client: Client;
let application: CareerApplication;

beforeEach(async () => {
  application = app();
  const server = createServer(application, { version: 'test' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test-host', version: '0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

const structured = (result: unknown): Record<string, unknown> =>
  (result as { structuredContent?: Record<string, unknown> }).structuredContent ?? {};

const textOf = (result: { contents: unknown[] }): string => {
  const first = result.contents[0] as { text?: string } | undefined;
  return first?.text ?? '';
};

describe('the MCP contract', () => {
  it('lists the expected tools, each with input and output schemas and annotations', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'calibration_rescore',
      'calibration_start',
      'calibration_submit',
      'evaluate_ranking',
      'fetch_postings',
      'profile_update',
      'triage_postings',
      'watchlist_add',
      'watchlist_probe',
      'watchlist_remove',
    ]);
    for (const tool of tools) {
      expect(tool.inputSchema, tool.name).toBeDefined();
      expect(tool.outputSchema, tool.name).toBeDefined();
      expect(tool.annotations, tool.name).toBeDefined();
    }
    const probe = tools.find((t) => t.name === 'watchlist_probe');
    expect(probe?.annotations?.readOnlyHint).toBe(true);
    const add = tools.find((t) => t.name === 'watchlist_add');
    expect(add?.annotations?.readOnlyHint).toBe(false);
    const remove = tools.find((t) => t.name === 'watchlist_remove');
    expect(remove?.annotations?.destructiveHint).toBe(true);
  });

  it('exposes the passive state as resources and templates', async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri).sort()).toEqual([
      'fish://calibrations/latest',
      'fish://postings',
      'fish://profile/current',
      'fish://rubric/current',
      'fish://runs/latest',
      'fish://watchlist',
    ]);
    const { resourceTemplates } = await client.listResourceTemplates();
    const templates = resourceTemplates.map((t) => t.uriTemplate);
    expect(templates).toContain('fish://postings/{postingId}');
    expect(templates).toContain('fish://runs/{runId}');
  });

  it('registers the reusable prompts', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual([
      'audit-profile',
      'calibrate-rubric',
      'career-search-onboarding',
      'explain-ranking',
      'review-new-arrivals',
    ]);
  });

  it('fetch_postings returns structured arrivals and text', async () => {
    const result = await client.callTool({ name: 'fetch_postings', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(structured(result).arrivals).toHaveLength(2);
    expect((result.content as { text: string }[])[0]?.text).toContain('2 new postings');
  });

  it('triage_postings returns ranked rows with dimension cells', async () => {
    await client.callTool({ name: 'fetch_postings', arguments: {} });
    const result = await client.callTool({ name: 'triage_postings', arguments: {} });
    expect(result.isError).toBeFalsy();
    const rows = structured(result).rows as { postingId: string; dims: unknown }[];
    expect(rows.map((r) => r.postingId).sort()).toEqual(['acme-1', 'acme-2']);
    expect(rows[0]?.dims).toBeDefined();
    expect((result.content as { text: string }[])[0]?.text).toContain('rank  posting');
  });

  it('watchlist_probe returns counts and samples', async () => {
    const result = await client.callTool({ name: 'watchlist_probe', arguments: { slug: 'acme' } });
    expect(structured(result).counts).toEqual({ fixture: 2 });
  });

  it('calibration_start returns a seeded slice with structured IDs', async () => {
    await client.callTool({ name: 'fetch_postings', arguments: {} });
    const result = await client.callTool({
      name: 'calibration_start',
      arguments: { count: 2, seed: 7 },
    });
    expect(structured(result).seed).toBe(7);
    expect(structured(result).postingIds).toHaveLength(2);
  });

  it('watchlist_add and watchlist_remove return structured outcomes', async () => {
    const added = await client.callTool({
      name: 'watchlist_add',
      arguments: { name: 'Beta', provider: 'ashby', slug: 'beta' },
    });
    expect(structured(added)).toMatchObject({ name: 'Beta', added: true });
    const again = await client.callTool({
      name: 'watchlist_add',
      arguments: { name: 'Beta', provider: 'ashby', slug: 'beta' },
    });
    expect(structured(again).added).toBe(false);
    const removed = await client.callTool({
      name: 'watchlist_remove',
      arguments: { name: 'Acme' },
    });
    expect(structured(removed)).toMatchObject({ name: 'Acme', removed: true });
  });

  it('evaluate_ranking returns the satisfied count and violations', async () => {
    await client.callTool({ name: 'fetch_postings', arguments: {} });
    const result = await client.callTool({ name: 'evaluate_ranking', arguments: {} });
    expect(structured(result)).toMatchObject({ satisfied: 1, total: 1, violations: [] });
  });

  it('calibration_submit and calibration_rescore return measured records', async () => {
    await client.callTool({ name: 'fetch_postings', arguments: {} });
    const started = await client.callTool({
      name: 'calibration_start',
      arguments: { count: 2, seed: 7 },
    });
    const postingIds = structured(started).postingIds as string[];
    const submitted = await client.callTool({
      name: 'calibration_submit',
      arguments: { ranking: postingIds },
    });
    expect(submitted.isError).toBeFalsy();
    expect(structured(submitted).rho).toBeTypeOf('number');
    expect(structured(submitted).at).toBeTypeOf('string');
    expect(structured(submitted).rows).toHaveLength(2);

    const rescored = await client.callTool({ name: 'calibration_rescore', arguments: {} });
    expect(rescored.isError).toBeFalsy();
    expect(structured(rescored).previousRho).toBeTypeOf('number');
  });

  it('accepts a .txt suffix on posting IDs at every input boundary', async () => {
    await client.callTool({ name: 'fetch_postings', arguments: {} });
    const triaged = await client.callTool({
      name: 'triage_postings',
      arguments: { postingIds: ['acme-1.txt'] },
    });
    expect(triaged.isError).toBeFalsy();
    expect(structured(triaged).rows).toHaveLength(1);
    const read = await client.readResource({ uri: 'fish://postings/acme-1.txt' });
    expect(textOf(read)).toContain('TITLE: Senior Backend Engineer');
  });

  it('returns machine-readable codes with isError for expected failures', async () => {
    const result = await client.callTool({ name: 'profile_update', arguments: { content: '  ' } });
    expect(result.isError).toBe(true);
    expect(structured(result).error).toMatchObject({ code: 'NO_PROFILE' });
  });

  it('reads a posting by URI and reports a miss as a protocol error', async () => {
    await client.callTool({ name: 'fetch_postings', arguments: {} });
    const found = await client.readResource({ uri: 'fish://postings/acme-1' });
    expect(textOf(found)).toContain('TITLE: Senior Backend Engineer');
    await expect(client.readResource({ uri: 'fish://postings/nope' })).rejects.toThrow();
  });

  it('reads the profile, rubric, watchlist, and runs resources', async () => {
    await client.callTool({ name: 'fetch_postings', arguments: {} });
    await client.callTool({ name: 'triage_postings', arguments: {} });
    const profile = await client.readResource({ uri: 'fish://profile/current' });
    expect(textOf(profile)).toContain('Compensation floor');
    const rubric = await client.readResource({ uri: 'fish://rubric/current' });
    expect(textOf(rubric)).toContain('"version": 1');
    const watchlist = await client.readResource({ uri: 'fish://watchlist' });
    expect(textOf(watchlist)).toContain('Acme');
    const runs = await client.readResource({ uri: 'fish://runs/latest' });
    expect(textOf(runs)).toContain('"records"');
  });

  it('reads one run by the ID the triage returned', async () => {
    await client.callTool({ name: 'fetch_postings', arguments: {} });
    const triaged = await client.callTool({ name: 'triage_postings', arguments: {} });
    const runId = structured(triaged).runId as string;
    expect(runId).toBeTypeOf('string');
    const run = await client.readResource({ uri: `fish://runs/${runId}` });
    const parsed = JSON.parse(textOf(run)) as { runId: string; records: unknown[] };
    expect(parsed.runId).toBe(runId);
    expect(parsed.records.length).toBeGreaterThan(0);
    await expect(client.readResource({ uri: 'fish://runs/nope' })).rejects.toThrow();
  });

  it('serves a prompt with its arguments rendered', async () => {
    const result = await client.getPrompt({
      name: 'review-new-arrivals',
      arguments: { count: '3' },
    });
    const first = result.messages[0];
    const text = first?.content.type === 'text' ? first.content.text : '';
    expect(text).toContain('top 3 rows');
  });
});

#!/usr/bin/env node
// Dependency-free stdio smoke test: spawn the built server, speak JSON-RPC
// over the real transport, and assert the contract holds end to end. CI runs
// this after the build; the Inspector CLI smoke in CI adds a second client.

import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, '..', 'dist', 'index.js');
const home = mkdtempSync(join(tmpdir(), 'fish-smoke-'));

const server = spawn(process.execPath, [entry], {
  env: { ...process.env, FISH_HOME: home, FISH_JUDGE: 'fake', TYPESAFE_API_KEY: '' },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buffer = '';
const pending = new Map();
let nextId = 1;

server.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let index = buffer.indexOf('\n');
  while (index >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line.length > 0) {
      try {
        const message = JSON.parse(line);
        const resolve = pending.get(message.id);
        if (resolve) {
          pending.delete(message.id);
          resolve(message);
        }
      } catch {
        // Ignore non-JSON output on stdout.
      }
    }
    index = buffer.indexOf('\n');
  }
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, resolve);
    server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 20_000);
  });

const notify = (method, params = {}) =>
  server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);

const fail = (message) => {
  console.error(`smoke failed: ${message}`);
  server.kill();
  process.exit(1);
};

const EXPECTED_TOOLS = [
  'watchlist_probe',
  'watchlist_add',
  'watchlist_remove',
  'fetch_postings',
  'triage_postings',
  'evaluate_ranking',
  'calibration_start',
  'calibration_submit',
  'calibration_rescore',
  'profile_update',
];
const EXPECTED_RESOURCES = [
  'fish://profile/current',
  'fish://watchlist',
  'fish://postings',
  'fish://rubric/current',
  'fish://calibrations/latest',
  'fish://runs/latest',
];

try {
  const init = await send('initialize', {
    protocolVersion: '2026-07-28',
    capabilities: {},
    clientInfo: { name: 'fish-smoke', version: '0' },
  });
  if (init.error) fail(`initialize: ${JSON.stringify(init.error)}`);
  notify('notifications/initialized');

  const tools = await send('tools/list');
  const names = tools.result.tools.map((t) => t.name);
  for (const expected of EXPECTED_TOOLS) {
    if (!names.includes(expected)) fail(`missing tool ${expected}`);
  }

  const resources = await send('resources/list');
  const uris = resources.result.resources.map((r) => r.uri);
  for (const expected of EXPECTED_RESOURCES) {
    if (!uris.includes(expected)) fail(`missing resource ${expected}`);
  }
  const templates = await send('resources/templates/list');
  if (
    !templates.result.resourceTemplates.some((t) => t.uriTemplate === 'fish://postings/{postingId}')
  ) {
    fail('missing posting resource template');
  }

  const prompts = await send('prompts/list');
  if (!prompts.result.prompts.some((p) => p.name === 'career-search-onboarding')) {
    fail('missing career-search-onboarding prompt');
  }

  const written = await send('tools/call', {
    name: 'profile_update',
    arguments: { content: '# Smoke profile\n\nRemote US only.' },
  });
  if (written.result?.isError) fail('profile_update returned isError');
  if (written.result?.structuredContent?.written !== true) {
    fail('profile_update did not return structuredContent.written');
  }

  const read = await send('resources/read', { uri: 'fish://profile/current' });
  if (!read.result?.contents?.[0]?.text?.includes('Smoke profile')) {
    fail('profile resource did not reflect the write');
  }

  console.log(
    `smoke ok: ${names.length} tools, ${uris.length} resources, ${prompts.result.prompts.length} prompts, one write and read`,
  );
  server.kill();
  process.exit(0);
} catch (err) {
  fail(String(err?.message ?? err));
}

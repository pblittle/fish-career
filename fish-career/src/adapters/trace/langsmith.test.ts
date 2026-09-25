import { describe, expect, it, vi } from 'vitest';
import type { TraceRecord } from '../../ports/trace-sink.js';
import { langSmithTraceSink } from './langsmith.js';
import { multiTraceSink } from './multi.js';

const record = (over: Partial<TraceRecord> = {}): TraceRecord => ({
  at: '2026-09-25T12:00:01.000Z',
  runId: 'run-1',
  postingId: 'acme-1',
  postingHash: 'deadbeef',
  status: 'ok',
  latencyMs: 1000,
  attempts: 2,
  inputTokens: 10,
  outputTokens: 4,
  model: 'jev-latest',
  profileHash: 'abc123def456',
  rubric: 1,
  version: '0.6.0',
  answers: { hard_blocker: { noul: 0 } },
  ...over,
});

describe('langSmithTraceSink', () => {
  it('posts one run with the key, project, timing, and metadata', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const sink = langSmithTraceSink({
      apiKey: 'ls-test',
      project: 'fish-test',
      fetchImpl: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return { ok: true, status: 202, text: async () => '' } as unknown as Response;
      }) as unknown as typeof fetch,
    });
    await sink.write(record());
    expect(calls).toHaveLength(1);
    const [call] = calls;
    if (call === undefined) throw new Error('expected one langsmith call');
    expect(call.url).toBe('https://api.smith.langchain.com/runs');
    expect((call.init.headers as Record<string, string>)['x-api-key']).toBe('ls-test');
    const body = JSON.parse(String(call.init.body));
    expect(body).toMatchObject({
      run_type: 'llm',
      session_name: 'fish-test',
      start_time: '2026-09-25T12:00:00.000Z',
      end_time: '2026-09-25T12:00:01.000Z',
      inputs: {
        postingId: 'acme-1',
        postingHash: 'deadbeef',
        profileHash: 'abc123def456',
        rubric: 1,
      },
    });
    expect(body.extra.metadata).toMatchObject({
      runId: 'run-1',
      model: 'jev-latest',
      attempts: 2,
      applicationVersion: '0.6.0',
    });
  });

  it('reports a failure and swallows it, so telemetry never breaks a run', async () => {
    const onError = vi.fn();
    const sink = langSmithTraceSink({
      apiKey: 'ls-test',
      onError,
      fetchImpl: (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
    });
    await expect(sink.write(record())).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('treats a non-2xx response as a failure', async () => {
    const onError = vi.fn();
    const sink = langSmithTraceSink({
      apiKey: 'ls-test',
      onError,
      fetchImpl: (async () =>
        ({
          ok: false,
          status: 403,
          text: async () => 'forbidden',
        }) as unknown as Response) as unknown as typeof fetch,
    });
    await sink.write(record());
    expect(onError).toHaveBeenCalledOnce();
  });

  it('multiTraceSink writes to every sink in order', async () => {
    const seen: string[] = [];
    const sink = (name: string) => ({
      async write() {
        seen.push(name);
      },
    });
    await multiTraceSink([sink('a'), sink('b')]).write(record());
    expect(seen).toEqual(['a', 'b']);
  });
});

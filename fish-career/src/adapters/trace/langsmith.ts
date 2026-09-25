// A LangSmith trace sink. LangSmith ingests one run per POST to /runs; the
// JSONL sink remains the local source of truth. Telemetry must never fail a
// scoring run, so write errors are reported and swallowed here.

import type { TraceRecord, TraceSink } from '../../ports/trace-sink.js';

export interface LangSmithOptions {
  apiKey: string;
  project?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  onError?: (err: unknown) => void;
}

export const LANGSMITH_DEFAULT_ENDPOINT = 'https://api.smith.langchain.com';

export const langSmithTraceSink = (opts: LangSmithOptions): TraceSink => ({
  async write(record: TraceRecord): Promise<void> {
    const startTime = new Date(new Date(record.at).getTime() - record.latencyMs).toISOString();
    const body = {
      name:
        record.status === 'ok' ? `judge ${record.postingId}` : `judge error ${record.postingId}`,
      run_type: 'llm',
      session_name: opts.project ?? 'fish-career',
      start_time: startTime,
      end_time: record.at,
      inputs: {
        postingId: record.postingId,
        postingHash: record.postingHash,
        profileHash: record.profileHash,
        rubric: record.rubric,
      },
      outputs: record.answers ? { answers: record.answers } : { error: record.error },
      extra: {
        metadata: {
          runId: record.runId,
          model: record.model,
          attempts: record.attempts,
          inputTokens: record.inputTokens,
          outputTokens: record.outputTokens,
          applicationVersion: record.version,
        },
      },
    };
    try {
      const res = await (opts.fetchImpl ?? fetch)(
        `${opts.endpoint ?? LANGSMITH_DEFAULT_ENDPOINT}/runs`,
        {
          method: 'POST',
          headers: {
            'x-api-key': opts.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        throw new Error(`langsmith responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
    } catch (err) {
      (opts.onError ?? (() => {}))(err);
    }
  },
});

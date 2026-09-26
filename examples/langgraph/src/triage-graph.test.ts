import { Command, INTERRUPT, isInterrupted } from '@langchain/langgraph';
import { describe, expect, it, vi } from 'vitest';
import { fakeApplication } from './app.js';
import { buildTriageGraph, initialState, type ReviewPayload } from './triage-graph.js';

const pause = async (threadId: string) => {
  const graph = buildTriageGraph(fakeApplication());
  const config = { configurable: { thread_id: threadId } };
  const first = await graph.invoke(initialState, config);
  const interrupts = isInterrupted(first) ? first[INTERRUPT] : [];
  return { graph, config, first, interrupts };
};

describe('optional LangGraph orchestration over the application API', () => {
  it('pauses for human review, then re-measures when the order disagrees', async () => {
    const { graph, config, interrupts } = await pause('agree-to-disagree');
    expect(interrupts).toHaveLength(1);
    const payload = interrupts[0]?.value as ReviewPayload;
    expect(payload.top.length).toBeGreaterThan(1);
    expect(payload.runId).toBeTypeOf('string');

    const humanOrder = payload.top.map((r) => r.postingId).reverse();
    const final = await graph.invoke(new Command({ resume: humanOrder }), config);
    expect(final.rho).toBeLessThan(0.8);
    expect(final.rechecked).toBe(true);
  });

  it('ends at approval without re-measuring', async () => {
    const { graph, config } = await pause('approve');
    const final = await graph.invoke(new Command({ resume: 'approve' }), config);
    expect(final.rho).toBeNull();
    expect(final.rechecked).toBe(false);
  });

  it('never touches the network: the fake application uses in-memory ports', async () => {
    vi.stubGlobal('fetch', () => {
      throw new Error('the example must not touch the network in fake mode');
    });
    const { interrupts } = await pause('offline');
    expect(interrupts).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});

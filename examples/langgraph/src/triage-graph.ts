// Optional orchestration: a LangGraph state machine over the fish.career
// application API. The deterministic ranking engine stays in the package;
// this graph sequences its use cases and pauses for human review where the
// review changes what happens next.
//
//   fetch -> triage -> review (interrupt) -> compare -> recheck -> END
//
// The recheck node re-measures the reviewed slice; it never reweights the
// rubric. Changing weights is a reviewed code change, not a graph decision.

import { fileURLToPath } from 'node:url';
import {
  Command,
  END,
  INTERRUPT,
  interrupt,
  isInterrupted,
  MemorySaver,
  START,
  StateGraph,
  StateSchema,
} from '@langchain/langgraph';
import type { CareerApplication } from 'fish-career/dist/application/career-application.js';
import { spearman } from 'fish-career/dist/domain/calibration.js';
import { z } from 'zod';
import { fakeApplication, liveApplication } from './app.js';

const Arrival = z.object({
  postingId: z.string(),
  company: z.string(),
  title: z.string(),
  comp: z.string(),
});

const Row = z.object({
  postingId: z.string(),
  company: z.string(),
  title: z.string(),
  composite: z.number(),
  blocker: z.number(),
});

export const TriageState = new StateSchema({
  arrivals: z.array(Arrival),
  rows: z.array(Row),
  runId: z.string().nullable(),
  humanOrder: z.array(z.string()).nullable(),
  rho: z.number().nullable(),
  rechecked: z.boolean(),
});

export const initialState = {
  arrivals: [] as { postingId: string; company: string; title: string; comp: string }[],
  rows: [] as {
    postingId: string;
    company: string;
    title: string;
    composite: number;
    blocker: number;
  }[],
  runId: null as string | null,
  humanOrder: null as string[] | null,
  rho: null as number | null,
  rechecked: false,
};

export interface ReviewPayload {
  runId: string | null;
  question: string;
  top: { postingId: string; company: string; title: string; composite: number; blocker: number }[];
}

const slimRows = (app: CareerApplication) => async (postingIds?: string[]) => {
  const outcome = await app.rankPostings(postingIds ? { postingIds } : {});
  return {
    rows: outcome.rows.map((r) => ({
      postingId: r.postingId,
      company: r.company,
      title: r.title,
      composite: r.composite,
      blocker: r.blocker,
    })),
    runId: outcome.runId,
  };
};

export const buildTriageGraph = (app: CareerApplication) => {
  const score = slimRows(app);
  const graph = new StateGraph(TriageState)
    .addNode('fetch', async () => {
      const outcome = await app.fetchPostings();
      return {
        arrivals: outcome.arrivals.map((a) => ({
          postingId: a.postingId,
          company: a.company,
          title: a.title,
          comp: a.comp,
        })),
      };
    })
    .addNode('triage', async () => score())
    .addNode('review', (state) => {
      const payload: ReviewPayload = {
        runId: state.runId,
        question: 'Approve the ranking, or return your own order of these posting IDs, best first.',
        top: state.rows.slice(0, 5),
      };
      const answer = interrupt(payload);
      return { humanOrder: Array.isArray(answer) ? (answer as string[]) : null };
    })
    .addNode('compare', (state) => {
      const judgeOrder = state.rows.map((r) => r.postingId);
      const human = state.humanOrder ?? [];
      const shared = human.filter((id) => judgeOrder.includes(id));
      const rho =
        shared.length < 2
          ? null
          : spearman(
              shared.map((_, i) => i),
              shared.map((id) => judgeOrder.indexOf(id)),
            );
      return { rho };
    })
    .addNode('recheck', async (state) => {
      const ids = state.humanOrder && state.humanOrder.length > 0 ? state.humanOrder : undefined;
      return { ...(await score(ids)), rechecked: true };
    })
    .addEdge(START, 'fetch')
    .addEdge('fetch', 'triage')
    .addEdge('triage', 'review')
    .addConditionalEdges('review', (state) => (state.humanOrder === null ? END : 'compare'))
    .addConditionalEdges('compare', (state) =>
      state.rho !== null && state.rho < 0.8 && !state.rechecked ? 'recheck' : END,
    )
    .addEdge('recheck', END);
  return graph.compile({ checkpointer: new MemorySaver() });
};

const printRows = (rows: (typeof initialState)['rows']): void => {
  rows.forEach((row, i) => {
    console.log(
      `${String(i + 1).padStart(2)}  ${(row.composite * 100).toFixed(0).padStart(3)}%  blocker ${row.blocker.toFixed(2)}  ${row.company}: ${row.title}`,
    );
  });
};

const main = async (): Promise<void> => {
  const live = process.argv.includes('--live') || process.env.FISH_LIVE === '1';
  const app = live ? liveApplication() : fakeApplication();
  console.log(
    live
      ? 'live mode: the real FISH_HOME, boards, and judge'
      : 'fake mode: in-memory board and the deterministic stand-in judge',
  );

  const graph = buildTriageGraph(app);
  const config = { configurable: { thread_id: 'fish-career-example' } };

  const fetched = await graph.invoke(initialState, config);
  const interrupts = isInterrupted(fetched) ? fetched[INTERRUPT] : [];
  if (interrupts.length === 0) {
    throw new Error('expected the graph to pause for human review');
  }
  console.log(`\nfetched ${fetched.arrivals.length} arrivals; paused for human review.`);
  printRows(fetched.rows);

  const payload = (interrupts[0]?.value ?? {}) as ReviewPayload;
  console.log(
    `\nThe graph is paused. A host would show the review payload and resume with the human order (run ${payload.runId}).`,
  );

  // Simulate a human who disagrees with the middle of the list.
  const humanOrder = payload.top.map((r) => r.postingId).reverse();
  console.log(`\nresuming with a reversed order: ${humanOrder.join(', ')}`);
  const final = await graph.invoke(new Command({ resume: humanOrder }), config);

  console.log(
    `\nagreement with the human: rho ${final.rho === null ? 'n/a' : final.rho.toFixed(2)}`,
  );
  if (final.rechecked) {
    console.log('the order disagreed below the threshold, so the reviewed slice was re-measured:');
    printRows(final.rows);
  }
  console.log(
    '\nthe rubric itself was not touched: reweighting is a reviewed diff in src/domain/rubric.ts, then `fish quality` measures it.',
  );
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

export { Command, isInterrupted };

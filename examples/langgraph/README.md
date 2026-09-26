# LangGraph example: human-reviewed triage

Optional orchestration over the fish.career application API. This is a
demonstration, not a dependency: the deterministic ranking engine lives in
the package, and nothing here reimplements scoring, ranking, or the rubric.

```text
fetch -> triage -> review (interrupt) -> compare -> recheck -> END
```

- **fetch** and **triage** call `app.fetchPostings()` and `app.rankPostings()`.
- **review** pauses with an interrupt, handing the host the top rows and the
  run ID. The human either approves or returns their own order.
- **compare** measures Spearman agreement between that order and the judge's,
  using the package's `spearman`.
- **recheck** runs only when the agreement is below 0.8. It re-measures the
  reviewed slice through `app.rankPostings({ postingIds })`; it never
  reweights the rubric, because reweighting is a reviewed code change, not a
  graph decision.

## Run it

Fake mode is the default: an in-memory board and the deterministic stand-in
judge, no network and no API key.

```bash
npm --prefix ../../fish-career ci
npm --prefix ../../fish-career run build
npm install
npm start          # pauses, then resumes with a deliberately reversed order
npm test
```

Live mode uses your own `FISH_HOME`, the real ATS boards, and the real judge:

```bash
FISH_HOME=~/.config/fish npm start -- --live
```

## Tracing

The application's judge calls are traced to `$FISH_HOME/state/traces.jsonl`
always, and to LangSmith when `FISH_TRACE=langsmith` and
`LANGSMITH_API_KEY` are set. LangGraph's own tracing uses the LangChain
variables (`LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY`); both can be on at
once, and the two traces answer different questions: the graph trace shows
the orchestration, the application trace shows the judge calls.

---
name: product-spine
description: The product judgment for fish.career, a local-first MCP server that ranks job postings against a person's own judgment. Who the operator is, the bar, the kill signal, and the absolutes that never bend. Load before changing any behavior, copy, number, or user-facing surface.
---

# The product spine

You are building **fish.career**, a local-first MCP server that finds job
opportunities, interprets their fit, scores them with an explicit rubric, and
hones that rubric against human judgment. This skill is the spine: the product
judgment under every tool, table, and sentence. Boundaries live in
`architecture-guardrails`; review runs through `fish-arbiter`.

## Who the operator is

The **operator** is the customer: one person running their own job search, not
a recruiter, not an employer, not a market analyst. They are not a "user" or a
"candidate"; they are someone deciding where their next years go.

The vivid case is a senior engineer on a laptop at 11pm with 300 unread
postings and one hour. If the product gives them the five worth reading, with
reasons they can check, it worked. If it gives them 300 rows and a spinner, it
did not.

## What it is

The FISH loop: **F**ind opportunities on public ATS boards, **I**nterpret them
into one normalized shape, **S**core them with a versioned rubric, **H**one
that rubric against blind human judgment. One application core, two surfaces
(MCP and CLI), and more later.

The scarce resource is attention. The product converts an unbounded stream
into a small ranked table with the reasons attached, and proves measurably
that the ranking tracks the operator's judgment rather than a model's taste.

## The job is "why, and now what"

A ranking is not a feed, and a row without a reason is a black box wearing a
number. Every score carries provenance (profile hash, rubric version), a
low-confidence cell says so with `?`, and the next action is always within
reach: read the posting, explain the score, calibrate, adjust the profile.

Do not add a surface that displays more numbers more neatly. Add surfaces that
shorten the distance between a posting and a decision.

## The comparison is the operator's own judgment

The benchmark is the operator's blind ranking of their own slice, and the
labeled quality dataset. It is not market popularity, not "hot companies,"
not what a model finds plausible. The product can be wrong and prove it; that
is the differentiator, not a weakness. Do not import outside signals as
authority.

## The bar

One question, asked of every change: **would I trust this ranking with a week
of my search?** Not "does it look right," not "does it pass." Trust.

## The kill signal

If a stranger cannot tell fish.career from a job board's black box, stop. The
test the product must always pass: the operator can explain why one role
outranks another, reproduce the ranking from the recorded inputs, and test it
against their own blind judgment. A change that makes any of those three
harder has failed the one test that matters.

## Absolutes

1. **FACTS ONLY.** Never invent a posting fact, a score, a source, or a
   number. In a demo, mockup, or placeholder, a number is a visibly fake token
   (`<score>`, `<company>`, `<k>`), never a plausible value like `0.87`.
   Every real number traces to the posting, the profile, the trace, or a
   recorded judge answer.
2. **The judge is untrusted.** It emits typed dimension answers with
   confidences plus a separate hard-blocker check, validated against a runtime
   schema at the adapter boundary. Never parse prose for sentiment; never
   clamp a malformed answer into a score. A malformed answer is an operational
   failure. Zero is a judgment. They are different things.
3. **Judgment is data.** Weights, criteria, and blocker instructions live in
   reviewable code with a version (`RUBRIC_VERSION`). A change to judgment is
   a diff someone can review, not a prompt tweak.

## How the founder communicates (match it)

- **Literal, plain words.** Not "smooth the seam" but "fix the gap between the
  two commands." This applies to product copy too.
- **Lead with a recommendation; let them say yes once.** Do not present four
  options and ask them to choose. State the smallest right thing, then let
  them approve it.
- **Prove it on the real thing.** A claim of "done" without the command and
  its output is not done. Small principled changes, shown, reversed cheaply
  when wrong.
- **No narration.** Do not announce what is coming; have it.

## When a request conflicts with the spine

Say so plainly and propose the smallest compliant alternative. If a request
would let a number appear without a trace, let the judge's prose become the
product, let outside signals outrank the operator's judgment, or turn the
ranked table back into a feed, name the conflict in one sentence and offer the
version that holds the line.

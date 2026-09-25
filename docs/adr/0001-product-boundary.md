# 0001: fish.career is the product, not a platform

Status: accepted · 2026-09-25

## Context

`fish.career` began as a personal pipeline and is now a public, local-first MCP
server: it polls public ATS boards, normalizes postings, scores them against a
candidate profile with an explicit versioned rubric, and calibrates that rubric
against human judgment. Its history already records a coherent progression from
ATS ingestion through scoring, evaluation, MCP exposure, operational hardening,
and the removal of personal assumptions.

That progression ended with open questions about identity and shape:

- Is `fish.career` one module in a larger planned platform, `fish.agency`?
- Should the repository be split now to create architectural symmetry?
- Should the work in front of the team be platformization (identity, tenancy,
  billing, a plugin model) before the current product is easy to install and use?

`fish.agency` is not part of the current product. It is broader but ambiguous,
it can imply recruiting or creative services, and the name is already in public
use by a retail design business. Designing toward a hypothetical parent product
would add tax to every decision and a buyer for none of it.

## Decision

1. **The public project, MCP server, and intended product remain
   `fish.career`.** The repository and npm-safe package name remain
   `fish-career`; the preferred CLI command is `fish`.

2. **The working product narrative is:** *fish.career is a local-first MCP
   server that finds job opportunities, interprets their fit, scores them with
   an explicit rubric, and hones that rubric against human judgment.* FISH is
   the supporting shorthand: **F**ind, **I**nterpret, **S**core, **H**one.

3. **The repository is not restarted, rewritten, or split merely to create
   architectural symmetry.** It stays a single public repository containing one
   application core (`src/`) with multiple interfaces over it: MCP over stdio
   and a CLI. Platformization, in this phase, means clean application contracts
   and replaceable adapters inside the working product, not extra repositories
   or packages.

4. **`fish.agency` is removed from the architecture documents.** It may remain
   an internal idea. No active document, issue, or milestone may design toward
   it.

5. **Git history is preserved.** The progression above is an asset and evidence
   of how the product was built. History is never rewritten for cosmetic
   narrative control.

6. **A private commercial repository is created only when there is a real
   second consumer.** Until then, the public repository owns the public ATS
   provider adapters, canonical posting contracts, profile and rubric
   contracts, ranking and blocker behavior, evaluation and calibration, local
   persistence and replayable traces, the stdio MCP server, CLI adapters, demo
   fixtures, and their tests and docs.

### Split triggers

Create the private repository only when at least one of these becomes true:

- A hosted customer-facing application starts development.
- Multi-user identity or tenant isolation is required.
- Customer or proprietary data must be kept outside the open repository.
- Deployment cadence diverges from the open-source package.
- A second team owns the hosted product.
- Billing, notification, or product-analytics infrastructure enters scope.

When that happens, the private product consumes the public application core
directly through stable TypeScript contracts or a published package. It does not
shell out to stdio merely to preserve an artificial boundary.

## Consequences

- The immediate roadmap is product quality, not platform construction: a
  five-minute install, a credential-free demo, one tested application API under
  both MCP and CLI, typed structured protocol results, and a measured ranking
  quality story.
- Architecture work is judged by the split triggers above. A change that makes
  an extraction cheaper is welcome; a change that performs the extraction early
  is out of scope.
- The public repository has a single sentence it can be described by, which the
  README, package metadata, and GitHub description must all agree on.

## Reversal criteria

Revisit this ADR when any split trigger becomes true, or if a genuine second
consumer appears. At that point the review is: which of the triggers fired, what
does the private consumer need, and can it consume the public core directly?

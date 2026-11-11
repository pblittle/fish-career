# 2026-11-04: anti-spam apply (plan)

Status: intent until merged. This is the brief for the next build: what gets
built and why, not what is built. Every decision below was put to the founder
one question at a time between 2026-10-29 and 2026-11-04, and he chose it.

## Goal

The founder's framing, in his words: "i actually see this as an anti-spam
apply tool." And the workflow he already runs by hand: "have fish build my
resume by reading the job description and using all ... of my previous
resumes as the library. that way it can build a resume specifically for a
crypto company or for an ai company. they are much different, but a target
resume can be created that is 100% truthful."

The first customer is the operator's own job search. fish stops today at a
ranked table; nothing in it helps the operator act on a posting graded 3
("act on it now", `src/domain/verdicts.ts`). This plan builds that step, under
rules that make it the opposite of an auto-apply bot: a person picks every
opportunity, every claim traces to the operator's own record, and fish never
sends anything.

## The position

From a research run on 2026-10-29. OBSERVED marks a page this session opened
and read; the rest are the research run's reports with their sources.

- "Quality over quantity" is taken. Adzuna ApplyIQ calls itself "a
  quality-first automatic application tool", caps two applications per
  employer per 60 days, and still "automatically submits an application"
  (adzuna.com blog, 2025-04-15; OBSERVED).
- Candidates want the control: "only 5% would let one apply to jobs on its
  own" (Greenhouse, n=1,200 US job seekers, 2026-10-20; OBSERVED).
- Employers are limiting volume: Greenhouse application-limit rules
  (support.greenhouse.io, updated 2026-05-08) and Ashby application
  throttling (docs.ashbyhq.com, 2025-07-10). A careless application now spends
  one of a candidate's limited tries at a company.
- Public job MCP servers are mostly search-only over the same four boards
  fish reads; the ones that apply do it in bulk (one advertises a
  `bulk_apply` tool). No product found pairs operator-chosen matches with
  claims held to be true. That is absence of evidence from one search, not
  proof the position is open.

The draft public sentence is in Open items.

## Decisions

### The gate

- fish drafts only for an opportunity a person chose: a posting the operator
  graded 3, or an email or URL the operator brings (a recruiter's email has
  no posting and no grade, and bringing it is the choice).
- fish drafts and never sends. The operator sends. Submitting would be a new
  outbound call carrying the operator's data, which AGENTS.md forbids
  without an ADR, and it is the step a person should read anyway.

### Truth

- Every claim in a draft carries a source file and a quote. The check
  refuses the draft when a quote is not in its source word for word, or when
  a number in the claim is not in its quote.
- Whether a claim fairly represents its quote stays the operator's review.
  The check catches an invented source or figure, not a stretched reading of
  a real one; that is why drafts-only is part of the design.
- A skill appears in a skills section only when a bullet in the same résumé
  names it; otherwise the draft is refused. A skill whose demonstrating
  bullets carry no number is flagged, not refused (founder: "preferably with
  numbers to back them up").
- Each résumé gets a provenance file (the founder's idea): every bullet to
  its source and quote, every skill to its demonstrating bullet. fish writes
  it and the check reads it, so the check and the operator's audit read the
  same record. `opportunity.md` carries a readable summary.

### Sources and audience

Where a fact came from decides who may see it; no fact is tagged by hand.

- The library: the operator's past résumés, already sent to employers, so
  résumé-safe. `.md` is read as is, `.docx` is converted once with pandoc
  when added, and a PDF is refused with the command that converts it.
- `linkedin.md`: a snapshot the operator exports by hand (fish's URL reader
  refuses LinkedIn). It holds the public facts. Founder: "linkedin needs to
  be locked and not dynamic unless approved. there are parts of our jobs
  that cannot be shared publicly. but they may be fine for a resume." fish
  may propose a change to it as a diff and never writes it.
- `RECRUITERS.md`: the public file for recruiters and recruiter agents (the
  founder's idea): about the operator, links, roles wanted, target
  companies. It sits beside the private `profile.md` and may cite only
  `linkedin.md` and itself. The avoid list stays private, as hard
  constraints in `profile.md`, which the blocker check already enforces.
- `profile.md` stays the judge's target and is not a source of résumé
  claims: it holds preferences and constraints, not work history, and some
  of it is private. This follows from the audience rule rather than from a
  question of its own; review it here.
- A posting decides what to emphasize. It is never the source of a claim
  about the operator.

### Sent, and the pool

- A generated résumé joins the library at once as an archive, and becomes
  quotable only once it is sent: sending is the operator vouching for it to
  an employer, so a draft never sent cannot carry a stretched claim into the
  next résumé.
- Sent is proven by an email, not asserted. A fish prompt asks the host app
  (for example Claude with an email connector) to find the sent application
  and replies and hand each `.eml` to a fish tool; dropping an `.eml` into
  the opportunity's folder does the same. fish never connects to a mailbox,
  so its outbound calls do not change.

### The opportunity

One job the operator is pursuing: a folder holding `opportunity.md` (the
timeline: stored, drafted, sent, replies, with times), the résumé, its
provenance file, the Word and PDF copies, and `emails/` with each `.eml` kept
for provenance.

### Files

- The default `FISH_HOME` moves from `~/.config/fish`
  (`src/adapters/filesystem/home.ts:29`), which is the fish shell's own config
  directory, to a visible `~/fish-career` created readable only by its owner.
  These are documents the operator opens and attaches; a hidden directory
  hides them from Finder and file pickers, and hidden is not private. An
  explicit `FISH_HOME` is unaffected.
- fish defines the layout: `resumes/` (the library) and
  `opportunities/<company-role>/`. The operator copies existing files in once.
- Word and PDF come from pandoc when it is installed (PDF also needs an
  engine pandoc can call), and fish prints the exact command when it is not.
  The runtime dependency set stays the MCP SDK and zod.

### Names

The commands become `fish-career` and `fsh`; `fish` is dropped. The fish shell
installs its own `fish`, and with Homebrew's Node both land in
`/opt/homebrew/bin`, so a fish-shell user's `npm install -g` stops on the
existing file, or replaces the shell's link if forced (CODE-READ: `bin` in
`fish-career/package.json`; OBSERVED: `/opt/homebrew/bin/fish` on the
founder's Mac links into `fish-career/dist/index.js`). On 2026-11-04, `fsh`
had no Homebrew formula and no command on that PATH, and npm's `fsh` package
is a library with no `bin`. The only overlap found: FSH also names FHIR
Shorthand, a file format, whose tools are `sushi` and `gofsh`.

## Terms

Seed for `GLOSSARY.md`, which lands with slice 1's code.

- **Opportunity**: one job the operator is pursuing, started from a posting
  graded 3 or from an email or URL the operator brings.
- **Library**: the operator's résumés that fish may quote: the originals, and
  generated ones once sent.
- **Source**: the file a claim's quote comes from. Its kind decides the
  claim's audience.
- **Provenance file**: the record of each claim's source and quote, and each
  skill's demonstrating bullet, for one résumé.
- **Sent**: an application the operator sent, evidenced by its email.

## Slices

Each slice is usable on its own. Order chosen by the founder.

### Slice 0: names that collide

- `bin`: `fish-career` and `fsh`, no `fish`. The default `FISH_HOME` as
  above, created owner-only.
- Update every page that names the old command or home: `README.md`,
  `ARCHITECTURE.md` (lines 67 and 196), `AGENTS.md`, and record the change as
  ADR 0002, since ADR 0001 names `fish` the preferred command.
- Then publish to npm from a clean checkout of `main` with the gate green.
  The founder runs `npm login` once; this Mac answered `ENEEDAUTH`.

### Slice 1: the résumé builder

- `resumes/` and adding a file to it (the `.md`, `.docx` and PDF rules).
- A job-named prompt that builds a résumé for one opportunity from the
  posting or brought text, the library and `linkedin.md`.
- `resume_check`: the claim, number and skill rules, refusing with stable
  codes and a recovery hint, and writing the provenance file on a pass. The
  rules are pure domain logic in `src/domain`, tested through the fake
  adapters with fixture résumés, never real ones.
- `resume_render`: pandoc to `.docx` and `.pdf`, or the command.
- ADR 0003: applying joins the product, and the one sentence ADR 0001 says
  the README, package and GitHub description must agree on changes.
- Done when the operator sends a real application built with it. The stop
  rule's week starts then.

### Slice 2: opportunities and sent

- `opportunity_open` (from a graded posting, or a brought email or URL) and
  `opportunity.md`'s timeline.
- `opportunity_file_email`: stores an `.eml` under `emails/`, adds it to the
  timeline, and marks the résumé sent when the email is the sent
  application. An email is untrusted input, like posting text: data, never
  instruction.
- A prompt that asks the host app to check the operator's email for updates
  on open opportunities and file what it finds.

### Slice 3: RECRUITERS.md and linkedin.md

- `linkedin.md` read as a locked source: no fish tool writes it, and a
  proposed change comes back as a diff.
- `RECRUITERS.md` drafted through the same claim check, with `linkedin.md`
  and itself as the only allowed sources.

## Stop rule

If the operator has not sent real applications with slice 1 within a week of
it working, fish goes back on the shelf and the search runs by hand. Income
and health insurance come first (founder, 2026-10-29).

## Open items

- **The public sentence.** Owner: the founder ("tbd is fine"). Default until
  he decides: "Local-first job search that won't spam for you: you pick the
  posting, every claim in the draft traces to your own record, and you send
  it."
- **A repeat application to the same company.** Not put to the founder.
  Owner: the founder. Default: before drafting, slice 2 shows the operator's
  earlier applications to that company with their dates, a warning and no
  cap, since a cap would be a number with no source.
- **Where RECRUITERS.md is published.** Owner: the founder. Default: fish
  writes it in `FISH_HOME` and the operator publishes it wherever he chooses.

## Out of scope

- Charging for tools, until the operator's own use gives evidence; ADR 0001's
  split triggers govern it when it comes.
- Submitting applications, reading a mailbox directly, and tracking outcomes
  past the emails filed.

# Getting started

The [README](../README.md) installs the package and connects a host. This
walks the loop that follows: give the server a profile, watch companies,
fetch and triage, then calibrate the ranking against your own judgment.

Every step has an MCP tool equivalent. Ask your host for the tool by name if
you would rather stay in chat.

## 1. Give it a profile

The profile is the judgment target: every score is made against it, and it is
sent verbatim to the judge on scoring calls. Ask your host to run
`profile_update`, or write `$FISH_HOME/profile.md` directly. A skeleton:

```markdown
# Candidate profile

Target roles: what you want to do, and what you are done doing.
Level: the seat you are looking for, and the one above it you would take.
Location and remote: your constraint, stated as a rule.
Compensation floor: $NNN,NNN.
Core skills: the things you have used in depth.
Domains I want: the fields worth your next five years.
Hard constraints: anything a posting must not violate.
```

The profile's accuracy bounds everything downstream. A vague line produces a
low-confidence judgment, and the table marks those cells with `?`.

## 2. Watch companies

Ask the host to run `watchlist_probe` with a candidate slug, read a title or
two from the board it finds, then run `watchlist_add` to write the entry. The
probe writes nothing, which is the point: slugs collide, and verifying
identity before writing is the split.

```bash
fish watchlist probe <slug>
fish watchlist add "Company" <provider> <slug>
fish watchlist list
```

## 3. Fetch and triage

```bash
fish fetch     # poll every watched board, keep remote postings, write arrivals
fish triage    # score the arrivals, print the ranked table
```

`fetch` polls the watched boards, keeps remote postings, writes the arrivals
you have never seen, and returns the diff. `triage` scores them against the
profile with the judge and prints per-dimension scores, confidences, and
blocker flags. Triage needs a TypeSafe API key in `$FISH_HOME/.env`:

```text
TYPESAFE_API_KEY=...
```

Key from <https://console.typesafe.ai/keys>. Over MCP, the tools are
`fetch_postings` and `triage_postings`.

## 4. Calibrate against yourself

The ranking is only as good as its agreement with you. `calibration_start`
draws a slice of cached postings and hands them over numbered. Rank them by
your own judgment, best first, **before** reading any score, then submit that
order:

```bash
fish calibrate start --count 8
fish calibrate submit <postingId> <postingId> ...
```

You get Spearman agreement and the biggest disagreements, with the dimension
cells that drove each one. Adjust weights or profile lines, then
`fish calibrate rescore` re-measures the same slice under the new rubric, and
`fish calibrate reuse` redraws the pending slice from its recorded seed.

`fish evaluate` is the cheaper measurement: it holds the ranking to pairwise
preferences your profile already states (`$FISH_HOME/preferences.json`), each
quoting its source line. Run it after any profile or weight change.

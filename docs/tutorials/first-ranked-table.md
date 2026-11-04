# Your first ranked table

In about fifteen minutes you will build fish.career from source, read its
quality report, and run the whole loop on a real job board: watch a company,
fetch its postings, rank them, grade one, and measure the ranking against
your own order. You need no API key; a deterministic stand-in judge answers
the scoring questions, and everything happens in a practice directory you
delete at the end.

## What you'll need

- Node 20.12 or later, and git.
- A network connection (the job boards are public APIs).
- A terminal open where you want the clone.

## Step 1: Build and install

```bash
git clone https://github.com/pblittle/fish-career.git
cd fish-career
npm ci --prefix fish-career
npm run build --prefix fish-career
npm install -g ./fish-career
fish --version
```

The last line prints the version. `npm install -g` links the clone, so a
later rebuild updates the command.

If you use the fish shell, `npm install -g` stops because the shell already
owns the `fish` command. Skip the global install and type
`node fish-career/dist/index.js` everywhere this tutorial says `fish`.

## Step 2: Read the quality report

```bash
fish quality
```

```text
ranking quality against 17 labeled postings (16 scored, k=5)

pairwise accuracy  92.3%  ###############.
kendall tau        73.7%  ##############..
spearman rho       86.3%  ###############.
precision@5       100.0%  ################
ndcg@5            98.4%  ################
blockers below clean rows: yes
```

This is fish measuring itself: 17 postings graded by hand, ranked by a
recorded judge run, and compared. It needs no key and no state. The table
below the metrics shows each posting's rank next to its hand grade; the
[quality spec](../../specs/quality.md) explains every number.

## Step 3: Make a practice home

fish keeps all of its state in one directory. Point it at a fresh one and
turn on the stand-in judge:

```bash
export FISH_HOME="$HOME/fish-tutorial"
mkdir -p "$FISH_HOME"
echo "FISH_JUDGE=fake" > "$FISH_HOME/.env"
fish profile set fish-career/eval/profile.md
fish profile get
```

`profile get` prints the profile back. This one is the fixture the quality
dataset is judged against; your own goes in the same place later. Every
score is a judgment against the profile, so fish refuses to score without
one.

## Step 4: Watch a company

Look a company's board up before you add it, because the same slug can name
different companies on different job boards:

```bash
fish watchlist probe langchain
```

```text
Probe of "langchain":
ashby: <n> postings
...
ashby: <three sample titles>
```

The titles confirm it is the company you meant. Add it:

```bash
fish watchlist add LangChain ashby langchain
```

A posting URL works too: `fish watchlist add <posting-url>` reads the
provider and slug from it.

## Step 5: Fetch postings

```bash
fish fetch
```

```text
LangChain: <total> postings, <remote> remote, <new> new

<new> new postings written to the cache.
Dropped before writing: <n> not remote, 0 off target, 0 too thin to score, <n> out of window.
First run: only postings newer than 14 days were written.
Rank them with: fish triage
```

fish keeps remote postings only, and on the first poll only the last 14
days. Every posting it saw is remembered, so the next `fish fetch` writes
only what is new. If the window left nothing, widen it: `fish fetch --days
45`.

## Step 6: Rank them

```bash
fish triage
```

```text
rank  posting                                        match  skills  level  loc    comp   domain  blocker
  1  LangChain: <title>                              <n>%   <n>%   <n>%   <n>%   <n>%   <n>%   0.05
...
Run <run id>.
```

Each row is five scored dimensions, their weighted composite (`match`), and
a separate hard-blocker check. The stand-in judge answers with keyword rules,
so this table shows the pipeline working, not a real opinion of the
postings. A `?` after a cell marks a dimension the judge answered with low
confidence.

## Step 7: Grade an arrival

Your own grade is the measurement that matters most. List what is ungraded
and grade one:

```bash
fish arrivals
fish arrivals grade <postingId> 2
fish arrivals summary
```

The scale is 3 act on it now, 2 worth a look, 1 a miss, 0 should not
surface. `summary` reports `no read` until you have graded 45, rather than
a precision figure from too few grades.

## Step 8: Measure the ranking against your order

Draw a small slice and rank it yourself before looking at any scores:

```bash
fish calibrate start --count 4
fish calibrate submit <postingId> <postingId> <postingId> <postingId>
```

Pass the four IDs in your order, best first. fish scores the same slice and
prints the Spearman agreement between your order and the judge's, plus the
postings you disagree on most and the dimensions that drove each.

## Step 9: Clean up

```bash
rm -rf "$HOME/fish-tutorial"
unset FISH_HOME
```

## What you built

You ran the loop fish is built around: watch boards, fetch the diff, rank it
against a profile, and check the ranking against your own judgment. To run
it for real:

- Write your own profile and point fish at a home of your own
  ([configuration](../reference/configuration.md)).
- Switch on the real judge ([How to configure the judge](../how-to/configure-the-judge.md)).
- Drive it from Claude Desktop, Cursor, or opencode
  ([How to connect an MCP host](../how-to/connect-an-mcp-host.md)).
- Keep the ranking honest ([How to tune the ranking](../how-to/tune-the-ranking.md)).

Every command is in the [CLI reference](../reference/cli.md).

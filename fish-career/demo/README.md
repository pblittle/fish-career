# The demo fixtures

`fish demo` runs the real pipeline—fetch, triage, evaluate, calibrate—over
these fixtures with no API key and no network. Everything here is public: the
postings are real postings from LangChain's public Ashby board, captured
2026-09-15 through 2026-09-18, and the profile is a generic stand-in, not
anyone's real profile.

- `profile.md` — a fixture candidate profile. It states a floor, a geography,
  skills, and domains so the stand-in judge has something to read.
- `watchlist.json` — LangChain on the `fixture` provider.
- `boards.json` — the board's posting list; the fixture provider serves it.
- `postings/` — the real postings, in the same header format fetch writes.
- `preferences.json` — pairwise preferences quoting fixture profile lines.
- `human-ranking.json` — the blind human order used by the calibration stage.

What the set exercises, all of it real board behavior:

- Three regional variants of the Deployed Architect role collapse to one row
  that names Dallas and Austin.
- The APAC posting is remote but Singapore-based; the location dimension
  scores it below the US remote roles.
- The New York and San Francisco hybrid postings never enter the cache: the
  fixture provider reports the board's remote flag, and fetch keeps remote
  postings only, exactly as the real pipeline does.
- Compensation is stated in the posting bodies but not the board headers, so
  the comp dimension has to read the body.

The demo copies these into a temp `FISH_HOME`, runs, and removes it. Nothing
here is read from or written to your real state.

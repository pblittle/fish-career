# How to find out why fish missed a posting

When you find a posting somewhere else that fish never showed you, find the
stage where fish lost it, and recover it when it can be recovered.

## Prerequisites

- The posting's URL. A job search site's URL (LinkedIn, Indeed, HiringCafe,
  and others) does not name the employer's board; open the posting there and
  copy the employer's own application URL instead.

## Steps

1. Ask fish how far the posting got:

   ```bash
   fish recall <url>
   ```

   Several URLs at once is fine. Each line starts with the furthest stage the
   posting reached.

2. Act on the stage. What each stage means is defined once, in the
   known-item recall table of [`specs/quality.md`](../../specs/quality.md):

   | Stage | What to do |
   |---|---|
   | `written` | `fish triage`, then `fish postings read <postingId>` |
   | `dropped`, too old | Run the `fish fetch --company X --days N` recall prints |
   | `dropped`, too thin | Nothing; fish never scores a posting with no text to judge |
   | `not fetched` | `fish fetch` |
   | `off target` | Remove the phrase recall names from `skip-titles.txt`, if it was too broad |
   | `not remote` | Nothing; fish keeps remote postings only |
   | `not listed` | Nothing; it closed, or was never on that board |
   | `unreadable` | Run recall again later |
   | `not watched` | `fish watchlist add <url>`, then `fish fetch` |
   | `board URL` | `fish watchlist add <url>` if you want the board watched |
   | `other system`, `job site`, `unknown` | Find the posting on the employer's own Ashby, Greenhouse, Lever, or SmartRecruiters board, if it has one |

## Verification

Run `fish recall <url>` again. A recovered posting reports `written`.

## Troubleshooting

- **Recall reads boards live.** A posting fish has never seen costs one read
  of each watched board that could carry it, once per board per run, so a
  board that is down shows as `unreadable` rather than failing the command.
- **The counts at the end are a case log, not a recall rate.** They describe
  the URLs you passed and nothing else.

Related: [`fish recall`](../reference/cli.md#fish-recall).

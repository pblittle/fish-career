# How to tune the ranking

Find where the ranking disagrees with your judgment and fix the cause: a
vague profile line, a title you never want, or a pair the ranking keeps
getting backwards.

## Prerequisites

- A `FISH_HOME` with a profile, a watchlist, and cached postings.
- A judge ([How to configure the judge](./configure-the-judge.md)).

## Steps

1. **Measure against your own blind order.** Draw a slice and rank it before
   you look at any score:

   ```bash
   fish calibrate start --count 8
   fish calibrate submit <postingId>...
   ```

   The result is Spearman agreement and the biggest disagreements, each with
   the dimension cells that drove the judge's side.

2. **Read each disagreement as one of three causes.**
   - A dimension answered at low confidence (`?`, or a low `conf` in the
     disagreement line) means the profile line it reads is too vague.
     Sharpen that line: `fish profile set <path>`.
   - A confident dimension you weigh differently is a weight question. A
     weight change is a code change, reviewed and measured
     ([How to change the rubric](./change-the-rubric.md)).
   - Sometimes the slice changes your mind; nothing needs fixing.

3. **Re-measure the same slice.**

   ```bash
   fish calibrate rescore
   ```

   It prints the previous and the new rho against the order you already
   gave. `fish calibrate reuse` shows the slice again.

4. **Write down the pairs you already know.** For postings where one must
   rank above another, add the pair to `$FISH_HOME/preferences.json` with the
   profile line it comes from:

   ```json
   {
     "preferences": [
       {
         "better": "<postingId>",
         "worse": "<postingId>",
         "source": "<the profile line that says why>"
       }
     ]
   }
   ```

   Then run `fish evaluate` after every profile change. It reports how many
   pairs hold and quotes the source line of each that does not.

5. **Skip titles you never want.** Add phrases to
   `$FISH_HOME/skip-titles.txt`, one per line:

   ```text
   # Roles I am not looking for
   account executive
   ```

   Fetch stops writing those titles and triage sets cached ones aside. A
   one-word phrase reaches far (`marketing` also skips "Staff Web Engineer,
   Marketing"), so prefer the longer phrase. Deleting a phrase lets the next
   poll write what it skipped.

## Verification

`fish calibrate rescore` shows rho moving toward 1, `fish evaluate` shows
every pair satisfied, and the next `fish triage` table reads the way you
would order it. Over time, `fish arrivals summary` is the standing measure:
the share of fetched postings you grade worth a look or better.

## Troubleshooting

- **`The ranking is missing N of the pending slice's postings`.** Submit
  every ID from the slice, not a subset.
- **`No preference could be judged`.** The pairs name postings that are not
  in the cache; use IDs from `fish postings list`.
- **A posting with a skipped title still got scored.** It was named:
  `fish triage <postingId>` scores a named posting whatever its title.

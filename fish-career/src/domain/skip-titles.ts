// Titles the operator never wants fetched. The phrases live in
// skip-titles.txt, one per line. A phrase matches a title when its words
// appear in the title side by side and in order, compared as whole words in
// any case; punctuation only separates words. So "designer" skips "Product
// Designer II" and keeps "Director, Product Design", and "account executive"
// keeps "Enterprise Account Exec": an abbreviation is another word.

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

// A # at the start of a line, or after a space, starts a comment, so
// "C# developer" stays a phrase. A line with no words is not a phrase.
export const parseSkipTitles = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)#.*$/, '').trim())
    .filter((line) => words(line).length > 0);

// The first phrase, in the order given, that the title matches; null when
// none does. Recall names the phrase, so the operator can find the line.
export const offTargetPhrase = (title: string, phrases: readonly string[]): string | null => {
  const t = words(title);
  for (const phrase of phrases) {
    const p = words(phrase);
    if (p.length === 0) continue;
    for (let i = 0; i + p.length <= t.length; i += 1) {
      if (p.every((w, j) => t[i + j] === w)) return phrase;
    }
  }
  return null;
};

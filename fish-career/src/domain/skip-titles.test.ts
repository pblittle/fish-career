import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { offTargetPhrase, parseSkipTitles } from './skip-titles.js';

// Real titles from the 2026-10-03 polls, each with the phrase that must skip
// it under a test list, or null where the title must be kept.
interface TitleCase {
  title: string;
  skip: string | null;
  why: string;
}

const { phrases, cases } = JSON.parse(
  readFileSync(new URL('../fixtures/skip-titles.json', import.meta.url), 'utf8'),
) as { phrases: string[]; cases: TitleCase[] };

describe('offTargetPhrase', () => {
  it.each(cases)('$why: $title', ({ title, skip }) => {
    expect(offTargetPhrase(title, phrases)).toBe(skip);
  });

  it('skips a recorded title with every phrase in the test list', () => {
    const used = new Set(cases.map((c) => c.skip));
    expect(phrases.filter((p) => !used.has(p))).toEqual([]);
  });

  it('matches whole words only', () => {
    expect(offTargetPhrase('Design Engineer', ['designer'])).toBeNull();
    expect(offTargetPhrase('Salesforce Engineer', ['sales'])).toBeNull();
    expect(offTargetPhrase('Product Designer', ['DESIGNER'])).toBe('DESIGNER');
  });

  it('needs the phrase words side by side and in order', () => {
    expect(offTargetPhrase('Account Executive', ['executive account'])).toBeNull();
    expect(offTargetPhrase('Account Team Executive', ['account executive'])).toBeNull();
  });

  it('never matches a phrase without words, or an empty list', () => {
    expect(offTargetPhrase('Product Designer', ['--', ''])).toBeNull();
    expect(offTargetPhrase('Product Designer', [])).toBeNull();
  });
});

describe('parseSkipTitles', () => {
  it('reads one phrase per line and drops comments and blank lines', () => {
    const text = [
      '# Titles I never want scored',
      '',
      '  designer  ',
      'account executive # and the abbreviation, below',
      'account exec',
      '\t# an indented comment',
      'C# developer',
      '---',
    ].join('\r\n');
    expect(parseSkipTitles(text)).toEqual([
      'designer',
      'account executive',
      'account exec',
      'C# developer',
    ]);
  });

  it('reads an empty file as no phrases', () => {
    expect(parseSkipTitles('')).toEqual([]);
  });
});

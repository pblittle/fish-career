import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AGGREGATORS,
  matchesKey,
  OTHER_SYSTEMS,
  parsePostingUrl,
  sameBoard,
  type UrlTarget,
} from './posting-url.js';

// Real URLs from the 2026-10-03 research, each with the parse it must get.
interface UrlCase {
  shape: string;
  url: string;
  expect: UrlTarget;
}

const { cases } = JSON.parse(
  readFileSync(new URL('../fixtures/posting-urls.json', import.meta.url), 'utf8'),
) as { cases: UrlCase[] };

describe('parsePostingUrl', () => {
  it.each(cases)('$shape: $url', ({ url, expect: target }) => {
    expect(parsePostingUrl(url)).toEqual(target);
  });

  it('names every system and site it knows from a recorded URL', () => {
    const recorded = new Set(
      cases.map(({ expect: t }) =>
        t.kind === 'unsupported' ? t.system : t.kind === 'aggregator' ? t.site : '',
      ),
    );
    for (const [, name] of [...OTHER_SYSTEMS, ...AGGREGATORS]) {
      expect(recorded, name).toContain(name);
    }
  });

  it('reads a URL pasted without its scheme or with whitespace around it', () => {
    expect(parsePostingUrl('jobs.lever.co/vida/8fd2c844-ad71-4732-8574-2c3a3cc98bdc')).toEqual({
      kind: 'posting',
      provider: 'lever',
      slug: 'vida',
      jobId: '8fd2c844-ad71-4732-8574-2c3a3cc98bdc',
    });
    expect(parsePostingUrl('  https://jobs.ashbyhq.com/temporal\n')).toEqual({
      kind: 'board',
      provider: 'ashby',
      slug: 'temporal',
    });
  });

  it('is unknown for text that is not a web URL', () => {
    for (const text of ['', 'Acme', 'not a url', 'ftp://jobs.lever.co/vida']) {
      expect(parsePostingUrl(text), text).toEqual({ kind: 'unknown' });
    }
  });
});

describe('matchesKey', () => {
  const deepgram = parsePostingUrl(
    'https://jobs.ashbyhq.com/Deepgram/c91de352-9f25-479e-8877-fbea9576a52c',
  );

  it('ignores slug case on the boards whose APIs ignore it', () => {
    expect(matchesKey(deepgram, 'ashby:deepgram:c91de352-9f25-479e-8877-fbea9576a52c')).toBe(true);
    const experian = parsePostingUrl(
      'https://jobs.smartrecruiters.com/Experian/744000140984547-senior-director-ai-platform-engineering-remote-',
    );
    expect(matchesKey(experian, 'sr:experian:744000140984547')).toBe(true);
    const honor = parsePostingUrl('https://boards.greenhouse.io/honor/jobs/8297124002');
    expect(matchesKey(honor, 'gh:Honor:8297124002')).toBe(true);
  });

  it('keeps slug case on Lever, whose API does not ignore it', () => {
    // On 2026-10-03, api.lever.co listed 14 postings for "vida" and answered
    // "Document not found" for "Vida".
    const vida = parsePostingUrl('https://jobs.lever.co/vida/8fd2c844-ad71-4732-8574-2c3a3cc98bdc');
    expect(matchesKey(vida, 'lever:vida:8fd2c844-ad71-4732-8574-2c3a3cc98bdc')).toBe(true);
    expect(matchesKey(vida, 'lever:Vida:8fd2c844-ad71-4732-8574-2c3a3cc98bdc')).toBe(false);
  });

  it('matches a slug however the watchlist spells its encoding', () => {
    const hippocratic = parsePostingUrl(
      'https://jobs.ashbyhq.com/hippocratic%20ai/873d8ad7-9f41-48af-82a9-93ea6ed9139d',
    );
    for (const slug of ['hippocratic ai', 'hippocratic%20ai', 'Hippocratic AI']) {
      expect(
        matchesKey(hippocratic, `ashby:${slug}:873d8ad7-9f41-48af-82a9-93ea6ed9139d`),
        slug,
      ).toBe(true);
    }
  });

  it('matches a Greenhouse job on an employer site to any watched Greenhouse board', () => {
    const coinbase = parsePostingUrl(
      'https://www.coinbase.com/careers/positions/8124224?gh_jid=8124224',
    );
    expect(matchesKey(coinbase, 'gh:coinbase:8124224')).toBe(true);
    expect(matchesKey(coinbase, 'gh:coinbase:8124225')).toBe(false);
    expect(matchesKey(coinbase, 'lever:coinbase:8124224')).toBe(false);
  });

  it('never matches across providers, jobs, or targets that name no posting', () => {
    expect(matchesKey(deepgram, 'lever:deepgram:c91de352-9f25-479e-8877-fbea9576a52c')).toBe(false);
    expect(matchesKey(deepgram, 'ashby:deepgram:844ec2d9-4256-4be0-a6c6-78ebf1391a78')).toBe(false);
    expect(matchesKey(deepgram, 'ashby:deepgram')).toBe(false);
    for (const url of [
      'https://jobs.ashbyhq.com/deepgram',
      'https://creditacceptance.wd5.myworkdayjobs.com/en-US/Credit_Acceptance',
      'https://www.indeed.com/viewjob?jk=9d6c8e3a01cfc4b9',
      'https://www.atlassian.com/company/careers/details/25780',
    ]) {
      expect(matchesKey(parsePostingUrl(url), 'ashby:deepgram:c91de352'), url).toBe(false);
    }
  });
});

describe('sameBoard', () => {
  it('follows the provider: case-blind on Ashby, Greenhouse, SmartRecruiters; exact on Lever', () => {
    expect(
      sameBoard({ provider: 'ashby', slug: 'Deepgram' }, { provider: 'ashby', slug: 'deepgram' }),
    ).toBe(true);
    expect(
      sameBoard(
        { provider: 'ashby', slug: 'hippocratic%20ai' },
        { provider: 'ashby', slug: 'hippocratic ai' },
      ),
    ).toBe(true);
    expect(
      sameBoard({ provider: 'lever', slug: 'Vida' }, { provider: 'lever', slug: 'vida' }),
    ).toBe(false);
    expect(
      sameBoard({ provider: 'ashby', slug: 'vida' }, { provider: 'lever', slug: 'vida' }),
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import type { RecallCase } from '../../application/recall.js';
import { renderRecall } from './recall.js';

const url = 'https://jobs.lever.co/vida/00000000-0000-4000-8000-000000000001';

describe('renderRecall', () => {
  it('prints one line per URL, labeled by stage, then the stages counted', () => {
    const cases: RecallCase[] = [
      {
        url,
        stage: 'written',
        company: 'Vida',
        title: 'Engineer',
        postingId: 'vida-1',
        score: 0.714,
      },
      {
        url,
        stage: 'written',
        company: 'Vida',
        title: 'Analyst',
        postingId: 'vida-2',
        score: null,
      },
      {
        url,
        stage: 'dropped',
        company: 'Vida',
        title: 'Writer',
        reason: 'out-of-window',
        observedAt: '2026-10-03T12:00:00.000Z',
      },
      { url, stage: 'dropped', company: 'Vida', title: 'Editor' },
      { url, stage: 'not-fetched', company: 'Vida', title: 'Designer' },
      {
        url,
        stage: 'off-target',
        company: 'Vida',
        title: 'Product Designer II',
        phrase: 'designer',
      },
      { url, stage: 'not-remote', company: 'Vida', title: 'Manager', workplace: 'Hybrid' },
      { url, stage: 'not-listed', company: 'Vida' },
      { url, stage: 'unreadable', company: 'Gone', error: 'no board gone on lever' },
      { url, stage: 'not-watched', names: 'ashby/deepgram' },
      { url, stage: 'not-watched', names: 'greenhouse' },
      { url, stage: 'board-url', names: 'lever/vida', company: 'Vida' },
      { url, stage: 'job-site', names: 'HiringCafe' },
      { url, stage: 'other-system', names: 'Workday' },
      { url, stage: 'unknown' },
    ];
    expect(renderRecall(cases)).toEqual([
      'written       Vida: Engineer, score 0.71 [vida-1]',
      'written       Vida: Analyst, not scored yet [vida-2]',
      'dropped       Vida: Writer, outside the recency window when first seen on 2026-10-03',
      'dropped       Vida: Editor, before fish recorded why',
      'not fetched   Vida: Designer is listed and remote; run fish fetch',
      'off target    Vida: Product Designer II matches "designer" in skip-titles.txt',
      'not remote    Vida: Manager is listed as Hybrid',
      `not listed    Vida's board does not list it now: ${url}`,
      `unreadable    Gone's board could not be read (no board gone on lever): ${url}`,
      `not watched   ashby/deepgram; add it with fish watchlist add ${url}`,
      `not watched   no greenhouse board is on the watchlist: ${url}`,
      `board URL     names lever/vida, watched as Vida, not a posting: ${url}`,
      `job site      on HiringCafe, a job search site; find the employer's own posting URL: ${url}`,
      `other system  on Workday, which fish does not read: ${url}`,
      `unknown       not a job board fish knows: ${url}`,
      '',
      '15 URLs: 2 written, 2 dropped, 1 not fetched, 1 off target, 1 not remote, 1 not listed, 1 unreadable, 2 not watched, 1 board URL, 1 unknown, 1 job site, 1 other system.',
    ]);
  });

  it('names the boards it checked for a job URL that names none', () => {
    const [line] = renderRecall([
      { url, stage: 'not-listed', names: 'greenhouse', checked: ['Tebra', 'Honor'] },
    ]);
    expect(line).toBe(
      `not listed    no watched greenhouse board lists it now (Tebra, Honor): ${url}`,
    );
  });

  it('gives the location when the board states no workplace', () => {
    const [line] = renderRecall([
      {
        url,
        stage: 'not-remote',
        company: 'cloudflare',
        title: 'Engineer',
        workplace: '',
        location: 'Austin, TX',
      },
    ]);
    expect(line).toBe('not remote    cloudflare: Engineer is listed at Austin, TX, not remote');
  });

  it('says why a dropped posting was too thin', () => {
    const [line] = renderRecall([
      { url, stage: 'dropped', company: 'Vida', title: 'Writer', reason: 'thin-text' },
    ]);
    expect(line).toBe('dropped       Vida: Writer, too thin to score');
  });

  it('prints the fetch that reconsiders a dropped posting, quoted for the shell', () => {
    const lines = renderRecall([
      {
        url,
        stage: 'dropped',
        company: 'Vida',
        title: 'Writer',
        reason: 'out-of-window',
        observedAt: '2026-10-03T12:00:00.000Z',
        days: 31,
      },
      { url, stage: 'dropped', company: 'hippocratic ai', title: 'Editor', days: 9 },
    ]);
    expect(lines.slice(0, 2)).toEqual([
      'dropped       Vida: Writer, outside the recency window when first seen on 2026-10-03; fish fetch --company Vida --days 31 reconsiders it',
      "dropped       hippocratic ai: Editor, before fish recorded why; fish fetch --company 'hippocratic ai' --days 9 reconsiders it",
    ]);
  });

  it('quotes a URL with a query, which zsh would read as a glob', () => {
    const pasted =
      'https://jobs.lever.co/xsolla/4eb71eae-b475-45e2-899d-b6de4980721d?lever-source=Indeed';
    const [line] = renderRecall([{ url: pasted, stage: 'not-watched', names: 'lever/xsolla' }]);
    expect(line).toBe(`not watched   lever/xsolla; add it with fish watchlist add '${pasted}'`);
  });
});

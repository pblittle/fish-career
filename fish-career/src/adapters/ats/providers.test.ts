import { afterEach, describe, expect, it, vi } from 'vitest';
import { compFromText, formatComp, htmlToText, PROVIDERS } from './providers.js';

describe('formatComp', () => {
  it('keeps a string range as written', () => {
    expect(formatComp('$170K – $215K')).toBe('$170K – $215K');
  });

  it('formats a Lever {min, max, currency} object', () => {
    expect(formatComp({ min: 170000, max: 215000, currency: 'USD' })).toBe('170000 – 215000 USD');
  });

  it('is empty for missing or unusable values', () => {
    expect(formatComp(undefined)).toBe('');
    expect(formatComp({})).toBe('');
    expect(formatComp(null)).toBe('');
  });
});

describe('compFromText', () => {
  it('lifts the first stated range verbatim', () => {
    expect(
      compFromText('The annual base salary is between $246,000 USD and $369,000 USD, plus'),
    ).toBe('$246,000 USD and $369,000 USD');
    expect(compFromText('Pay range: $180,200 - $247,700 USD')).toBe('$180,200 - $247,700 USD');
    expect(compFromText('Comp: $170K – $215K + equity')).toBe('$170K – $215K');
    expect(compFromText('Salary USD 150,000 to 200,000 per year')).toBe('USD 150,000 to 200,000');
  });

  it('never lifts a lone figure', () => {
    expect(compFromText("We've surpassed $400M in ARR and we're accelerating")).toBe('');
    expect(compFromText('closing deals with $50k+ ARR')).toBe('');
  });

  it('skips a range below the annual floor and keeps looking', () => {
    expect(
      compFromText('a $1,000 to $5,000 learning stipend; base pay $120,000 - $150,000 USD'),
    ).toBe('$120,000 - $150,000 USD');
    expect(compFromText('a $10,000 to $20,000 relocation bonus')).toBe('');
  });

  it('is empty for empty text', () => {
    expect(compFromText('')).toBe('');
  });
});

describe('the Ashby mapping', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const board = (job: Record<string, unknown>) =>
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ jobs: [job] }) }));

  it('prefers the structured compensation when the board sends one', async () => {
    board({
      title: 'Engineer',
      jobUrl: 'https://jobs.ashbyhq.com/acme/abc',
      workplaceType: 'Remote',
      compensation: { compensationTierSummary: '$200K – $250K' },
      descriptionPlain: 'The range is $100,000 USD and $120,000 USD.',
    });
    const [p] = await PROVIDERS.ashby.list('acme');
    expect(p?.comp).toBe('$200K – $250K');
  });

  it('falls back to the range stated in the body when the structured field is empty', async () => {
    board({
      title: 'Engineer',
      jobUrl: 'https://jobs.ashbyhq.com/acme/abc',
      workplaceType: 'Remote',
      compensation: {},
      descriptionPlain: 'The annual base salary is between $246,000 USD and $369,000 USD.',
    });
    const [p] = await PROVIDERS.ashby.list('acme');
    expect(p?.comp).toBe('$246,000 USD and $369,000 USD');
  });
});

describe('htmlToText', () => {
  it('decodes double-escaped entities fully (the Greenhouse case)', () => {
    // "&amp;amp;" decodes to "&amp;" on one pass and "&" on the second.
    expect(htmlToText('R&amp;amp;D')).toBe('R&D');
    expect(htmlToText('cats &amp; dogs &amp; fish')).toBe('cats & dogs & fish');
  });

  it('strips tags and keeps list items as dashes', () => {
    expect(htmlToText('<p>Hello <b>world</b></p><ul><li>one</li><li>two</li></ul>')).toBe(
      'Hello world\n- one\n- two',
    );
  });

  it('turns <br> into newlines and collapses blank runs', () => {
    expect(htmlToText('a<br/>b<br><br><br>c')).toBe('a\nb\n\nc');
  });

  it('handles null and undefined', () => {
    expect(htmlToText(null)).toBe('');
    expect(htmlToText(undefined)).toBe('');
  });

  it('does not let a decoded entity re-form a tag that strips content', () => {
    // "&lt;b&gt;" decodes to "<b>" and the tag strip then removes it; document
    // the actual behavior so a change is a decision, not a surprise.
    expect(htmlToText('&lt;b&gt;bold&lt;/b&gt;')).toBe('bold');
  });
});

describe('the provider registry', () => {
  it('carries the four public boards, each identified', () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual([
      'ashby',
      'greenhouse',
      'lever',
      'smartrecruiters',
    ]);
    for (const [id, provider] of Object.entries(PROVIDERS)) {
      expect(provider.id).toBe(id);
    }
  });
});

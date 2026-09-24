import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  formatComp,
  htmlToText,
  type Posting,
  postingFile,
  writePostingFile,
} from './providers.js';

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

describe('postingFile', () => {
  it('sanitizes company and key into a safe filename', () => {
    expect(postingFile('Scale AI', 'gh:scaleai:123')).toBe('scale-ai-123.txt');
  });

  it('collapses punctuation runs and trims edges', () => {
    expect(postingFile("Bob's -- Shop!!", 'lever:x:abc/def')).toBe('bob-s-shop-abc-def.txt');
  });

  it('falls back to the whole key when it has no colon', () => {
    expect(postingFile('Acme', 'weird key')).toBe('acme-weird-key.txt');
  });
});

describe('writePostingFile', () => {
  const posting: Posting = {
    key: 'ashby:acme:xyz',
    title: 'Staff Engineer',
    location: 'Remote - US',
    workplace: 'Remote',
    remote: true,
    comp: '$200K - $250K',
    url: 'https://jobs.ashbyhq.com/acme/xyz',
    date: '2026-09-01T00:00:00Z',
    text: 'The role body.',
  };

  it('writes a header the triage parser reads, plus the body', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fish-test-'));
    const file = writePostingFile(dir, 'Acme Corp', posting);
    expect(file).toBe('acme-corp-xyz.txt');
    const content = readFileSync(join(dir, file), 'utf8');
    expect(content).toMatch(/^TITLE: Staff Engineer$/m);
    expect(content).toMatch(/^COMPANY: Acme Corp$/m);
    expect(content).toMatch(/^LOCATION: Remote - US \(Remote\)$/m);
    expect(content).toMatch(/^COMPENSATION: \$200K - \$250K$/m);
    expect(content).toMatch(/^URL: https:\/\/jobs\.ashbyhq\.com\/acme\/xyz$/m);
    expect(content).toMatch(/^PUBLISHED: 2026-09-01T00:00:00Z$/m);
    expect(content.trimEnd().endsWith('The role body.')).toBe(true);
  });

  it('says "not stated" when the board gives no comp', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fish-test-'));
    const file = writePostingFile(dir, 'Acme', { ...posting, comp: '' });
    expect(readFileSync(join(dir, file), 'utf8')).toMatch(/^COMPENSATION: not stated$/m);
  });
});

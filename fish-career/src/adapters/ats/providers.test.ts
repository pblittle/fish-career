import { describe, expect, it } from 'vitest';
import { formatComp, htmlToText, PROVIDERS } from './providers.js';

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

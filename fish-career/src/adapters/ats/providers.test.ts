import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePostingUrl, postingKey } from '../../domain/posting-url.js';
import { compFromText, formatComp, htmlToText, PROVIDERS } from './providers.js';

// Real postings recorded from the public boards on 2026-10-03, trimmed to the
// fields each adapter reads. Each file names the URL it was recorded from,
// which is also the URL the adapter must call.
interface Recorded {
  source: { url: string; fetchedAt: string; note: string };
  body: unknown;
}

const recorded = (name: string): Recorded =>
  JSON.parse(readFileSync(new URL(`../../fixtures/ats/${name}.json`, import.meta.url), 'utf8'));

// Serve a recorded body in place of the network and hand back the stub, so a
// test can check which endpoint the adapter asked for.
const serve = (body: unknown) => {
  const fetchStub = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe('Ashby list()', () => {
  it('takes remote from workplaceType, so a Hybrid posting flagged isRemote is not remote', async () => {
    const fixture = recorded('ashby-openai');
    const fetchStub = serve(fixture.body);
    const [hybrid, remote, unstated] = await PROVIDERS.ashby.list('openai');
    expect(fetchStub).toHaveBeenCalledWith(fixture.source.url, expect.anything());
    expect(hybrid).toMatchObject({
      key: 'ashby:openai:0b428c6d-7c06-4feb-82b6-5bbe5cda2a18',
      title: 'Account Director, Startups',
      workplace: 'Hybrid',
      remote: false,
    });
    expect(remote).toMatchObject({
      workplace: 'Remote',
      remote: true,
      comp: '$165.4K – $285K • Offers Equity • Multiple Ranges',
      date: '2026-06-25T17:30:54.205+00:00',
    });
    expect(unstated).toMatchObject({ workplace: '', remote: false });
  });

  it('falls back to isRemote only when workplaceType is absent', async () => {
    // Derived, not recorded: on the nine boards checked on 2026-10-03, every
    // posting without workplaceType also lacked isRemote. This is the recorded
    // Hybrid posting with its workplaceType removed.
    const { jobs } = recorded('ashby-openai').body as { jobs: Record<string, unknown>[] };
    const { workplaceType: _removed, ...legacy } = jobs[0];
    serve({ jobs: [legacy] });
    const [posting] = await PROVIDERS.ashby.list('openai');
    expect(posting).toMatchObject({ workplace: '', remote: true });
  });
});

describe('Lever list()', () => {
  it('takes remote from workplaceType when the location text omits it', async () => {
    const fixture = recorded('lever-vida');
    const fetchStub = serve(fixture.body);
    const [posting] = await PROVIDERS.lever.list('vida');
    expect(fetchStub).toHaveBeenCalledWith(fixture.source.url, expect.anything());
    expect(posting).toMatchObject({
      key: 'lever:vida:4b9d5f4d-f29f-49a2-be0f-7bd9f99f3415',
      location: 'United States',
      workplace: 'Remote',
      remote: true,
    });
  });

  it('does not call a hybrid posting remote because its location says Remote', async () => {
    serve(recorded('lever-moonpay').body);
    const postings = await PROVIDERS.lever.list('moonpay');
    expect(postings.map((p) => [p.location, p.workplace, p.remote])).toEqual([
      ['Canada - Remote', 'Hybrid', false],
      ['United States (East Coast Time Zone) - Remote', 'Hybrid', false],
    ]);
  });

  it('falls back to the location text when workplaceType is absent', async () => {
    // Derived, not recorded: the first MoonPay posting with its workplaceType
    // removed, leaving only "Canada - Remote" to go on.
    const [first] = recorded('lever-moonpay').body as Record<string, unknown>[];
    const { workplaceType: _removed, ...legacy } = first;
    serve([legacy]);
    const [posting] = await PROVIDERS.lever.list('moonpay');
    expect(posting).toMatchObject({ workplace: 'Remote', remote: true });
  });
});

describe('Greenhouse list()', () => {
  it('dates a posting by its first publication, not its last edit', async () => {
    const fixture = recorded('greenhouse-honor');
    const fetchStub = serve(fixture.body);
    const [posting] = await PROVIDERS.greenhouse.list('honor');
    expect(fetchStub).toHaveBeenCalledWith(fixture.source.url, expect.anything());
    expect(posting).toMatchObject({
      key: 'gh:honor:8297124002',
      location: 'Remote Position',
      remote: true,
      date: '2025-12-03T16:04:42-05:00',
    });
  });

  it('falls back to updated_at when first_published is absent', async () => {
    // Derived, not recorded: every posting on the nineteen boards checked on
    // 2026-10-03 carried first_published. This is the recorded one without it.
    const { jobs } = recorded('greenhouse-honor').body as { jobs: Record<string, unknown>[] };
    const { first_published: _removed, ...legacy } = jobs[0];
    serve({ jobs: [legacy] });
    const [posting] = await PROVIDERS.greenhouse.list('honor');
    expect(posting.date).toBe('2026-09-25T15:14:21-04:00');
  });

  it('counts a Distributed posting as remote', async () => {
    // Cloudflare's careers page defines Distributed as "Work from anywhere in
    // your country of employment. No Hub location required." The location
    // names the policy the way "Remote" does on other boards, and a posting
    // that lists Distributed and Hybrid offers either.
    const fixture = recorded('greenhouse-cloudflare');
    const fetchStub = serve(fixture.body);
    const postings = await PROVIDERS.greenhouse.list('cloudflare');
    expect(fetchStub).toHaveBeenCalledWith(fixture.source.url, expect.anything());
    expect(postings.map((p) => [p.location, p.workplace, p.remote])).toEqual([
      ['Distributed', 'Remote', true],
      ['Distributed; Hybrid', 'Remote', true],
      ['Remote', 'Remote', true],
      ['Hybrid', '', false],
      ['In-Office', '', false],
    ]);
    expect(postings[0].key).toBe('gh:cloudflare:7053411');
  });
});

describe('SmartRecruiters list()', () => {
  it('returns every posting with the workplace its location flags state', async () => {
    // Like the other three adapters, it leaves the remote filter to fetch, so
    // a hybrid or on-site posting counts as a not-remote drop and recall can
    // say why it was never fetched.
    const fixture = recorded('smartrecruiters-servicenow');
    const fetchStub = serve(fixture.body);
    const postings = await PROVIDERS.smartrecruiters.list('ServiceNow');
    expect(fetchStub).toHaveBeenCalledWith(fixture.source.url, expect.anything());
    expect(postings.map((p) => [p.title, p.workplace, p.remote])).toEqual([
      ['Sr Mobile Software Engineer (Native Android and Backend)', 'Remote', true],
      ['Director, CRM Sales Manufacturing', 'Hybrid', false],
      ['Sr Software Engineer', 'On-site', false],
    ]);
    expect(postings[0]).toMatchObject({
      key: 'sr:ServiceNow:744000153266480',
      location: 'San Diego, CALIFORNIA, United States',
    });
  });

  it('links a posting to the page a person opens, and reads its text from the API', async () => {
    // The list's ref is the API's JSON for the posting, so it serves only as
    // the detail URL.
    serve(recorded('smartrecruiters-servicenow').body);
    const [posting] = await PROVIDERS.smartrecruiters.list('ServiceNow');
    expect(posting).toMatchObject({
      url: 'https://jobs.smartrecruiters.com/ServiceNow/744000153266480',
      detailUrl: 'https://api.smartrecruiters.com/v1/companies/ServiceNow/postings/744000153266480',
    });
  });
});

describe('posting URLs and adapter keys', () => {
  // The URL parser lives in the domain and the key formats live here, so this
  // is what keeps them from drifting: every URL an adapter writes must parse
  // back to the key that adapter wrote.
  it.each([
    ['ashby', 'openai', 'ashby-openai'],
    ['greenhouse', 'honor', 'greenhouse-honor'],
    ['greenhouse', 'cloudflare', 'greenhouse-cloudflare'],
    ['lever', 'vida', 'lever-vida'],
    ['lever', 'moonpay', 'lever-moonpay'],
    ['smartrecruiters', 'ServiceNow', 'smartrecruiters-servicenow'],
  ])('%s/%s: each posting URL parses back to its key', async (provider, slug, name) => {
    serve(recorded(name).body);
    const postings = await PROVIDERS[provider].list(slug);
    expect(postings.length).toBeGreaterThan(0);
    for (const posting of postings) {
      const target = parsePostingUrl(posting.url);
      expect(target.kind, posting.url).toBe('posting');
      if (target.kind === 'posting') expect(postingKey(target)).toBe(posting.key);
    }
  });
});

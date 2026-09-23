#!/usr/bin/env node
// Probe candidate watchlist companies across the four public ATS APIs and
// report which board serves them and how many postings are live right now.
//
//   node probe-boards.mjs
//
// To evaluate a new company, add one line to CANDIDATES and rerun. A company
// that reports UNVERIFIED usually uses Workday or a homegrown board; find its
// careers page by hand and add the provider slug once known.

const CANDIDATES = [
  // AI-native core
  { name: 'Anthropic', aliases: ['anthropic'] },
  { name: 'OpenAI', aliases: ['openai', 'open-ai'] },
  { name: 'Perplexity', aliases: ['perplexity', 'perplexity-ai'] },
  { name: 'Mistral', aliases: ['mistral', 'mistralai'] },
  { name: 'Together AI', aliases: ['together', 'togetherai', 'together-ai'] },
  { name: 'ElevenLabs', aliases: ['elevenlabs', 'eleven-labs'] },
  { name: 'Runway', aliases: ['runway', 'runwayml'] },
  { name: 'Harvey', aliases: ['harvey', 'harveyai'] },
  { name: 'Glean', aliases: ['glean', 'gleanwork'] },
  { name: 'Sierra', aliases: ['sierra', 'sierra-ai'] },
  { name: 'Cognition', aliases: ['cognition', 'cognition-ai', 'cognition-labs'] },
  { name: 'Cursor', aliases: ['anysphere', 'cursor'] },
  { name: 'Replit', aliases: ['replit'] },
  { name: 'Mercor', aliases: ['mercour', 'mercor'] },
  { name: 'Abridge', aliases: ['abridge', 'abridgehq'] },
  { name: 'Modular', aliases: ['modular', 'modular-ml'] },
  { name: 'Fireworks AI', aliases: ['fireworks', 'fireworksai', 'fireworks-ai'] },
  { name: 'Cohere', aliases: ['cohere', 'cohere-ai'] },
  { name: 'LangChain', aliases: ['langchain', 'lang-chain'] },
  { name: 'Windsurf', aliases: ['windsurf', 'codeium'] },
  // AI-forward growth, strong TypeScript fit
  { name: 'Vercel', aliases: ['vercel'] },
  { name: 'Notion', aliases: ['notion', 'notionhq'] },
  { name: 'Discord', aliases: ['discord'] },
  { name: 'Retool', aliases: ['retool'] },
  { name: 'Vanta', aliases: ['vanta'] },
  { name: 'Zapier', aliases: ['zapier'] },
  { name: 'Sourcegraph', aliases: ['sourcegraph', 'sourcegraph91'] },
  { name: 'Intercom', aliases: ['intercom'] },
  { name: 'Airtable', aliases: ['airtable'] },
  // Second batch: AI-native and AI-forward adjacents
  { name: 'Hugging Face', aliases: ['huggingface'] },
  { name: 'Descript', aliases: ['descript'] },
  { name: 'Ramp', aliases: ['ramp'] },
  { name: 'Gamma', aliases: ['gamma-app', 'gamma'] },
  { name: 'Scale AI', aliases: ['scaleai', 'scale'] },
  { name: 'Databricks', aliases: ['databricks'] },
  { name: 'Deepgram', aliases: ['deepgram'] },
  { name: 'AssemblyAI', aliases: ['assemblyai', 'assembly-ai'] },
  { name: 'Jasper', aliases: ['jasper', 'jasperai'] },
];

const PROVIDERS = [
  {
    id: 'ashby',
    url: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}`,
    count: (r) => (Array.isArray(r.jobs) ? r.jobs.length : null),
  },
  {
    id: 'greenhouse',
    url: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`,
    count: (r) => (Array.isArray(r.jobs) ? r.jobs.length : null),
  },
  {
    id: 'lever',
    url: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`,
    count: (r) => (Array.isArray(r) ? r.length : null),
  },
  {
    id: 'smartrecruiters',
    url: (s) => `https://api.smartrecruiters.com/v1/companies/${s}/postings?limit=1`,
    count: (r) => (typeof r.totalFound === 'number' ? r.totalFound : null),
  },
];

const probe = async (provider, slug) => {
  try {
    const res = await fetch(provider.url(slug), {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    const count = provider.count(body);
    if (count === null) return null;
    return { provider: provider.id, slug, count };
  } catch {
    return null;
  }
};

const main = async () => {
  for (const c of CANDIDATES) {
    let best = null;
    const empty = [];
    for (const slug of c.aliases) {
      const hits = await Promise.all(PROVIDERS.map((p) => probe(p, slug)));
      const found = hits.find((h) => h !== null && h.count > 0);
      if (found) {
        best = found;
        break;
      }
      empty.push(...hits.filter((h) => h !== null && h.count === 0));
    }
    if (best) {
      console.log(
        `${c.name.padEnd(14)} ${best.provider.padEnd(14)} ${String(best.count).padStart(3)} postings  (${best.slug})`,
      );
    } else if (empty.length > 0) {
      console.log(
        `${c.name.padEnd(14)} board exists, 0 postings: ${empty.map((e) => e.provider).join(', ')}`,
      );
    } else {
      console.log(`${c.name.padEnd(14)} UNVERIFIED (no public board found for any alias)`);
    }
  }
};

main();

// A deterministic stand-in for the judge. It exists so the pipeline can run
// end to end with no API key and no network: the demo, the example host
// configs, and any test that wants a scored table without recorded answers.
//
// It is NOT Jev and does not pretend to be. It reads the same state string a
// real judge receives and answers the same typed questions with simple,
// inspectable rules: keyword overlap for skills and domain, a stated floor
// for compensation, title words for level, and explicit on-site or
// relocation language for the hard blocker. A real judge answers these
// questions with judgment; this one answers them with string matching, so a
// ranking it produces is a demonstration of the pipeline, never a claim
// about a posting.

import type { JevAnswers } from '../../domain/answers.js';
import type { Judge, JudgeAnswer } from '../../ports/judge.js';

const between = (state: string): { profile: string; posting: string } => {
  const marker = '\n\nJOB POSTING:\n';
  const at = state.indexOf(marker);
  return at === -1
    ? { profile: state, posting: state }
    : { profile: state.slice(0, at), posting: state.slice(at + marker.length) };
};

const line = (text: string, field: string): string =>
  text.match(new RegExp(`^${field}: (.+)$`, 'm'))?.[1]?.trim() ?? '';

const bodyOf = (posting: string): string => posting.split('\n\n').slice(1).join('\n\n');

const COMP_RE = /\$\s?([\d,]+(?:\.\d+)?)\s*([KkMm])?/g;

// Every salary-looking dollar figure in the text, normalized to whole
// dollars. "$210K" and "$210,000" both read as 210000. Millions are skipped
// ("$125M raised at Series B" is funding, not pay) and so is anything under
// $10,000, which is not a salary in this domain.
const money = (text: string): number[] => {
  const out: number[] = [];
  for (const m of text.matchAll(COMP_RE)) {
    const raw = m[1];
    const suffix = m[2]?.toUpperCase();
    if (raw === undefined || suffix === 'M') continue;
    let n = Number(raw.replace(/,/g, ''));
    if (suffix === 'K') n *= 1000;
    if (Number.isFinite(n) && n >= 10_000) out.push(n);
  }
  return out;
};

const listAfter = (profile: string, label: string): string[] => {
  const match = profile.match(new RegExp(`${label}:\\s*(.+)`, 'i'));
  return (match?.[1] ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
};

const overlap = (haystack: string, needles: string[]): number => {
  if (needles.length === 0) return 0;
  const text = haystack.toLowerCase();
  const hits = needles.filter((n) => text.includes(n)).length;
  return hits / needles.length;
};

const skillsScore = (profile: string, posting: string): number => {
  const frac = overlap(posting, listAfter(profile, 'Core skills'));
  if (frac >= 0.8) return 3;
  if (frac >= 0.5) return 2;
  if (frac > 0.15) return 1;
  return 0;
};

const domainScore = (profile: string, posting: string): number => {
  const wanted = listAfter(profile, 'Domains I want');
  if (wanted.length > 0 && overlap(posting, wanted) > 0) return 3;
  const text = posting.toLowerCase();
  if (/(ai|infrastructure|platform|developer tool|cloud)/.test(text)) return 2;
  if (/(crypto|gambling|adtech|surveillance)/.test(text)) return 0;
  return 1;
};

const levelScore = (title: string): number => {
  const t = title.toLowerCase();
  if (/(junior|intern|entry|associate)/.test(t)) return 3;
  if (/(principal|distinguished|fellow)/.test(t)) return 1;
  if (/(manager|director|head of|vp|chief)/.test(t)) return 0;
  return 2;
};

const locationScore = (location: string, body: string): { score: number; confidence: number } => {
  const text = `${location}\n${body}`.toLowerCase();
  const loc = location.toLowerCase();
  if (/(on-?site|no remote option|relocation required|must relocate)/.test(text)) {
    return { score: 0, confidence: 0.85 };
  }
  if (/(hybrid|\d+\s*days? (a|per) week in)/.test(text)) return { score: 0, confidence: 0.85 };
  const remote =
    /remote/.test(loc) || /(remote-first|fully remote|remote across|remote us)/.test(text);
  if (!remote) {
    if (loc.trim().length === 0) return { score: 2, confidence: 0.4 };
    return { score: 1, confidence: 0.6 };
  }
  // Remote, but outside the candidate's stated geography: a real mismatch
  // the location dimension exists to catch.
  if (/(singapore|apac|emea|europe|london|india|tokyo|sydney|australia|canada)/.test(loc)) {
    return { score: 1, confidence: 0.7 };
  }
  return { score: 3, confidence: 0.85 };
};

const compScore = (profile: string, posting: string): number => {
  const floor = money(profile.match(/Compensation floor:.*/i)?.[0] ?? '')[0];
  if (floor === undefined) return 1;
  const stated = money(posting);
  if (stated.length === 0) return 1;
  const low = Math.min(...stated);
  const high = Math.max(...stated);
  if (low >= floor) return 3;
  if (high >= floor) return 2;
  return 0;
};

const blockerScore = (posting: string): number =>
  /(on-?site|no remote option|relocation required|must relocate|must be based in)/i.test(posting)
    ? 0.9
    : 0.05;

export const fakeAnswers = (state: string): JevAnswers => {
  const { profile, posting } = between(state);
  const title = line(posting, 'TITLE');
  const location = line(posting, 'LOCATION');
  const loc = locationScore(location, bodyOf(posting));
  return {
    hard_blocker: { noul: blockerScore(posting) },
    skills: { score: skillsScore(profile, posting), confidence: 0.8 },
    level: { score: levelScore(title), confidence: 0.8 },
    location: { score: loc.score, confidence: loc.confidence },
    comp: { score: compScore(profile, posting), confidence: 0.8 },
    domain: { score: domainScore(profile, posting), confidence: 0.7 },
  };
};

export const FAKE_JUDGE_MODEL = 'fake-judge';

export const fakeJudgeCall = async (state: string): Promise<JudgeAnswer> => ({
  answers: fakeAnswers(state),
  latencyMs: 0,
  inputTokens: 0,
  outputTokens: 0,
  model: FAKE_JUDGE_MODEL,
  attempts: 1,
});

export const fakeJudge: Judge = { ask: fakeJudgeCall };

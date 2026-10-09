// fish recall's text: one line per URL in the order given, labeled by the
// furthest stage the posting reached, then the stages counted from the
// furthest down. A count of cases, never a rate.

import { RECALL_STAGES, type RecallCase, type RecallStage } from '../../application/recall.js';

const LABEL: Readonly<Record<RecallStage, string>> = {
  'other-system': 'other system',
  'job-site': 'job site',
  unknown: 'unknown',
  'board-url': 'board URL',
  'not-watched': 'not watched',
  unreadable: 'unreadable',
  'not-listed': 'not listed',
  'not-remote': 'not remote',
  'off-target': 'off target',
  'not-fetched': 'not fetched',
  dropped: 'dropped',
  written: 'written',
};

const WIDTH = Math.max(...Object.values(LABEL).map((l) => l.length)) + 2;

// A value in a printed command, quoted when the shell would otherwise split
// or expand it: zsh reads the ? in a URL's query as a glob and stops with
// "no matches found".
const word = (s: string): string =>
  /^[\w./:@%+,=-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;

const why = (c: RecallCase): string => {
  if (c.reason === 'thin-text') return 'too thin to score';
  if (c.reason === 'out-of-window') {
    const when = c.observedAt ? ` when first seen on ${c.observedAt.slice(0, 10)}` : '';
    return `outside the recency window${when}`;
  }
  return 'before fish recorded why';
};

const detail = (c: RecallCase): string => {
  const posting = `${c.company}: ${c.title}`;
  switch (c.stage) {
    case 'written': {
      const score = typeof c.score === 'number' ? `score ${c.score.toFixed(2)}` : 'not scored yet';
      return `${posting}, ${score} [${c.postingId}]`;
    }
    case 'dropped': {
      const again = c.days
        ? `; fish fetch --company ${word(c.company ?? '')} --days ${c.days} reconsiders it`
        : '';
      return `${posting}, ${why(c)}${again}`;
    }
    case 'not-fetched':
      return `${posting} is listed and remote; run fish fetch`;
    case 'off-target':
      return `${posting} matches "${c.phrase}" in skip-titles.txt`;
    case 'not-remote':
      return c.workplace
        ? `${posting} is listed as ${c.workplace}`
        : `${posting} is listed at ${c.location || 'an unstated location'}, not remote`;
    case 'not-listed':
      return c.checked
        ? `no watched ${c.names} board lists it now (${c.checked.join(', ')}): ${c.url}`
        : `${c.company}'s board does not list it now: ${c.url}`;
    case 'unreadable':
      return `${c.company}'s board could not be read (${c.error}): ${c.url}`;
    case 'not-watched':
      return c.names?.includes('/')
        ? `${c.names}; add it with fish watchlist add ${word(c.url)}`
        : `no ${c.names} board is on the watchlist: ${c.url}`;
    case 'board-url':
      return `names ${c.names}, ${c.company ? `watched as ${c.company}` : 'not watched'}, not a posting: ${c.url}`;
    case 'job-site':
      return `on ${c.names}, a job search site; find the employer's own posting URL: ${c.url}`;
    case 'other-system':
      return `on ${c.names}, which fish does not read: ${c.url}`;
    case 'unknown':
      return `not a job board fish knows: ${c.url}`;
  }
};

export const renderRecall = (cases: RecallCase[]): string[] => {
  const lines = cases.map((c) => `${LABEL[c.stage].padEnd(WIDTH)}${detail(c)}`);
  const counts = [...RECALL_STAGES]
    .reverse()
    .map((stage) => [stage, cases.filter((c) => c.stage === stage).length] as const)
    .filter(([, n]) => n > 0)
    .map(([stage, n]) => `${n} ${LABEL[stage]}`);
  if (cases.length > 1) {
    lines.push('', `${cases.length} URLs: ${counts.join(', ')}.`);
  }
  return lines;
};

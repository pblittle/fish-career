import { describe, expect, it } from 'vitest';
import { stateFor } from '../../domain/rubric.js';
import { fakeAnswers } from './fake.js';

const PROFILE = [
  'Senior backend engineer.',
  'Remote US only; not open to relocation.',
  'Compensation floor: $180,000.',
  'Core skills: TypeScript, Node.js, Postgres, AWS, distributed systems.',
  'Domains I want: developer tools, AI infrastructure.',
].join('\n');

const posting = (header: string, body: string): string => `${header}\n\n${body}`;

const ask = (header: string, body: string) => fakeAnswers(stateFor(PROFILE, posting(header, body)));

describe('fakeAnswers', () => {
  it('is deterministic: the same state always answers the same way', () => {
    const state = stateFor(PROFILE, posting('TITLE: Role', 'TypeScript and Node.js.'));
    expect(fakeAnswers(state)).toEqual(fakeAnswers(state));
  });

  it('flags explicit on-site language as a hard blocker', () => {
    const answers = ask(
      'TITLE: Senior Backend Engineer',
      'This role is on-site in Austin; there is no remote option.',
    );
    expect(answers.hard_blocker.noul).toBeGreaterThanOrEqual(0.9);
    expect(answers.location?.score).toBe(0);
  });

  it('scores remote as the stated constraint', () => {
    const answers = ask('TITLE: Senior Backend Engineer', 'Remote-first across the US.');
    expect(answers.location?.score).toBe(3);
  });

  it('penalizes a remote role outside the stated geography', () => {
    const answers = ask(
      'TITLE: Deployed Engineer\nLOCATION: Remote - Singapore (Remote)',
      'Remote role based in Singapore.',
    );
    expect(answers.location?.score).toBe(1);
    expect(answers.hard_blocker.noul).toBeLessThan(0.5);
  });

  it('reads a stated range against the floor', () => {
    expect(
      ask('TITLE: Senior Backend Engineer', 'The range is $210,000 – $240,000.').comp?.score,
    ).toBe(3);
    expect(
      ask('TITLE: Senior Backend Engineer', 'The range is $110,000 – $130,000.').comp?.score,
    ).toBe(0);
    expect(ask('TITLE: Senior Backend Engineer', 'No compensation is listed.').comp?.score).toBe(1);
  });

  it('does not read a funding round as compensation', () => {
    const answers = ask(
      'TITLE: Senior Backend Engineer',
      'With $125M raised at Series B, we are growing. Compensation is not listed.',
    );
    expect(answers.comp?.score).toBe(1);
  });

  it('scores a junior title below the candidate as overqualified, per the rubric', () => {
    const answers = ask('TITLE: Junior Backend Engineer', 'TypeScript, Node.js, Postgres, AWS.');
    expect(answers.level?.score).toBe(3);
  });

  it('counts skill overlap against the profile list', () => {
    const strong = ask(
      'TITLE: Senior Backend Engineer',
      'TypeScript, Node.js, Postgres, AWS, and distributed systems.',
    );
    const weak = ask('TITLE: Senior Backend Engineer', 'You will write copy and run spreadsheets.');
    expect(strong.skills?.score).toBe(3);
    expect(weak.skills?.score).toBe(0);
  });
});

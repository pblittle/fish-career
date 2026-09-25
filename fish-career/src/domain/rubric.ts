// The rubric: the operator's judgment, stated as data. One judge request per
// posting asks five Score dimensions plus one Noul hard-blocker check, and
// the weights are combined here in code. Change a dimension and the version
// below must move with it, because every stored score names the rubric that
// produced it.

import { createHash } from 'node:crypto';

export const DIMENSIONS = [
  {
    id: 'skills',
    weight: 0.35,
    instructions:
      "How directly do the posting's required skills match the candidate's stated skills?",
    criteria: [
      "Almost none of the posting's required skills appear among the candidate's stated skills",
      'Some required skills match, but a core requirement of the role is missing',
      'Most required skills match, with a few gaps the candidate could close on the job',
      "The posting's requirements are skills the candidate has used in depth",
    ],
  },
  {
    id: 'level',
    weight: 0.15,
    instructions: "How does the posting's seniority compare to the candidate's stated level?",
    criteria: [
      "The posting is far above the candidate's stated level; the stated experience bar is not met",
      "The posting is somewhat above the candidate's stated level",
      "The posting matches the candidate's stated level",
      "The posting is below the candidate's stated level; the candidate would be overqualified",
    ],
  },
  {
    id: 'location',
    weight: 0.2,
    instructions:
      "Does the role's location or remote policy fit the candidate's stated constraint?",
    criteria: [
      "The role is on-site or hybrid in a location the candidate's constraints rule out",
      'The role would require a relocation the candidate has not said they want',
      'The location or remote policy is not stated clearly enough to judge',
      "The remote policy or location matches the candidate's stated constraint",
    ],
  },
  {
    id: 'comp',
    weight: 0.1,
    instructions:
      "What does the posting suggest about compensation relative to the candidate's stated floor?",
    criteria: [
      "The posting states or strongly suggests compensation below the candidate's stated floor",
      'The posting gives no compensation signal',
      "Compensation hints are consistent with the candidate's floor, without stating a number",
      "The posting states compensation at or above the candidate's stated floor",
    ],
  },
  {
    id: 'domain',
    weight: 0.2,
    instructions:
      "How does the posting's domain align with what the candidate says they want to work on?",
    criteria: [
      'The work is in a domain the candidate has ruled out or shown no interest in',
      "The domain is neither named in the candidate's interests nor ruled out",
      'The work touches a domain the candidate has some interest in',
      'The work is squarely in a domain the candidate says they want',
    ],
  },
] as const;

export const LOW_CONFIDENCE = 0.5;
export const BLOCKER_FLAG = 0.5;

export const BLOCKER_INSTRUCTIONS =
  "The posting states a hard requirement the candidate explicitly cannot meet, such as work authorization, a required certification, a required location or relocation, or an experience bar far beyond the candidate's. Requirements the candidate could plausibly satisfy do not count.";

// Bump when the dimensions, criteria or blocker instructions change meaning,
// so a ledger entry can say which rubric produced it and a later run can tell
// the score is no longer the current judgment.
export const RUBRIC_VERSION = 1;

// Everything a stored score is a judgment against: the profile text and the
// rubric itself. Change either and old numbers stop being current.
export const profileHash = (profile: string): string =>
  createHash('sha256')
    .update(profile)
    .update('\n')
    .update(JSON.stringify(DIMENSIONS))
    .update(BLOCKER_INSTRUCTIONS)
    .digest('hex')
    .slice(0, 12);

// One judge call's questions, as the API expects them.
export const questions = Object.fromEntries([
  ['hard_blocker', { type: 'noul', instructions: BLOCKER_INSTRUCTIONS }],
  ...DIMENSIONS.map((d) => [
    d.id,
    { type: 'score', instructions: d.instructions, criteria: d.criteria },
  ]),
]);

export const stateFor = (profile: string, posting: string): string =>
  `CANDIDATE PROFILE:\n${profile}\n\nJOB POSTING:\n${posting}`;

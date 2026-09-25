// Reusable MCP prompts. They carry the operator's mutable intent as
// arguments and the workflow as text; the repository prescribes no seniority,
// geography, or compensation floor, because those belong to the profile the
// operator writes.

import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

const prompt = (text: string) => ({
  messages: [
    {
      role: 'user' as const,
      content: { type: 'text' as const, text },
    },
  ],
});

export const registerPrompts = (server: McpServer): void => {
  server.registerPrompt(
    'career-search-onboarding',
    {
      title: 'Set up a career search',
      description:
        'Walk a new operator through profile, watchlist, first fetch, first triage, and first calibration.',
    },
    () =>
      prompt(
        [
          'Set up this fish.career workspace with me, in order, asking before anything destructive:',
          '',
          '1. Read the profile at fish://profile/current. If it is empty or thin, interview me briefly and write one with profile_update. It needs target roles, level, location and remote constraint, compensation floor, core skills, domains I want, and hard constraints. No contact details.',
          '2. Read the rubric at fish://rubric/current and tell me in one paragraph what the five dimensions and the blocker check will judge.',
          '3. Ask which companies I want watched. For each, call watchlist_probe, show me the sample titles so we verify the board identity, then call watchlist_add.',
          '4. Call fetch_postings and summarize the arrivals.',
          '5. Call triage_postings and read me the top five with the reasons, flagging low-confidence cells and any blocker.',
          '6. Call calibration_start and hand me the slice to rank blind, best first, before showing me any scores. Then call calibration_submit with my order and explain the agreement.',
        ].join('\n'),
      ),
  );

  server.registerPrompt(
    'review-new-arrivals',
    {
      title: 'Review new arrivals',
      description: 'Fetch, triage, and report the top arrivals with reasons.',
      argsSchema: z.object({
        count: z.coerce
          .number()
          .int()
          .min(1)
          .max(20)
          .default(5)
          .describe('How many top rows to report'),
      }),
    },
    ({ count }) =>
      prompt(
        [
          `Fetch new postings and triage them. Report the top ${count} rows with: company and title, the composite, the two dimensions that drove it, and any blocker or low-confidence flag.`,
          '',
          'For each row, read the posting itself at fish://postings/{postingId} before you characterize it, and say plainly when the rubric cannot see something that matters (team, stage, red flags in the language). Do not sell me on a posting; if it is weak, say why.',
        ].join('\n'),
      ),
  );

  server.registerPrompt(
    'explain-ranking',
    {
      title: 'Explain a ranking',
      description: 'Explain why a posting ranked where it did, from its dimension cells.',
      argsSchema: z.object({
        postingId: z.string().optional().describe('The posting to explain; omit for the top rows'),
      }),
    },
    ({ postingId }) =>
      prompt(
        postingId
          ? `Explain why ${postingId} ranked where it did. Read it at fish://postings/${postingId}, then walk through each dimension: the value, the confidence, the criteria rung it landed on, and the blocker probability. Say which profile lines the judge read, and where the profile is too vague for a confident answer.`
          : 'Explain the top rows of the last triage. For each, walk through the dimension cells that drove its place, name the profile lines the judge read, and flag the low-confidence cells. End with the single profile or weight change that would most change this ranking.',
      ),
  );

  server.registerPrompt(
    'calibrate-rubric',
    {
      title: 'Calibrate the rubric against my judgment',
      description: 'Run a blind calibration round and interpret the disagreement.',
    },
    () =>
      prompt(
        [
          'Run a calibration round with me:',
          '',
          '1. Call calibration_start and give me the slice to rank by my own judgment, best first. Do not show me any scores yet.',
          '2. When I give you my order, call calibration_submit with it.',
          '3. Read the result: the Spearman agreement, then the biggest disagreements and the dimension cells that drove the judge side of each one.',
          '4. For each disagreement, tell me whether the fix is a weight change, a sharper profile line, or my own reconsideration, and quote the profile line involved.',
          '5. Only change the rubric if I say so; then call calibration_rescore and compare.',
        ].join('\n'),
      ),
  );

  server.registerPrompt(
    'audit-profile',
    {
      title: 'Audit my profile',
      description: 'Find vague lines, contradictions, and gaps that produce low-confidence scores.',
      argsSchema: z.object({}),
    },
    () =>
      prompt(
        [
          'Audit my profile against how the judge actually read it.',
          '',
          'Read fish://profile/current, the rubric at fish://rubric/current, the latest calibration at fish://calibrations/latest, and recent runs at fish://runs/latest. Then report:',
          '',
          '- Lines a dimension keeps answering at low confidence, and the sharper wording that would fix each.',
          '- Any contradiction between my stated constraints and what I have ranked highly.',
          '- Gaps: a dimension with no profile evidence at all.',
          '- A concrete rewrite for the three weakest lines.',
          '',
          'Show me the diff before writing anything; call profile_update only if I confirm.',
        ].join('\n'),
      ),
  );
};

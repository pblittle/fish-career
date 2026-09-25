import { BLOCKER_INSTRUCTIONS, DIMENSIONS, RUBRIC_VERSION } from '../domain/rubric.js';

export interface RubricSummary {
  version: number;
  dimensions: {
    id: string;
    weight: number;
    instructions: string;
    criteria: readonly string[];
  }[];
  blockerInstructions: string;
}

// The rubric as data, for a resource or an explanation. Read-only by design:
// changing the rubric is a code change with a version bump, not a runtime
// mutation.
export const rubricSummary = (): RubricSummary => ({
  version: RUBRIC_VERSION,
  dimensions: DIMENSIONS.map((d) => ({
    id: d.id,
    weight: d.weight,
    instructions: d.instructions,
    criteria: d.criteria,
  })),
  blockerInstructions: BLOCKER_INSTRUCTIONS,
});

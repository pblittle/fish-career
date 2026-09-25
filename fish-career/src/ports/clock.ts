// Time as a dependency, so use cases that stamp records are testable.
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

// Passive state as resources: a host can read the profile, watchlist,
// postings, rubric, the latest calibration, and recent runs without calling
// an action-shaped tool.

import {
  type McpServer,
  ResourceNotFoundError,
  ResourceTemplate,
} from '@modelcontextprotocol/server';
import type { CareerApplication } from '../../application/career-application.js';

const json = (uri: string, value: unknown) => ({
  contents: [
    {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(value, null, 2),
    },
  ],
});

export const registerResources = (server: McpServer, app: CareerApplication): void => {
  server.registerResource(
    'profile',
    'fish://profile/current',
    {
      title: 'Candidate profile',
      description: 'The judgment target every score is made against.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: (await app.getProfile()) || '(no profile yet)',
        },
      ],
    }),
  );

  server.registerResource(
    'watchlist',
    'fish://watchlist',
    {
      title: 'Watchlist',
      description: 'Every watched company with its provider and board slug.',
      mimeType: 'application/json',
    },
    async (uri) => json(uri.href, await app.listWatchlist()),
  );

  server.registerResource(
    'postings',
    'fish://postings',
    {
      title: 'Posting cache',
      description: 'Every cached posting, newest arrivals included, with stable IDs.',
      mimeType: 'application/json',
    },
    async (uri) => json(uri.href, await app.listPostings()),
  );

  server.registerResource(
    'posting',
    new ResourceTemplate('fish://postings/{postingId}', { list: undefined }),
    {
      title: 'One posting',
      description: 'The full cached text of one posting, by stable posting ID.',
      mimeType: 'text/plain',
    },
    async (uri, variables) => {
      const postingId = String(variables.postingId ?? '');
      try {
        const record = await app.readPosting({ postingId });
        return {
          contents: [{ uri: uri.href, mimeType: 'text/plain', text: record.text }],
        };
      } catch (err) {
        // A missing posting is a protocol-level not-found, so a client can
        // branch on the error instead of sniffing a success body.
        throw new ResourceNotFoundError(uri.href, String((err as Error).message ?? err));
      }
    },
  );

  server.registerResource(
    'rubric',
    'fish://rubric/current',
    {
      title: 'Rubric',
      description: 'The dimensions, weights, criteria, and blocker instructions, with the version.',
      mimeType: 'application/json',
    },
    async (uri) => json(uri.href, app.rubric()),
  );

  server.registerResource(
    'calibration-latest',
    'fish://calibrations/latest',
    {
      title: 'Latest calibration',
      description: 'The most recent human ranking and its agreement with the judge.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const latest = await app.latestCalibration();
      return json(uri.href, latest ?? { note: 'No calibration on record yet.' });
    },
  );

  server.registerResource(
    'runs-latest',
    'fish://runs/latest',
    {
      title: 'Recent runs',
      description:
        'The most recent judge calls with latency, token usage, model, profile hash, and rubric version.',
      mimeType: 'application/json',
    },
    async (uri) => json(uri.href, { runId: 'latest', records: await app.recentTraces(100) }),
  );
};

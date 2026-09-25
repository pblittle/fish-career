import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../interfaces/mcp/server.js';
import { type CreateApplicationOptions, createApplicationFromHome } from './create-application.js';

export const packageVersion = (): string => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    version: string;
  };
  return version;
};

export const createServerFromHome = (opts: CreateApplicationOptions = {}) => {
  const app = createApplicationFromHome(opts);
  return createServer(app, { version: packageVersion() });
};

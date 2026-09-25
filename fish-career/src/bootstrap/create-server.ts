import { createServer } from '../interfaces/mcp/server.js';
import { type CreateApplicationOptions, createApplicationFromHome } from './create-application.js';
import { packageVersion } from './version.js';

export { packageVersion } from './version.js';

export const createServerFromHome = (opts: CreateApplicationOptions = {}) => {
  const app = createApplicationFromHome(opts);
  return createServer(app, { version: packageVersion() });
};

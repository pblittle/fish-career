// The MCP surface: composition only. Tools, resources, and prompts each live
// in their own module and call the application; this file wires them to one
// server.

import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import type { CareerApplication } from '../../application/career-application.js';
import { registerPrompts } from './prompts.js';
import { registerResources } from './resources.js';
import { registerTools } from './tools.js';

export interface ServerOptions {
  version: string;
  name?: string;
}

export const createServer = (app: CareerApplication, opts: ServerOptions): McpServer => {
  const server = new McpServer({ name: opts.name ?? 'fish.career', version: opts.version });
  registerTools(server, app);
  registerResources(server, app);
  registerPrompts(server);
  return server;
};

export const startStdioServer = async (server: McpServer): Promise<void> => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
};

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Reads the package version from package.json relative to the built module.
// Shared by bootstrap and the server factory so one file owns the walk.
export const packageVersion = (): string => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    version: string;
  };
  return version;
};

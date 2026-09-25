import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Posting } from '../../domain/posting.js';
import { filePostingRepository, postingFile } from './posting-repository.js';

const posting: Posting = {
  key: 'ashby:acme:xyz',
  title: 'Staff Engineer',
  location: 'Remote - US',
  workplace: 'Remote',
  remote: true,
  comp: '$200K - $250K',
  url: 'https://jobs.ashbyhq.com/acme/xyz',
  date: '2026-09-01T00:00:00Z',
  text: 'The role body.',
};

const dir = () => mkdtempSync(join(tmpdir(), 'fish-postings-'));

describe('postingFile', () => {
  it('sanitizes company and key into a safe filename', () => {
    expect(postingFile('Scale AI', 'gh:scaleai:123')).toBe('scale-ai-123.txt');
  });

  it('collapses punctuation runs and trims edges', () => {
    expect(postingFile("Bob's -- Shop!!", 'lever:x:abc/def')).toBe('bob-s-shop-abc-def.txt');
  });

  it('falls back to the whole key when it has no colon', () => {
    expect(postingFile('Acme', 'weird key')).toBe('acme-weird-key.txt');
  });
});

describe('filePostingRepository', () => {
  it('writes a header the parser reads, plus the body, and returns a stable ID', async () => {
    const d = dir();
    const repo = filePostingRepository(d);
    const id = await repo.save('Acme Corp', posting);
    expect(id).toBe('acme-corp-xyz');
    const content = readFileSync(join(d, 'acme-corp-xyz.txt'), 'utf8');
    expect(content).toMatch(/^TITLE: Staff Engineer$/m);
    expect(content).toMatch(/^COMPANY: Acme Corp$/m);
    expect(content).toMatch(/^LOCATION: Remote - US \(Remote\)$/m);
    expect(content).toMatch(/^COMPENSATION: \$200K - \$250K$/m);
    expect(content).toMatch(/^URL: https:\/\/jobs\.ashbyhq\.com\/acme\/xyz$/m);
    expect(content).toMatch(/^PUBLISHED: 2026-09-01T00:00:00Z$/m);
    expect(content.trimEnd().endsWith('The role body.')).toBe(true);
  });

  it('says "not stated" when the board gives no comp', async () => {
    const d = dir();
    const repo = filePostingRepository(d);
    const id = await repo.save('Acme', { ...posting, comp: '' });
    expect(readFileSync(join(d, `${id}.txt`), 'utf8')).toMatch(/^COMPENSATION: not stated$/m);
  });

  it('lists records parsed back from their headers, sorted by ID', async () => {
    const d = dir();
    const repo = filePostingRepository(d);
    await repo.save('Acme Corp', posting);
    await repo.save('Beta', { ...posting, key: 'gh:beta:1', title: 'Beta Role' });
    const records = await repo.list();
    expect(records.map((r) => r.id)).toEqual(['acme-corp-xyz', 'beta-1']);
    expect(records[0]).toMatchObject({
      title: 'Staff Engineer',
      company: 'Acme Corp',
      compensation: '$200K - $250K',
    });
    expect(records[0]?.text).toContain('The role body.');
  });

  it('gets by ID and returns null for a miss', async () => {
    const d = dir();
    const repo = filePostingRepository(d);
    const id = await repo.save('Acme', posting);
    expect((await repo.get(id))?.title).toBe('Staff Engineer');
    expect(await repo.get('nope')).toBeNull();
  });

  it('reads a legacy .md posting by ID', async () => {
    const d = dir();
    writeFileSync(join(d, 'legacy.md'), 'TITLE: Old\nCOMPANY: Acme\n\nbody');
    expect((await filePostingRepository(d).get('legacy'))?.title).toBe('Old');
  });

  it('lists nothing for a directory that does not exist yet', async () => {
    expect(await filePostingRepository(join(dir(), 'missing')).list()).toEqual([]);
  });
});

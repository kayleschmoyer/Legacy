import * as fs from 'fs';
import * as path from 'path';

const SCHEMA_PATH = path.join(__dirname, 'schema.ts');

function extractExportPaths(source: string): string[] {
  return [...source.matchAll(/^export \* from '([^']+)'/gm)].map((m) => m[1]);
}

describe('schema.ts', () => {
  let paths: string[];

  beforeAll(() => {
    paths = extractExportPaths(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  });

  it('has no duplicate export paths', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const p of paths) {
      if (seen.has(p)) duplicates.push(p);
      seen.add(p);
    }
    expect(duplicates).toEqual([]);
  });

  it('exports are in alphabetical order', () => {
    const sorted = [...paths].sort((a, b) => a.localeCompare(b));
    expect(paths).toEqual(sorted);
  });
});

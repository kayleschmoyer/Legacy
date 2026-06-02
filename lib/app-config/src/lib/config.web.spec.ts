import * as fs from 'fs';
import * as path from 'path';

describe('config.web.ts static-inlining assertion', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'config.web.ts'),
    'utf-8',
  );

  it('covers a known web config value (statsApiUrl → VITE_STATS_API_URL)', () => {
    expect(source).toContain("import.meta.env['VITE_STATS_API_URL']");
  });

  it('covers rollbarToken → VITE_ROLLBAR_ACCESS_TOKEN', () => {
    expect(source).toContain("import.meta.env['VITE_ROLLBAR_ACCESS_TOKEN']");
  });

  it('uses no dynamic import.meta.env indexing (no variable keys)', () => {
    // Dynamic reads like import.meta.env[key] or import.meta.env[varName] cannot
    // be statically replaced by Vite at build time — they would resolve to undefined
    // in release bundles. This test asserts every access uses a string literal key.
    // Allowed: import.meta.env['VITE_SOME_KEY'] or import.meta.env.VITE_SOME_KEY
    // Forbidden: import.meta.env[someVariable]
    const dynamicAccess = /import\.meta\.env\[(?!'VITE_)[^\]]/;
    expect(dynamicAccess.test(source)).toBe(false);
  });

  it('all import.meta.env reads use VITE_-prefixed keys (client-safe guard)', () => {
    // Extract all import.meta.env bracket-access keys used in this file
    const bracketKeys = [
      ...source.matchAll(/import\.meta\.env\['([^']+)'\]/g),
    ].map((m) => m[1]);
    for (const key of bracketKeys) {
      expect(key).toMatch(/^VITE_/);
    }
  });
});

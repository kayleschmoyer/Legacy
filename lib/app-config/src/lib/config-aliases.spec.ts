/**
 * CI guard: verifies that every alias pair in
 * lib/app-config/plugins/config-aliases.js refers to valid variable names
 * from the CONFIG_KEYS registry (lib/app-config/src/lib/registry.ts).
 *
 * Catches rename-without-sync errors: if a VITE_* or EXPO_PUBLIC_* var is
 * renamed in the registry but config-aliases.js is not updated, this test
 * fails in CI before a release bundle silently gets the wrong value.
 *
 * Note: config-aliases.js is an intentional SUBSET of CONFIG_KEYS — only
 * entries where the monorepo root .env has only the VITE_* form (web) and the
 * EXPO_PUBLIC_* form must be derived. Not every CONFIG_KEYS entry needs an
 * alias, so this spec validates alias→registry consistency, not completeness.
 */

import { CONFIG_KEYS } from './registry';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CONFIG_KEY_ALIASES } = require('../../plugins/config-aliases') as {
  CONFIG_KEY_ALIASES: [string, string][];
};

// Build a lookup: mobile name → web name, from all CONFIG_KEYS entries that
// have both a VITE_* web name and an EXPO_PUBLIC_* mobile name.
const validAliasMap = new Map<string, string>();
for (const entry of Object.values(CONFIG_KEYS)) {
  if (
    'web' in entry &&
    'mobile' in entry &&
    (entry as { web: string }).web.startsWith('VITE_') &&
    (entry as { mobile: string }).mobile.startsWith('EXPO_PUBLIC_')
  ) {
    validAliasMap.set(
      (entry as { mobile: string }).mobile,
      (entry as { web: string }).web,
    );
  }
}

describe('config-aliases.js ↔ CONFIG_KEYS registry validity', () => {
  it('CONFIG_KEY_ALIASES is a non-empty array', () => {
    expect(Array.isArray(CONFIG_KEY_ALIASES)).toBe(true);
    expect(CONFIG_KEY_ALIASES.length).toBeGreaterThan(0);
  });

  it.each(CONFIG_KEY_ALIASES)(
    'alias [%s ← %s] must match a CONFIG_KEYS entry',
    (target, source) => {
      // The target (EXPO_PUBLIC_*) must map to the source (VITE_*) in CONFIG_KEYS.
      expect(validAliasMap.get(target)).toBe(source);
    },
  );
});

import { describe, expect, it } from '@jest/globals';

import {
  isPnpmInstallMissingError,
  isStaleProjectGraphError,
  PROJECT_GRAPH_CACHE_DIRS,
} from './stale-project-graph.js';

describe('isStaleProjectGraphError', () => {
  it('matches the react-native/jest-preset failure signature', () => {
    const err = new Error(
      "NX   Failed to process project graph.\n\nAn error occurred while processing files for the @nx/jest/plugin plugin.\n  - Cannot find module 'react-native/jest-preset'",
    );
    expect(isStaleProjectGraphError(err)).toBe(true);
  });

  it('matches the missing .modules.yaml failure signature', () => {
    const err = new Error(
      'NX   Failed to process project graph.\n\npnpm lockfile detected, but ".../node_modules/.modules.yaml" is missing.',
    );
    expect(isStaleProjectGraphError(err)).toBe(true);
  });

  it('matches the missing @typescript-eslint/type-utils failure signature', () => {
    const err = new Error(
      "NX   Failed to process project graph.\n\nCannot find module '@typescript-eslint/type-utils'",
    );
    expect(isStaleProjectGraphError(err)).toBe(true);
  });

  it('does not match unrelated Nx failures', () => {
    expect(isStaleProjectGraphError(new Error('some other nx failure'))).toBe(
      false,
    );
  });

  it('does not match a daemon race error', () => {
    expect(
      isStaleProjectGraphError(
        new Error('this process is no longer the current daemon'),
      ),
    ).toBe(false);
  });

  it('treats non-Error values as their string form', () => {
    expect(isStaleProjectGraphError('Failed to process project graph')).toBe(
      true,
    );
    expect(isStaleProjectGraphError('unrelated string')).toBe(false);
  });
});

describe('isPnpmInstallMissingError', () => {
  it('matches the missing .modules.yaml signature', () => {
    const err = new Error(
      'NX   Failed to process project graph.\n\npnpm lockfile detected, but ".../node_modules/.modules.yaml" is missing.',
    );
    expect(isPnpmInstallMissingError(err)).toBe(true);
  });

  it('does not match the react-native/jest-preset failure signature', () => {
    const err = new Error(
      "NX   Failed to process project graph.\n\nAn error occurred while processing files for the @nx/jest/plugin plugin.\n  - Cannot find module 'react-native/jest-preset'",
    );
    expect(isPnpmInstallMissingError(err)).toBe(false);
  });

  it('does not match the missing @typescript-eslint/type-utils failure signature', () => {
    const err = new Error(
      "NX   Failed to process project graph.\n\nCannot find module '@typescript-eslint/type-utils'",
    );
    expect(isPnpmInstallMissingError(err)).toBe(false);
  });

  it('does not match unrelated Nx failures', () => {
    expect(isPnpmInstallMissingError(new Error('some other nx failure'))).toBe(
      false,
    );
  });

  it('treats non-Error values as their string form', () => {
    expect(
      isPnpmInstallMissingError(
        'pnpm lockfile detected, but "node_modules/.modules.yaml" is missing.',
      ),
    ).toBe(true);
    expect(isPnpmInstallMissingError('unrelated string')).toBe(false);
  });
});

describe('PROJECT_GRAPH_CACHE_DIRS', () => {
  it('lists the Nx project graph cache directories', () => {
    expect(PROJECT_GRAPH_CACHE_DIRS).toEqual([
      '.nx/cache',
      '.nx/workspace-data',
    ]);
  });
});

/**
 * Shared Jest configuration factory for Nx projects.
 *
 * Usage (node libs/lambdas):
 *   const { createNodeJestConfig } = require('../../jest.helpers.cjs');
 *   module.exports = createNodeJestConfig({ displayName: 'utils', projectPath: 'lib/utils' });
 */

/**
 * @swc/jest options shared by every project's transform. swc does NOT
 * type-check (unlike ts-jest) — a type error inside a `*.spec.ts` file will
 * no longer fail `make test` / `nx test` on its own. CI-level coverage is
 * preserved because `ci-pipeline.yml` runs `nx affected -t typecheck test`
 * together in the same job, but running `make test` alone locally (without
 * `make pc-typecheck` / the full `make pc` suite) will not catch a spec-file
 * type error. Decorator flags are enabled to match `tsconfig.base.json`'s
 * `experimentalDecorators`/`emitDecoratorMetadata`, in case any project ever
 * relies on decorator metadata reflection in tests.
 */
const swcJestConfig = {
  jsc: {
    parser: {
      syntax: 'typescript',
      tsx: true,
      decorators: true,
    },
    transform: {
      legacyDecorator: true,
      decoratorMetadata: true,
    },
    target: 'es2022',
  },
  module: {
    type: 'commonjs',
  },
};

/**
 * @param {string} pattern file-match regex for the transform map (defaults to ts/js, no tsx)
 */
function createSwcTransform(pattern = '^.+\\.[tj]s$') {
  return { [pattern]: ['@swc/jest', swcJestConfig] };
}

/**
 * @param {{ displayName: string, projectPath: string, overrides?: Record<string, unknown> }} options
 */
function createNodeJestConfig({ displayName, projectPath, overrides = {} }) {
  return {
    displayName,
    preset: '../../jest.preset.js',
    testEnvironment: 'node',
    transform: createSwcTransform(),
    moduleFileExtensions: ['ts', 'js', 'html'],
    coverageDirectory: `../../coverage/${projectPath}`,
    ...overrides,
  };
}

module.exports = { createNodeJestConfig, createSwcTransform, swcJestConfig };

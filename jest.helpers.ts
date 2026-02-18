/**
 * Shared Jest configuration factory for Nx projects.
 *
 * Usage (node libs/lambdas):
 *   const { createNodeJestConfig } = require('../../jest.helpers');
 *   module.exports = createNodeJestConfig({ displayName: 'utils', projectPath: 'lib/utils' });
 */

/**
 * @param {{ displayName: string, projectPath: string, overrides?: Record<string, unknown> }} options
 */
function createNodeJestConfig({ displayName, projectPath, overrides = {} }) {
  return {
    displayName,
    preset: '../../jest.preset.js',
    testEnvironment: 'node',
    transform: {
      '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    },
    moduleFileExtensions: ['ts', 'js', 'html'],
    coverageDirectory: `../../coverage/${projectPath}`,
    ...overrides,
  };
}

module.exports = { createNodeJestConfig };

export default {
  displayName: 'draft-processor',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../../coverage/lambdas/draft-processor',
  coverageReporters: ['text', 'lcov'],
  setupFilesAfterEnv: [],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', tsx: true, decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2022',
        },
        module: { type: 'commonjs' },
      },
    ],
  },
  testMatch: ['**/*.(test|spec).(ts|tsx|js|jsx)'],
  passWithNoTests: true,
};

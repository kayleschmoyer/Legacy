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
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  testMatch: ['**/*.(test|spec).(ts|tsx|js|jsx)'],
  passWithNoTests: true,
};

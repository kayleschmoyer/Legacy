export default {
  displayName: 'websocket',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../../coverage/lambdas/websocket',
  coverageReporters: ['text', 'lcov'],
  setupFilesAfterEnv: [],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        diagnostics: { warnOnly: true },
      },
    ],
  },
  testMatch: ['**/*.(test|spec).(ts|tsx|js|jsx)'],
};

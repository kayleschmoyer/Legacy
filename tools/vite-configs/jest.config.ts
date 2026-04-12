import type { Config } from 'jest';

const config: Config = {
  displayName: 'vite-configs',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  coverageDirectory: '../../coverage/tools/vite-configs',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      { tsconfig: '<rootDir>/../../tsconfig.base.json' },
    ],
  },
};

export default config;

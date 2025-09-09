const nxPreset = require('@nx/jest/preset').default;

module.exports = {
  ...nxPreset,
  // Enable watch mode optimizations
  watchman: true,
  // Cache test results for better performance
  cache: true,
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  // Configure change detection for onlyChanged
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/**/index.{js,jsx,ts,tsx}',
  ],
};

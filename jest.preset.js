const nxPreset = require('@nx/jest/preset').default;

module.exports = {
  ...nxPreset,
  // Enable watch mode optimizations
  watchman: true,
  // Cache test results for better performance
  cache: true,
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  // Nx runs up to 5 tasks in parallel (nx.json "parallel"); each jest worker gets its
  // own heap on top of that, so uncapped worker fan-out oversubscribes CI's per-job
  // memory limit and triggers OOM kills/retries (LS-8903). Override per-project only
  // if that project has a proven need for a different ceiling.
  maxWorkers: 2,
  // Configure change detection for onlyChanged
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/**/index.{js,jsx,ts,tsx}',
  ],
};

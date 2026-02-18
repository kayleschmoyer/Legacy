import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createNodeJestConfig } = require('../../jest.helpers.ts');

export default createNodeJestConfig({
  displayName: 'api',
  projectPath: 'lib/api',
  overrides: {
    passWithNoTests: true,
  },
});

const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'aws-utils',
  projectPath: 'lib/aws-utils',
});

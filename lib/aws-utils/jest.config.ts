const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'aws-utils',
  projectPath: 'lib/aws-utils',
});

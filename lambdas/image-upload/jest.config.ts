const { createNodeJestConfig } = require('../../jest.helpers.cjs');

module.exports = createNodeJestConfig({
  displayName: 'image-upload',
  projectPath: 'lambdas/image-upload',
});

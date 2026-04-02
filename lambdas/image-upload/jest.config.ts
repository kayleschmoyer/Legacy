const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'image-upload',
  projectPath: 'lambdas/image-upload',
});

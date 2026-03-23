const { createNodeJestConfig } = require('../../jest.helpers.ts');

module.exports = createNodeJestConfig({
  displayName: 'discord-bot',
  projectPath: 'lambdas/discord-bot',
});

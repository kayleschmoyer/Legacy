const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/lambdas/game-selection'),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'web',
      tsConfig: 'lambdas/game-selection/tsconfig.app.json',
      compiler: 'swc',
      main: 'lambdas/game-selection/src/main.ts',
      outputHashing: 'all',
    }),
  ],
};

const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const path = require('path');

function applyBaseConfig(config) {
  if (config.resolve === undefined) {
    config.resolve = {};
  }

  if (config.resolve.plugins === undefined) {
    config.resolve.plugins = [];
  }

  config.resolve.plugins.push(
    new TsconfigPathsPlugin({
      configFile: path.resolve(__dirname, 'tsconfig.base.json'),
    }),
  );
  return config;
}

module.exports = {
  applyBaseConfig,
};

const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { NxReactWebpackPlugin } = require('@nx/react/webpack-plugin');
const { join } = require('path');
const {EnvironmentPlugin} = require('webpack');
const { applyBaseConfig } = require('../../webpack.config.base');
const {config} = require('dotenv');

config();

module.exports = applyBaseConfig({
  output: {
    path: join(__dirname, '../../dist/apps/graphql-explorer'),
  },
  devServer: {
    port: 4200,
  },
  plugins: [
    new EnvironmentPlugin(['GRAPHQL_HOST']),
    new NxAppWebpackPlugin({
      tsConfig: './tsconfig.app.json',
      compiler: 'babel',
      main: './src/main.tsx',
      index: './src/index.html',
      baseHref: '/',
      assets: ['./src/favicon.ico', './src/assets'],
      styles: [],
      outputHashing: process.env['NODE_ENV'] === 'production' ? 'all' : 'none',
      optimization: process.env['NODE_ENV'] === 'production',
    }),
    new NxReactWebpackPlugin({
      // Uncomment this line if you don't want to use SVGR
      // See: https://react-svgr.com/
      // svgr: false
    }),
  ],
});

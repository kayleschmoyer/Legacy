const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const { applyBaseConfig } = require('../webpack.config.base');

const config = applyBaseConfig({
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    libraryTarget: 'commonjs',
  },
  entry: {
    index: './src/index.ts',
  },
  mode: 'production',
  target: 'node',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [
    new webpack.IgnorePlugin({ resourceRegExp: /^pg-native$/ }),

    // Omit websocket functionality from postgraphile:
    new webpack.NormalModuleReplacementPlugin(
      /postgraphile\/build\/postgraphile\/http\/subscriptions\.js$/,
      `${__dirname}/mocks/postgraphile-http-subscriptions.js`,
    ),

    // Just in case you install express:
    new webpack.NormalModuleReplacementPlugin(
      /express\/lib\/view\.js$/,
      `${__dirname}/mocks/express-lib-view.js`,
    ),
  ],
  node: {
    __dirname: false, // just output `__dirname`
  },
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          // Without this, you may get errors such as
          // `Error: GraphQL conflict for 'e' detected! Multiple versions of graphql exist in your node_modules?`
          mangle: false,
        },
      }),
    ],
  },
});

module.exports = config;

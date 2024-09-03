const { resolve } = require('path');
const { IgnorePlugin, NormalModuleReplacementPlugin } = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const { applyBaseConfig } = require('../../webpack.config.base');

module.exports = applyBaseConfig({
  output: {
    path: resolve(__dirname, 'dist'),
    filename: 'index.js',
    libraryTarget: 'commonjs',
  },
  entry: {
    index: './src/main.ts',
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
    new IgnorePlugin({ resourceRegExp: /^pg-native$/ }),

    // Omit websocket functionality from postgraphile:
    new NormalModuleReplacementPlugin(
      /postgraphile\/build\/postgraphile\/http\/subscriptions\.js$/,
      `${__dirname}/mocks/postgraphile-http-subscriptions.js`,
    ),

    // Just in case you install express:
    new NormalModuleReplacementPlugin(
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

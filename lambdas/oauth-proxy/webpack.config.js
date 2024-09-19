const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const { applyBaseConfig } = require('../../webpack.config.base');

const config = applyBaseConfig({
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    libraryTarget: 'commonjs',
  },
  entry: {
    google: path.resolve(__dirname, 'src/handlers/Google'),
    local: path.resolve(__dirname, 'src/handlers/Local'),
  },
  externals: {
    pg: true,
    'pg-hstore': true,
    '@sequelize/mysql': true,
    '@sequelize/db2': true,
    '@sequelize/db2-ibmi': true,
    '@sequelize/sqlite3': true,
    '@sequelize/mssql': true,
    '@sequelize/mariadb': true,
    '@sequelize/snowflake': true,
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
    fallback: {
      fs: false,
      os: false,
      path: false,
    },
  },
  plugins: [
    // Just in case you install express:
    new webpack.NormalModuleReplacementPlugin(
      /express\/lib\/view\.js$/,
      `${__dirname}/mocks/express-lib-view.js`
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

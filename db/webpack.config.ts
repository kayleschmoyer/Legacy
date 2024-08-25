import * as path from 'path';
import * as webpack from 'webpack';
import * as TerserPlugin from 'terser-webpack-plugin';
import { options as postgraphileOptions } from './src/postgraphileOptions';

const config: webpack.Configuration = {
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    libraryTarget: 'commonjs',
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
    // Prevent loading pg-native (in a weird, backwards kind of way!)
    ...[
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': '"production"',
        'process.env.POSTGRAPHILE_ENV': '"production"',
        'process.env.NODE_PG_FORCE_NATIVE': JSON.stringify('1'),
        ...(postgraphileOptions.graphiql
          ? null
          : {
              'process.env.POSTGRAPHILE_OMIT_ASSETS': '"1"',
            }),
      }),
      new webpack.NormalModuleReplacementPlugin(
        /pg\/lib\/native\/index\.js$/,
        '../client.js'
      ),
    ],

    // Omit websocket functionality from postgraphile:
    new webpack.NormalModuleReplacementPlugin(
      /postgraphile\/build\/postgraphile\/http\/subscriptions\.js$/,
      `${__dirname}/src/postgraphile-http-subscriptions.js`
    ),

    // Just in case you install express:
    new webpack.NormalModuleReplacementPlugin(
      /express\/lib\/view\.js$/,
      `${__dirname}/src/express-lib-view.js`
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
};

export default config;

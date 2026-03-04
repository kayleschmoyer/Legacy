import { defineConfig, loadEnv } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { resolve } from 'path';
import { rollbarSourcemapPlugin } from '../../tools/vite-configs';

export default defineConfig(({ mode }) => {
  // Load environment variables from workspace root and merge with process.env
  const env = loadEnv(mode, resolve(__dirname, '../../'), '');

  // Merge environment variables into process.env so they're available at runtime
  Object.assign(process.env, env);

  // Determine if this is a production deployment build
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    cacheDir: '../../node_modules/.vite/lambdas/db',

    // Read environment variables from workspace root
    envDir: resolve(__dirname, '../../'),

    plugins: [
      nxViteTsPaths(),
      ...(isProduction && process.env.ROLLBAR_ACCESS_TOKEN
        ? [
            rollbarSourcemapPlugin({
              accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
              version:
                process.env.GITHUB_SHA || process.env.APP_VERSION || 'dev',
              publicPath: 'app://lambda-db',
            }),
          ]
        : []),
    ],

    // Configure for Node.js/SSR mode
    ssr: {
      target: 'node',
      noExternal: true, // Bundle all dependencies
    },

    build: {
      outDir: 'dist',
      emptyOutDir: true,
      ssr: true,
      sourcemap: isProduction ? true : false, // Enable sourcemaps for production
      rollupOptions: {
        input: resolve(__dirname, 'src/index.ts'),
        output: {
          entryFileNames: 'index.js',
          format: 'cjs',
        },
        external: [
          // Node.js built-ins only
          'path',
          'fs',
          'crypto',
          'http',
          'https',
          'os',
          'util',
          'events',
          'stream',
          'buffer',
          'url',
          'querystring',
          'zlib',
          // Only externalize AWS SDK since it's available in Lambda runtime
          'aws-sdk',
          '@aws-sdk/client-rds-data',
          // Externalize pg-native to prevent bundling issues
          'pg-native',
          // Externalize problematic dependencies
          '@yaacovcr/transform',
        ],
      },
      target: 'node18',
    },
  };
});

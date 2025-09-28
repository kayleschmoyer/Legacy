import { defineConfig, loadEnv } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import path from 'path';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  // Load environment variables from workspace root and merge with process.env
  const env = loadEnv(mode, resolve(__dirname, '../../'), '');

  // Merge environment variables into process.env so they're available at runtime
  Object.assign(process.env, env);

  return {
    cacheDir: '../../node_modules/.vite/lambdas/db',

    // Read environment variables from workspace root
    envDir: resolve(__dirname, '../../'),

    plugins: [nxViteTsPaths()],

    // Configure for Node.js/SSR mode
    ssr: {
      target: 'node',
      noExternal: true, // Bundle all dependencies
    },

    build: {
      outDir: 'dist',
      emptyOutDir: true,
      ssr: true,
      rollupOptions: {
        input: path.resolve(__dirname, 'src/index.ts'),
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
        ],
      },
      target: 'node18',
    },
  };
});

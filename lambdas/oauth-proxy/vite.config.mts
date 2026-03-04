import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { rollbarSourcemapPlugin } from '../../tools/vite-configs';

// Determine if this is a production deployment build
const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  cacheDir: '../../node_modules/.vite/lambdas/oauth-proxy',

  plugins: [
    nxViteTsPaths(),
    ...(isProduction && process.env.ROLLBAR_ACCESS_TOKEN
      ? [
          rollbarSourcemapPlugin({
            accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
            version: process.env.GITHUB_SHA || process.env.APP_VERSION || 'dev',
            publicPath: 'app://lambda-oauth-proxy',
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
      input: 'src/index.ts',
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
        '@aws-sdk/client-secrets-manager',
        // Externalize pg-native to prevent bundling issues
        'pg-native',
      ],
    },
    target: 'node20',
  },
});

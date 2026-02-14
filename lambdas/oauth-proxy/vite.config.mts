import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { execSync } from 'child_process';

// Determine if this is a production deployment build
const isProduction = process.env.NODE_ENV === 'production';
const enableSentry = isProduction && !!process.env.SENTRY_AUTH_TOKEN;

// Get version/release information
const appVersion = process.env.APP_VERSION || '0.0.0';
const commitSha = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
})();

export default defineConfig({
  cacheDir: '../../node_modules/.vite/lambdas/oauth-proxy',

  plugins: [
    nxViteTsPaths(),
    // Upload sourcemaps to Sentry for production builds
    ...(enableSentry
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG || 'legacy-sports',
            project: process.env.SENTRY_PROJECT || 'lambda-oauth-proxy',
            authToken: process.env.SENTRY_AUTH_TOKEN,
            release: {
              name: `oauth-proxy@${appVersion}-${commitSha}`,
              setCommits: {
                auto: true,
                ignoreMissing: true,
              },
            },
            sourcemaps: {
              assets: './dist/**',
              filesToDeleteAfterUpload: ['./dist/**/*.map'],
            },
            telemetry: false,
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
    sourcemap: isProduction ? 'hidden' : false, // Enable sourcemaps for production
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

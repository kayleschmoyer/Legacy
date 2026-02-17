import { defineConfig, loadEnv } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { resolve } from 'path';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { execSync } from 'child_process';

export default defineConfig(({ mode }) => {
  // Load environment variables from workspace root and merge with process.env
  const env = loadEnv(mode, resolve(__dirname, '../../'), '');

  // Merge environment variables into process.env so they're available at runtime
  Object.assign(process.env, env);

  // Determine if this is a production deployment build
  const isProduction = process.env.NODE_ENV === 'production';
  const enableSentry = isProduction && !!process.env.SENTRY_AUTH_TOKEN;

  // Get version/release information
  const appVersion = process.env.APP_VERSION || '0.0.0';
  // Only shell out to git during actual builds (NX_TASK_HASH is set),
  // not during Nx graph creation where vite configs may be evaluated.
  const commitSha =
    process.env.VITE_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    (process.env.NX_TASK_HASH
      ? (() => {
          try {
            return execSync('git rev-parse --short HEAD').toString().trim();
          } catch {
            return 'dev';
          }
        })()
      : 'dev');

  return {
    cacheDir: '../../node_modules/.vite/lambdas/db',

    // Read environment variables from workspace root
    envDir: resolve(__dirname, '../../'),

    plugins: [
      nxViteTsPaths(),
      // Upload sourcemaps to Sentry for production builds
      ...(enableSentry
        ? [
            sentryVitePlugin({
              org: process.env.SENTRY_ORG || 'legacy-sports',
              project: process.env.SENTRY_PROJECT || 'lambda-graphql',
              authToken: process.env.SENTRY_AUTH_TOKEN,
              release: {
                name: `db-lambda@${appVersion}-${commitSha}`,
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

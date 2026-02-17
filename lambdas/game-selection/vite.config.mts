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
    cacheDir: '../../node_modules/.vite/lambdas/game-selection',
    root: __dirname,

    // Read environment variables from workspace root
    envDir: resolve(__dirname, '../../'),

    plugins: [
      nxViteTsPaths(),
      // Upload sourcemaps to Sentry for production builds
      ...(enableSentry
        ? [
            sentryVitePlugin({
              org: process.env.SENTRY_ORG || 'legacy-sports',
              project: process.env.SENTRY_PROJECT || 'lambda-game-selection',
              authToken: process.env.SENTRY_AUTH_TOKEN,
              release: {
                name: `game-selection@${appVersion}-${commitSha}`,
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

    // Build for Node.js environment (Lambda)
    build: {
      emptyOutDir: true,
      sourcemap: isProduction ? 'hidden' : false, // Enable sourcemaps for production
      lib: {
        entry: 'src/index.ts',
        fileName: 'index',
        formats: ['cjs'],
      },
      outDir: 'dist',
      rollupOptions: {
        // Bundle all dependencies except Node.js built-ins and pg-native
        external: (id) => {
          // Externalize pg-native (optional native dependency)
          if (id === 'pg-native') {
            return true;
          }

          // Only externalize Node.js built-in modules
          return [
            'assert',
            'buffer',
            'child_process',
            'cluster',
            'crypto',
            'dgram',
            'dns',
            'domain',
            'events',
            'fs',
            'http',
            'https',
            'net',
            'os',
            'path',
            'punycode',
            'querystring',
            'readline',
            'stream',
            'string_decoder',
            'tls',
            'tty',
            'url',
            'util',
            'v8',
            'vm',
            'zlib',
          ].includes(id);
        },
      },
      ssr: true,
      target: 'node20',
    },
    // Enable complete dependency bundling
    ssr: {
      noExternal: true, // Bundle everything
    },
  };
});

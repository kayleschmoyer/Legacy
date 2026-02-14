import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { builtinModules } from 'module';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { execSync } from 'child_process';

// Cache the built-in modules set for performance
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]);

export function createLambdaConfig(projectName: string, entryFile?: string) {
  const entry = entryFile || 'src/index.ts';

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

  return defineConfig({
    cacheDir: `../../node_modules/.vite/lambdas/${projectName}`,
    root: process.cwd(),

    plugins: [
      nxViteTsPaths(),
      // Upload sourcemaps to Sentry for production builds
      ...(enableSentry
        ? [
            sentryVitePlugin({
              org: process.env.SENTRY_ORG || 'legacy-sports',
              project: process.env.SENTRY_PROJECT || `lambda-${projectName}`,
              authToken: process.env.SENTRY_AUTH_TOKEN,
              release: {
                name: `${projectName}@${appVersion}-${commitSha}`,
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

    // Optimize dependency scanning to prevent timeouts
    optimizeDeps: {
      disabled: false,
      include: [],
      exclude: ['@aws-sdk/*'],
      holdUntilCrawlEnd: false, // Don't wait for full crawl
    },

    // Configure for Node.js/SSR mode
    ssr: {
      target: 'node',
      noExternal: true, // Bundle all dependencies
    },

    build: {
      outDir: 'dist',
      emptyOutDir: true,
      ssr: true,
      // Performance optimizations
      minify: false, // Skip minification for faster builds
      sourcemap: isProduction ? 'hidden' : false, // Enable sourcemaps for production, hidden from bundle
      rollupOptions: {
        input: entry,
        output: {
          entryFileNames: 'index.js',
          format: 'cjs',
          manualChunks: undefined, // Avoid chunk optimization overhead
        },
        // Optimized external function using Set lookup
        external: (id: string) => {
          // Fast lookup for Node.js built-ins
          if (nodeBuiltins.has(id)) return true;

          // Keep AWS SDK external to reduce bundle size and build time
          if (id.startsWith('@aws-sdk/')) return true;

          return false;
        },
      },
    },

    // Performance optimizations
    esbuild: {
      target: 'node20',
      platform: 'node',
    },
  });
}

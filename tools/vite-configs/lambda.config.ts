import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { builtinModules } from 'module';

// Cache the built-in modules set for performance
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]);

export function createLambdaConfig(projectName: string, entryFile?: string) {
  const entry = entryFile || 'src/index.ts';

  return defineConfig({
    cacheDir: `../../node_modules/.vite/lambdas/${projectName}`,
    root: process.cwd(),

    plugins: [nxViteTsPaths()],

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
      sourcemap: false, // Disable sourcemaps for speed
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

    test: {
      globals: true,
      cache: {
        dir: '../../node_modules/.vitest',
      },
      environment: 'node',
      include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    },
  });
}

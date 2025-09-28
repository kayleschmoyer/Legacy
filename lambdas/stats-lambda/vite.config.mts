import { defineConfig, loadEnv } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  // Load environment variables from workspace root and merge with process.env
  const env = loadEnv(mode, resolve(__dirname, '../../'), '');

  // Merge environment variables into process.env so they're available at runtime
  Object.assign(process.env, env);

  return {
    cacheDir: '../../node_modules/.vite/lambdas/stats-lambda',
    root: __dirname,

    // Read environment variables from workspace root
    envDir: resolve(__dirname, '../../'),

    plugins: [nxViteTsPaths()],

    // Build for Node.js environment (Lambda)
    build: {
      emptyOutDir: true,
      lib: {
        entry: 'src/index.ts',
        fileName: 'index',
        formats: ['cjs'],
      },
      outDir: 'dist',
      rollupOptions: {
        // Bundle all dependencies except Node.js built-ins
        external: (id) => {
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

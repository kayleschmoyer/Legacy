import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  cacheDir: '../../node_modules/.vite/lambdas/game-selection',
  root: __dirname,

  plugins: [nxViteTsPaths()],

  // Build for Node.js environment (Lambda)
  build: {
    emptyOutDir: true,
    lib: {
      entry: 'src/dev.ts',
      fileName: 'dev',
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
});

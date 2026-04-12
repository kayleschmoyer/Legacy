import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { dep0169UrlShimPlugin } from '../../tools/vite-configs';

export default defineConfig({
  cacheDir: '../../node_modules/.vite/lambdas/stripe-webhook',

  plugins: [dep0169UrlShimPlugin(), nxViteTsPaths()],

  ssr: {
    target: 'node',
    noExternal: true,
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    ssr: true,
    sourcemap: false,
    rollupOptions: {
      input: 'src/index.ts',
      output: {
        entryFileNames: 'index.js',
        format: 'cjs',
      },
      external: [
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
        'aws-sdk',
        '@aws-sdk/client-secrets-manager',
      ],
    },
    target: 'node20',
  },
});

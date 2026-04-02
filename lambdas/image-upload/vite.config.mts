import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  cacheDir: '../../node_modules/.vite/lambdas/image-upload',

  plugins: [nxViteTsPaths()],

  // Configure for Node.js/SSR mode
  ssr: {
    target: 'node',
    noExternal: true,
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    ssr: true,
    sourcemap: process.env.NODE_ENV === 'production',
    rollupOptions: {
      input: 'src/index.ts',
      output: {
        entryFileNames: 'index.js',
        format: 'cjs',
      },
      external: [
        // Node.js built-ins
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
        // AWS SDK available in Lambda runtime
        'aws-sdk',
        '@aws-sdk/client-secrets-manager',
        // Prevent pg-native bundling issues
        'pg-native',
      ],
    },
    target: 'node20',
  },
});

/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/graphql-explorer',

  server: {
    host: 'localhost',
    port: 4200,
  },

  preview: {
    host: 'localhost',
    port: 4300,
  },

  plugins: [react(), nxViteTsPaths()],

  build: {
    emptyOutDir: true,
    outDir: '../../dist/apps/graphql-explorer',
    reportCompressedSize: true,
  },

  define: {
    global: 'globalThis',
    'process.env.GRAPHQL_HOST': JSON.stringify(process.env.GRAPHQL_HOST),
  },

  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/graphql-explorer',
      provider: 'v8',
    },
  },
});

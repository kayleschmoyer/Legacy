import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export function createWebAppConfig(
  projectName: string,
  options?: {
    baseUrl?: string;
    copyAssets?: string[];
    reactConfig?: object;
  },
) {
  const { baseUrl, copyAssets, reactConfig } = options || {};

  return defineConfig({
    cacheDir: `../../node_modules/.vite/apps/${projectName}`,

    base: baseUrl || process.env.VITE_BASE_URL || '/',

    plugins: [
      react(reactConfig || {}),
      nxViteTsPaths(),
      ...(copyAssets ? [nxCopyAssetsPlugin(copyAssets)] : []),
    ],

    // Optimize dependency scanning
    optimizeDeps: {
      include: ['react', 'react-dom', '@apollo/client'],
      exclude: [],
      holdUntilCrawlEnd: false, // Don't wait for full crawl
    },

    resolve: {
      alias: {
        'react-native$': 'react-native-web',
        'react-native/Libraries/Components/View/ViewStylePropTypes':
          'react-native-web/dist/exports/View/ViewStylePropTypes',
        'react-native/Libraries/EventEmitter/RCTDeviceEventEmitter':
          'react-native-web/dist/vendor/react-native/NativeEventEmitter/RCTDeviceEventEmitter',
        'react-native/Libraries/vendor/emitter/EventEmitter':
          'react-native-web/dist/vendor/react-native/emitter/EventEmitter',
        'react-native/Libraries/EventEmitter/NativeEventEmitter':
          'react-native-web/dist/vendor/react-native/NativeEventEmitter',
      },
    },

    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // Performance optimizations
      sourcemap: false, // Disable sourcemaps for faster builds
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            apollo: ['@apollo/client'],
          },
        },
      },
    },

    server: {
      port: 4200,
      host: 'localhost',
    },

    preview: {
      port: 4300,
      host: 'localhost',
    },

    test: {
      globals: true,
      cache: {
        dir: '../../node_modules/.vitest',
      },
      environment: 'jsdom',
      include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      setupFiles: ['src/test-setup.ts'],
    },
  });
}

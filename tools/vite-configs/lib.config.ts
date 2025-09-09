import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import dts from 'vite-plugin-dts';
import * as path from 'path';

export function createLibConfig(
  projectName: string,
  options?: {
    hasReact?: boolean;
    copyAssets?: string[];
    generateDts?: boolean;
    customOutDir?: string;
  }
) {
  const {
    hasReact = false,
    copyAssets,
    generateDts = false,
    customOutDir,
  } = options || {};

  return defineConfig({
    cacheDir: `../../node_modules/.vite/lib/${projectName}`,
    root: process.cwd(),

    plugins: [
      ...(hasReact ? [react()] : []),
      nxViteTsPaths(),
      ...(copyAssets ? [nxCopyAssetsPlugin(copyAssets)] : []),
      ...(generateDts
        ? [
            dts({
              entryRoot: 'src',
              tsconfigPath: path.join(process.cwd(), 'tsconfig.lib.json'),
              pathsToAliases: false,
            }),
          ]
        : []),
    ],

    // Optimize dependency scanning
    optimizeDeps: {
      disabled: false,
      holdUntilCrawlEnd: false, // Don't wait for full crawl
      include: hasReact ? ['react', 'react-dom'] : [],
      exclude: [],
    },

    // Modern cross-platform configuration
    define: {
      __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
    },

    resolve: {
      alias: hasReact
        ? {
            // React Native Web compatibility
            'react-native$': 'react-native-web',
            'react-native/Libraries/Components/View/ViewStylePropTypes':
              'react-native-web/dist/exports/View/ViewStylePropTypes',
            'react-native/Libraries/EventEmitter/RCTDeviceEventEmitter':
              'react-native-web/dist/vendor/react-native/NativeEventEmitter/RCTDeviceEventEmitter',
            'react-native/Libraries/vendor/emitter/EventEmitter':
              'react-native-web/dist/vendor/react-native/emitter/EventEmitter',
            'react-native/Libraries/EventEmitter/NativeEventEmitter':
              'react-native-web/dist/vendor/react-native/NativeEventEmitter',
          }
        : {},
    },

    build: {
      lib: {
        entry: 'src/index.ts',
        name: projectName,
        fileName: (format) => `index.${format}.js`,
        formats: ['es', 'cjs'],
      },
      rollupOptions: {
        external: [
          'react',
          'react-dom',
          'react-native',
          'react-native-web',
          '@apollo/client',
          'graphql',
        ],
        output: {
          manualChunks: undefined, // Simplify chunking
        },
      },
      outDir: customOutDir || 'dist',
      emptyOutDir: true,
      // Performance optimizations
      sourcemap: false, // Disable sourcemaps for faster builds
      reportCompressedSize: true,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },

    test: {
      globals: true,
      cache: {
        dir: '../../node_modules/.vitest',
      },
      environment: hasReact ? 'jsdom' : 'node',
      include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      setupFiles: hasReact ? ['src/test-setup.ts'] : [],
    },
  });
}

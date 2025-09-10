/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { resolve } from 'path';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/web',
  base: process.env.NODE_ENV === 'production' ? '/legacy-sports/' : '/',
  server: {
    port: 4200,
    host: 'localhost',
  },
  preview: {
    port: 4200,
    host: 'localhost',
  },
  plugins: [react(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],

  // Optimize dependency scanning and exclude React Native completely
  optimizeDeps: {
    include: ['react', 'react-dom', '@apollo/client'],
    exclude: [
      // Exclude all React Native related packages
      'react-native',
      '@expo/vector-icons',
      'react-native-safe-area-context',
      'react-native-table-component',
      'react-native-gesture-handler',
      'react-native-reanimated',
      'react-native-screens',
      'react-native-svg',
      'expo-secure-store',
    ],
    esbuildOptions: {
      jsx: 'automatic' as const,
    },
  },

  esbuild: {
    jsx: 'automatic' as const,
    jsxImportSource: 'react',
  },

  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      external: (id) => {
        // Externalize any react-native path to prevent bundling
        if (id.includes('react-native') && !id.includes('react-native-web')) {
          return true;
        }
        // Also externalize these specific packages
        return [
          '@expo/vector-icons',
          'react-native-safe-area-context',
          'react-native-table-component',
          'react-native-gesture-handler',
          'react-native-reanimated',
          'react-native-screens',
          'react-native-svg',
          'expo-secure-store',
        ].includes(id);
      },
    },
  },
  resolve: {
    alias: {
      // Platform-specific component resolution at build time
      // Single alias pointing to web platform directory index
      __PLATFORM_COMPONENTS__: resolve(
        __dirname,
        '../../lib/shared-components/src/platform-components/web/index.ts'
      ),

      // Complete React Native to React Native Web aliases
      'react-native$': 'react-native-web',
      'react-native/Libraries/Components/View/ViewStylePropTypes':
        'react-native-web/dist/exports/View/ViewStylePropTypes',
      'react-native/Libraries/EventEmitter/RCTDeviceEventEmitter':
        'react-native-web/dist/vendor/react-native/NativeEventEmitter/RCTDeviceEventEmitter',
      'react-native/Libraries/vendor/emitter/EventEmitter':
        'react-native-web/dist/vendor/react-native/emitter/EventEmitter',
      'react-native/Libraries/EventEmitter/NativeEventEmitter':
        'react-native-web/dist/vendor/react-native/NativeEventEmitter',
      'react-native/Libraries/Utilities/codegenNativeComponent':
        'react-native-web/dist/cjs/exports/View',
      'react-native/Libraries/ReactNative/AppContainer':
        'react-native-web/dist/cjs/exports/View',
      'react-native/Libraries/Utilities/codegenNativeCommands':
        'react-native-web/dist/cjs/exports/View',
      'react-native/index.js': 'react-native-web',

      // Mock any react-native path to react-native-web
      'react-native/Libraries': 'react-native-web/dist/cjs',

      // Mock Expo modules for web
      'expo-secure-store': resolve(__dirname, 'src/mocks/expo-secure-store.ts'),
    },
    extensions: [
      '.web.tsx',
      '.web.ts',
      '.web.jsx',
      '.web.js',
      '.tsx',
      '.ts',
      '.jsx',
      '.js',
    ],
  },
  define: {
    // Define globals that Tamagui expects
    'process.env.TAMAGUI_TARGET': JSON.stringify('web'),
    'process.env.NODE_ENV': JSON.stringify(
      process.env.NODE_ENV || 'development'
    ),
    'process.env.PLATFORM': JSON.stringify('web'),
    __DEV__: process.env.NODE_ENV === 'development',
  },
}));

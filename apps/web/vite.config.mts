/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/web',
  server: {
    port: 4200,
    host: 'localhost',
  },
  preview: {
    port: 4200,
    host: 'localhost',
  },
  plugins: [
    react(),
    nxViteTsPaths(),
    nxCopyAssetsPlugin(['*.md']),
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      external: [
        // Externalize React Native packages that cause issues
        'react-native-safe-area-context',
        'react-native-screens',
      ],
    },
  },
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      // Mock problematic paths that don't exist in react-native-web
      'react-native/Libraries/Utilities/codegenNativeComponent': './src/mocks/codegenNativeComponent.js',
      'react-native/Libraries/Utilities/codegenNativeCommands': './src/mocks/codegenNativeCommands.js',
      'react-native/Libraries/ReactNative/AppContainer': './src/mocks/AppContainer.js',
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
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    __DEV__: process.env.NODE_ENV === 'development',
  },
}));

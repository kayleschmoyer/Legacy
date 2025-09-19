import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { resolve } from 'path';
import { tamaguiPlugin } from '@tamagui/vite-plugin';
import reactNativeWeb from 'vite-plugin-react-native-web';

export default defineConfig(({ mode }) => {
  const platform = process.env.BUILD_PLATFORM || 'web';

  return {
    cacheDir: '../../node_modules/.vite/lib/shared-components',
    root: __dirname,

    plugins: [
      ...(platform === 'web' ? [reactNativeWeb()] : []),
      ...(platform === 'web'
        ? [
            tamaguiPlugin({
              config: resolve(
                __dirname,
                '../tamagui-config/src/lib/tamagui-config.ts',
              ),
              platform: 'web',
              // Disable extraction in development to avoid issues
              disableExtraction: process.env.NODE_ENV === 'development',
              // Enable tree shaking
              useReactNativeWebLite: false,
            }),
          ]
        : []),
      react(),
      nxViteTsPaths(),
    ],

    // Modern cross-platform configuration
    define: {
      __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
      'process.env.PLATFORM': JSON.stringify(platform),
      'process.env.TAMAGUI_TARGET': JSON.stringify(platform),
      'process.env.NODE_ENV': JSON.stringify(
        process.env.NODE_ENV || 'development',
      ),
    },

    resolve: {
      alias: {
        // Platform-specific component resolution at build time
        // Single alias pointing to platform directory index
        __PLATFORM_COMPONENTS__: resolve(
          __dirname,
          `src/platform-components/${platform}/index.ts`,
        ),

        // React Native Web compatibility
        'react-native$':
          platform === 'web' ? 'react-native-web' : 'react-native',
        'react-native-svg$':
          platform === 'web' ? 'react-native-svg-web' : 'react-native-svg',

        // React Native Picker compatibility
        '@react-native-picker/picker$':
          platform === 'web'
            ? resolve(
                __dirname,
                '../../apps/web/src/mocks/react-native-picker.ts',
              )
            : '@react-native-picker/picker',

        'react-native/Libraries/Components/View/ViewStylePropTypes$':
          'react-native-web/dist/exports/View/ViewStylePropTypes',
        'react-native/Libraries/EventEmitter/RCTDeviceEventEmitter$':
          'react-native-web/dist/vendor/react-native/NativeEventEmitter/RCTDeviceEventEmitter',
        'react-native/Libraries/vendor/emitter/EventEmitter$':
          'react-native-web/dist/vendor/react-native/emitter/EventEmitter',
        'react-native/Libraries/EventEmitter/NativeEventEmitter$':
          'react-native-web/dist/vendor/react-native/NativeEventEmitter',
      },
      extensions: [
        `.${platform}.tsx`,
        `.${platform}.ts`,
        `.${platform}.jsx`,
        `.${platform}.js`,
        '.tsx',
        '.ts',
        '.jsx',
        '.js',
      ],
    },

    // Handle JSX in dependencies based on platform
    optimizeDeps: {
      include:
        platform === 'web' ? ['react', 'react-dom', '@apollo/client'] : [],
      exclude:
        platform === 'mobile'
          ? ['react-native-table-component', '@expo/vector-icons']
          : [
              'react-native',
              'react-native-table-component',
              '@expo/vector-icons',
              '@tamagui/animations-react-native',
              '@react-native-community/cli',
              'react-native-picker-select',
              'react-native-gesture-handler',
              'react-native-reanimated',
              'react-native-screens',
              'react-native-svg',
              'react-native-safe-area-context',
            ],
      esbuildOptions: {
        loader: {
          '.js': 'jsx',
        },
        jsx: 'automatic',
        define:
          platform === 'web'
            ? {
                'process.env.REACT_NATIVE_VERSION': 'undefined',
                global: 'globalThis',
              }
            : {},
      },
    },

    esbuild: {
      jsx: 'automatic',
      jsxImportSource: 'react',
    },

    // Build as a library
    build: {
      emptyOutDir: true,
      outDir: `dist/${platform}`,
      lib: {
        entry: platform === 'web' ? 'src/index.web.ts' : 'src/index.ts',
        name: 'SharedComponents',
        fileName: (format) => `index.${format}.js`,
        formats: ['es', 'cjs'],
      },
      rollupOptions: {
        external: [
          'react',
          'react-dom',
          'react/jsx-runtime',
          ...(platform === 'web'
            ? ['react-native-web', 'react-native-svg-web']
            : [
                'react-native',
                'react-native-svg',
                '@expo/vector-icons',
                'react-native-table-component',
                'react-native-screens',
                'react-native-safe-area-context',
                'react-native-gesture-handler',
                'react-native-reanimated',
              ]),
          '@tamagui/core',
          '@tamagui/config',
          // Only externalize tamagui animations for mobile
          ...(platform === 'mobile'
            ? ['@tamagui/animations-react-native']
            : []),
          '@react-navigation/native',
          '@react-navigation/stack',
          '@react-navigation/drawer',
          '@apollo/client',
          '@react-native-picker/picker',
          'react-router-dom',
          'tamagui',
          // Node.js built-ins that should still be externalized
          'path',
          'fs',
          'os',
          'crypto',
          'url',
          'util',
          'stream',
          'buffer',
          'events',
          'querystring',
          'assert',
          'child_process',
          'cluster',
          'dgram',
          'dns',
          'domain',
          'http',
          'https',
          'net',
          'punycode',
          'readline',
          'repl',
          'string_decoder',
          'sys',
          'timers',
          'tty',
          'vm',
          'zlib',
          // Keep pino external for backward compatibility
          'pino',
        ],
        output: {
          globals: {
            react: 'React',
            'react-dom': 'ReactDOM',
            'react-native': 'ReactNative',
            'react-native-web': 'ReactNativeWeb',
          },
        },
      },
      target: 'es2015',
    },

    test: {
      globals: true,
      cache: {
        dir: '../../node_modules/.vitest',
      },
      environment: 'jsdom',
      include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    },
  };
});

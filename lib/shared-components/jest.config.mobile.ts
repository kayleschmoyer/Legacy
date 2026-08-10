module.exports = {
  coverageDirectory: '../../coverage/lib/shared-components/mobile',
  displayName: 'shared-components:mobile',
  moduleFileExtensions: [
    'native.ts',
    'native.tsx',
    'ts',
    'tsx',
    'native.js',
    'native.jsx',
    'js',
    'jsx',
  ],
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      'identity-obj-proxy',
    '^__PLATFORM_COMPONENTS__$': '<rootDir>/src/platform-components/mobile',
    '^@legacy-sports/logging$': '<rootDir>/../../lib/logging/src',
    '^@legacy-sports/(.*)$': '<rootDir>/../../lib/$1/src',
  },
  setupFilesAfterEnv: ['<rootDir>/jest-setup-mobile.js'],
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': [
      'babel-jest',
      {
        configFile: __dirname + '/.babelrc',
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-native-google-signin|expo|@expo|expo-secure-store|@unimodules|unimodules|react-clone-referenced-element|@react-native-community|react-navigation|@react-navigation|native-base|react-native-svg|react-native-screens|react-native-vector-icons)/)',
  ],
  // Everything under src/features/leagues/ (at any depth) was previously
  // blanket-excluded from mobile — those specs are web-oriented and not
  // mobile-safe (e.g. premium/premium-fields.spec.tsx expects DOM testids
  // the mobile icon mocks don't produce). Preserve that exclusion via a
  // negative lookahead so it keeps covering every file (current and
  // future) EXCEPT the one new, purpose-built mobile spec (LS-8852) — an
  // enumerated file list silently drifts out of sync as files are added
  // under leagues/ (subdirectories especially, as this one did on the
  // first pass).
  testPathIgnorePatterns: [
    '/node_modules/',
    '/src/features/leagues/(?!ProposeTradeDialogNativeModal\\.spec\\.tsx$)',
    // Web-only regression test (LS-8873): exercises the custom Popover-based
    // calendar picker (Platform.OS === 'web' branch), which crashes here
    // because Tamagui's Popover.Trigger/Overlay compound components aren't
    // resolvable under the RN mobile jest environment. Belongs to
    // shared-components:web only.
    '/src/components/DateTimePicker\\.navigateMonth\\.spec\\.tsx$',
    // Web-only specs for components that still have a dedicated `.native.tsx`
    // fork (LS-9180): now that this project's moduleFileExtensions actually
    // prefers the native barrel, these generic specs resolve to the native
    // component and assert web-only behavior (DOM `role="img"`/`role="link"`,
    // `StyleSheet`/`Easing` shapes the web mock doesn't provide). Each has a
    // purpose-built `.native.spec.tsx` sibling that already covers the
    // native component correctly. EliteDraftBoardScreen was a third entry
    // here until LS-9207 unified it into a single file/spec, so it no longer
    // needs (or has) this exclusion.
    '/src/features/elite-draft/PickSplashStatGraphic\\.spec\\.tsx$',
    '/src/features/elite-draft/SpectatorScreen\\.spec\\.tsx$',
    // Same LS-9180 problem, introduced later by #6862 (LS-9206) without the
    // exclusion: these generic specs assert web DOM roles/attributes
    // (`getByRole`) but resolve to the `.native.tsx` fork under this
    // project's moduleFileExtensions, which renders RN accessibility props
    // (`accessibilityLabel`/`accessibilityRole`) instead. Unlike the LS-9180
    // set, these don't yet have a purpose-built `.native.spec.tsx` sibling —
    // tracked as a real coverage gap in LS-9262, filed while unblocking
    // LS-5407's CI Gate rather than silently leaving `shared-components:test`
    // red for every PR that touches this library.
    '/src/features/elite-draft/DraftPickAnnouncement\\.spec\\.tsx$',
    '/src/features/elite-draft/DraftClockRing\\.spec\\.tsx$',
    '/src/features/elite-draft/DraftSquadStrip\\.spec\\.tsx$',
    '/src/features/elite-draft/DraftMiniBoard\\.spec\\.tsx$',
    // useVoiceCommands.native.ts is a static stub (no RN speech-recognition
    // equivalent) with no branches to test; its generic spec drives the web
    // `window.SpeechRecognition` implementation exclusively (LS-9180).
    '/src/hooks/useVoiceCommands\\.spec\\.ts$',
  ],
  testRegex: '/src/.*\\.spec\\.(ts|tsx|js)$',
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/index.ts'],
};

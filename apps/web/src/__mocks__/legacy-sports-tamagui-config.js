// Mock for @legacy-sports/tamagui-config — the real module pulls in
// @tamagui/config (font-silkscreen etc.), which throws under Jest
// ("createGenericFont is not a function") since apps/web's `^@tamagui/(.*)$`
// mapper only stubs component primitives, not the config-building API.
// Mirrors lib/shared-components/jest-setup-{web,mobile}.js (LS-9035).
module.exports = {
  config: {},
  playboardTokens: {
    bgTop: '#1B2A24',
    bgBottom: '#101A16',
    boardBackgroundImage: '',
    boardShadow: '',
    boardShadowHover: '',
    border: '#2C3D34',
    liveMint: '#8FD6A2',
    textSecondary: '#93A89A',
    textMeta: '#7D9284',
    textPrimary: '#EEF4EA',
    dashedInsetBorder: 'rgba(238,244,234,.16)',
    buttonBorder: '#5FA36C',
    buttonHover: '#377C46',
    buttonText: '#F2F7F1',
    bug: {
      chromeLight: '#DCE3D8',
      chromeDark: '#4C5849',
      badgeTop: '#2F6B3C',
      badgeBottom: '#143021',
      badgeEyeText: '#F2F6FA',
      innerBorder: '#10192A',
      plateTop: '#3C8450',
      plateBottom: '#1B4527',
      bottomLight: '#A3AE9D',
      bottomDark: '#5F6B5B',
      textOnChrome: '#F4F8FC',
      textOnBottomBar: '#111A12',
      leadGold: '#F3DD8B',
      possessionGold: '#F5D96A',
    },
  },
};

import React from 'react';
import { Text } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import type { IconProps } from './LazyIcon';
import { safeStyle } from '../../utils/styles';

// BrandIcon uses DOM <svg> and is NOT React Native compatible.
// Mobile uses Unicode symbol fallbacks until a react-native-svg
// implementation is added (see BrandIcon.native.tsx TODO).

/**
 * Unicode symbol map for native icon rendering.
 * Keyed by BrandIconName so alias resolution feeds into this.
 */
const ICON_SYMBOLS: Record<string, string> = {
  baseball: '\u26BE',
  football: '\uD83C\uDFC8',
  stats: '\uD83D\uDCC8',
  draft: '\uD83D\uDCCB',
  live: '\u25CF',
  trophy: '\uD83C\uDFC6',
  matchup: '\u2694',
  roster: '\uD83D\uDCCB',
  trade: '\u21C4',
  standings: '\uD83D\uDCCA',
  league: '\uD83C\uDFC5',
  commissioner: '\u2696',
  announcement: '\uD83D\uDCE2',
  secure: '\uD83D\uDD12',
  scoreboard: '\uD83D\uDCCA',
  award: '\u2B50',
  home: '\uD83C\uDFE0',
  search: '\uD83D\uDD0D',
  menu: '\u2630',
  back: '\u2190',
  forward: '\u2192',
  'chevron-up': '\u2191',
  'chevron-down': '\u2193',
  'chevron-left': '\u2039',
  'chevron-right': '\u203A',
  close: '\u2715',
  more: '\u22EF',
  add: '+',
  edit: '\u270E',
  delete: '\uD83D\uDDD1',
  save: '\uD83D\uDCBE',
  copy: '\uD83D\uDCCB',
  share: '\uD83D\uDD17',
  send: '\u27A4',
  refresh: '\u21BB',
  undo: '\u21A9',
  filter: '\u2699',
  sort: '\u2195',
  shuffle: '\uD83D\uDD00',
  grip: '\u2630',
  link: '\uD83D\uDD17',
  check: '\u2713',
  'check-circle': '\u2714',
  alert: '\u26A0',
  info: '\u2139',
  help: '?',
  warning: '\u26A0',
  clock: '\uD83D\uDD53',
  timer: '\u23F1',
  hourglass: '\u231B',
  zap: '\u26A1',
  user: '\uD83D\uDC64',
  users: '\uD83D\uDC65',
  'user-add': '\uD83D\uDC64',
  'user-remove': '\uD83D\uDC64',
  bell: '\uD83D\uDD14',
  'bell-active': '\uD83D\uDD14',
  message: '\uD83D\uDCAC',
  calendar: '\uD83D\uDCC5',
  book: '\uD83D\uDCD6',
  file: '\uD83D\uDCC4',
  image: '\uD83D\uDDBC',
  tag: '\uD83C\uDFF7',
  chart: '\uD83D\uDCC8',
  target: '\uD83C\uDFAF',
  'bar-chart': '\uD83D\uDCCA',
  lock: '\uD83D\uDD12',
  unlock: '\uD83D\uDD13',
  settings: '\u2699',
  eye: '\uD83D\uDC41',
  'eye-off': '\uD83D\uDE48',
  globe: '\uD83C\uDF10',
  'qr-code': '\u25A3',
  google: 'G',
};

/**
 * Icon name mapping: maps legacy / MaterialIcons names to BrandIconName
 * so existing mobile consumers continue to work.
 */
const ICON_ALIAS: Record<string, string> = {
  'filter-list': 'filter',
  'arrow-back': 'back',
  'arrow-forward': 'forward',
  'keyboard-arrow-up': 'chevron-up',
  'keyboard-arrow-down': 'chevron-down',
  plus: 'add',
  minus: 'user-remove',
  remove: 'close',
  star: 'award',
  favorite: 'award',
  person: 'user',
};

function resolveSymbol(name: string): string {
  if (name in ICON_SYMBOLS) return ICON_SYMBOLS[name];
  if (Object.prototype.hasOwnProperty.call(ICON_ALIAS, name)) {
    const alias = ICON_ALIAS[name];
    if (alias in ICON_SYMBOLS) return ICON_SYMBOLS[alias];
  }
  const lower = name.toLowerCase();
  if (lower in ICON_SYMBOLS) return ICON_SYMBOLS[lower];
  return '?';
}

// Native icon implementation — renders Unicode symbols as a
// React-Native-safe fallback until BrandIcon.native.tsx is implemented.
const NativeIcons: React.FC<IconProps> = ({
  name,
  size = 24,
  color = 'black',
  style,
}) => {
  const symbol = resolveSymbol(name);

  return (
    <Text
      style={
        safeStyle([
          {
            fontSize: size * 0.6,
            color,
            lineHeight: size,
            textAlign: 'center' as const,
            width: size,
            height: size,
          },
          style,
        ]) as StyleProp<TextStyle>
      }
      accessibilityLabel={name}
    >
      {symbol}
    </Text>
  );
};

export default NativeIcons;

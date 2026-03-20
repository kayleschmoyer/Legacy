import React from 'react';
import type { IconProps } from './LazyIcon';
import {
  ALL_BRAND_ICON_NAMES,
  BrandIcon,
} from '../../components/icons/BrandIcon';
import type { BrandIconName } from '../../components/icons/BrandIcon';

/**
 * Icon name mapping: maps legacy / MaterialIcons / Lucide names to
 * BrandIconName so existing consumers continue to work.
 */
const ICON_ALIAS: Record<string, BrandIconName> = {
  // MaterialIcons / legacy names
  'filter-list': 'filter',
  'arrow-left': 'back',
  'arrow-back': 'back',
  'arrow-right': 'forward',
  'arrow-forward': 'forward',
  'arrow-up': 'chevron-up',
  'arrow-down': 'chevron-down',
  'keyboard-arrow-up': 'chevron-up',
  'keyboard-arrow-down': 'chevron-down',
  plus: 'add',
  minus: 'user-remove',
  remove: 'close',
  star: 'award',
  heart: 'award',
  favorite: 'award',
  person: 'user',
  // Lucide equivalents
  Activity: 'live',
  AlertCircle: 'alert',
  AlertTriangle: 'warning',
  ArrowLeftRight: 'trade',
  Award: 'award',
  Badge: 'award',
  BarChart2: 'bar-chart',
  BarChart3: 'bar-chart',
  Bell: 'bell',
  BookOpen: 'book',
  Calendar: 'calendar',
  Check: 'check',
  CheckCircle: 'check-circle',
  CheckCircle2: 'check-circle',
  ChevronDown: 'chevron-down',
  ChevronLeft: 'chevron-left',
  ChevronRight: 'chevron-right',
  ChevronUp: 'chevron-up',
  Circle: 'target',
  Clock: 'clock',
  Copy: 'copy',
  Edit3: 'edit',
  Eye: 'eye',
  FileText: 'file',
  Filter: 'filter',
  Gamepad2: 'matchup',
  Gavel: 'commissioner',
  Globe: 'globe',
  GripVertical: 'grip',
  HelpCircle: 'help',
  Hourglass: 'hourglass',
  Image: 'image',
  Info: 'info',
  LayoutGrid: 'scoreboard',
  Link2: 'link',
  List: 'roster',
  Lock: 'lock',
  Menu: 'menu',
  Megaphone: 'announcement',
  MessageSquare: 'message',
  Plus: 'add',
  QrCode: 'qr-code',
  RefreshCw: 'refresh',
  RotateCcw: 'undo',
  Save: 'save',
  Search: 'search',
  Send: 'send',
  Settings: 'settings',
  Share2: 'share',
  Shuffle: 'shuffle',
  Star: 'award',
  Swords: 'matchup',
  Tag: 'tag',
  Target: 'target',
  Timer: 'timer',
  Trash2: 'delete',
  Trophy: 'trophy',
  TrendingUp: 'stats',
  Unlock: 'unlock',
  Users: 'users',
  UserPlus: 'user-add',
  UserMinus: 'user-remove',
  X: 'close',
  Zap: 'zap',
};

const BRAND_ICON_NAMES_SET = new Set<string>(ALL_BRAND_ICON_NAMES);

/** Resolve an icon name to a BrandIconName. */
function resolveIconName(name: string): BrandIconName | null {
  if (BRAND_ICON_NAMES_SET.has(name)) return name as BrandIconName;
  if (Object.prototype.hasOwnProperty.call(ICON_ALIAS, name))
    return ICON_ALIAS[name];
  const lower = name.toLowerCase();
  if (BRAND_ICON_NAMES_SET.has(lower)) return lower as BrandIconName;
  return null;
}

// Web icon implementation — delegates to Heritage Line BrandIcon SVGs
const WebIcons: React.FC<IconProps> = ({
  name,
  size = 24,
  color = 'currentColor',
  style,
}) => {
  const resolved = resolveIconName(name);

  if (!resolved) {
    // Fallback for unmapped icons — render a visible placeholder
    return (
      <span
        style={{
          fontSize: size * 0.6,
          color,
          lineHeight: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          opacity: 0.5,
          ...style,
        }}
        role="img"
        aria-label={name}
      >
        ?
      </span>
    );
  }

  return (
    <BrandIcon
      name={resolved}
      size={size}
      color={color === 'currentColor' ? undefined : color}
      decorative
      style={style}
    />
  );
};

export default WebIcons;

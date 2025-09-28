import React from 'react';
import type { IconProps } from './LazyIcon';

// Web icon implementation using CSS/Unicode
const WebIcons: React.FC<IconProps> = ({
  name,
  size = 24,
  color = 'currentColor',
  style,
}) => {
  // Map of icon names to Unicode symbols or CSS classes
  const iconMap: Record<string, string> = {
    'filter-list': '⚙️',
    search: '🔍',
    home: '🏠',
    user: '👤',
    settings: '⚙️',
    close: '✕',
    'arrow-left': '←',
    'arrow-right': '→',
    'arrow-up': '↑',
    'arrow-down': '↓',
    check: '✓',
    plus: '+',
    minus: '-',
    edit: '✏️',
    delete: '🗑️',
    star: '⭐',
    heart: '❤️',
    // Add more icons as needed
  };

  const iconSymbol = iconMap[name] || '❓';

  return (
    <span
      style={{
        fontSize: size,
        color,
        lineHeight: 1,
        display: 'inline-block',
        ...style,
      }}
      role="img"
      aria-label={name}
    >
      {iconSymbol}
    </span>
  );
};

export default WebIcons;

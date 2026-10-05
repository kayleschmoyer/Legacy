import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bug } from '@tamagui/lucide-icons/icons/Bug';
import { HelpCircle } from '@tamagui/lucide-icons/icons/HelpCircle';
import { MessageSquare } from '@tamagui/lucide-icons/icons/MessageSquare';
import { FONT_DISPLAY, NAV_DROPDOWN_ANIMATION } from './NavDropdownShared';
import {
  BORDER_INTERACTIVE,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  OUTLINE_SUBTLE,
  SHADOW_DARK,
  SURFACE_PANEL,
  TEXT_FG2,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_TERTIARY,
  WHITE,
  withAlpha,
} from '../../constants/colors';
import { NAV_DROPDOWN_Z_INDEX } from '../../constants/dimensions';

interface Props {
  /** Receives this menu's trigger button so the caller can return focus to
   *  it when the bug-report dialog closes (LS-10451). */
  onBugReport?: (trigger: HTMLButtonElement | null) => void;
}

const ICON_BTN_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${OUTLINE_SUBTLE}`,
  color: TEXT_FG2,
  width: 38,
  height: 38,
  borderRadius: 9999,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 150ms cubic-bezier(0.2, 0.8, 0.2, 1)',
  position: 'relative' as const,
  flexShrink: 0,
};

const MENU_ITEM_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  borderRadius: 10,
  cursor: 'pointer',
  fontFamily: "'Literata', serif",
  fontSize: 14,
  color: TEXT_PRIMARY,
  background: 'transparent',
  border: 0,
  width: '100%',
  textAlign: 'left' as const,
  transition: 'background 120ms',
};

export const HelpMenuButton: React.FC<Props> = ({ onBugReport }) => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  const btnStyle: React.CSSProperties = {
    ...ICON_BTN_STYLE,
    ...(isOpen
      ? {
          borderColor: withAlpha(BRAND_GOLD, 0.5),
          background: withAlpha(BRAND_GOLD, 0.1),
          color: BRAND_GOLD_LIGHT,
        }
      : {}),
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        onClick={() => setIsOpen((o) => !o)}
        aria-label="Help & support"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        style={btnStyle}
        onMouseEnter={(e) => {
          if (!isOpen) {
            const el = e.currentTarget as HTMLElement;
            el.style.borderColor = BORDER_INTERACTIVE;
            el.style.background = withAlpha(WHITE, 0.04);
            el.style.color = TEXT_PRIMARY;
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            const el = e.currentTarget as HTMLElement;
            el.style.borderColor = OUTLINE_SUBTLE;
            el.style.background = 'transparent';
            el.style.color = TEXT_FG2;
          }
        }}
      >
        <HelpCircle size={17} />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="Help & support"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 8px)',
            width: 280,
            background: SURFACE_PANEL,
            border: `1px solid ${withAlpha(BRAND_GOLD, 0.2)}`,
            borderRadius: 16,
            boxShadow: `0 12px 32px ${withAlpha(SHADOW_DARK, 0.65)}`,
            padding: 6,
            zIndex: NAV_DROPDOWN_Z_INDEX,
            animation: NAV_DROPDOWN_ANIMATION,
            overflow: 'hidden',
          }}
        >
          {/* Group header */}
          <div
            style={{
              padding: '10px 12px 6px',
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: TEXT_TERTIARY,
            }}
          >
            Help &amp; Support
          </div>

          {[
            {
              icon: <HelpCircle size={16} color={TEXT_MUTED} />,
              label: 'League Rules & FAQ',
              action: () => {
                navigate('/help');
                setIsOpen(false);
              },
            },
            {
              icon: <Bug size={16} color={TEXT_MUTED} />,
              label: 'Report a bug',
              action: () => {
                onBugReport?.(triggerRef.current);
                setIsOpen(false);
              },
            },
            {
              icon: <MessageSquare size={16} color={TEXT_MUTED} />,
              label: 'Contact support',
              action: () => {
                navigate('/help');
                setIsOpen(false);
              },
            },
          ].map((item) => (
            <button
              key={item.label}
              role="menuitem"
              onClick={item.action}
              style={MENU_ITEM_STYLE}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = withAlpha(
                  BRAND_NAVY,
                  0.3,
                ))
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background =
                  'transparent')
              }
            >
              {item.icon}
              {item.label}
            </button>
          ))}

          {/* Footer */}
          <div
            style={{
              padding: '10px 12px',
              fontSize: 11,
              color: TEXT_TERTIARY,
              borderTop: `1px solid ${OUTLINE_SUBTLE}`,
              marginTop: 4,
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: "'Literata', serif",
            }}
          >
            <span>Season 2026</span>
          </div>
        </div>
      )}
    </div>
  );
};

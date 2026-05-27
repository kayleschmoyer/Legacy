import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bug, HelpCircle, MessageSquare } from '@tamagui/lucide-icons';
import { FONT_DISPLAY, NAV_DROPDOWN_ANIMATION } from './NavDropdownShared';
import {
  BRAND_GOLD_LIGHT,
  OUTLINE_SUBTLE,
  SURFACE_PANEL,
} from '../../constants/colors';
import { NAV_DROPDOWN_Z_INDEX } from '../../constants/dimensions';

interface Props {
  onBugReport?: () => void;
}

const ICON_BTN_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${OUTLINE_SUBTLE}`,
  color: '#DEE6FF',
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
  color: '#F8FAFC',
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
          borderColor: 'rgba(197,165,90,0.5)',
          background: 'rgba(197,165,90,0.1)',
          color: BRAND_GOLD_LIGHT,
        }
      : {}),
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen((o) => !o)}
        aria-label="Help & support"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        style={btnStyle}
        onMouseEnter={(e) => {
          if (!isOpen) {
            const el = e.currentTarget as HTMLElement;
            el.style.borderColor = '#4D5D80';
            el.style.background = 'rgba(255,255,255,0.04)';
            el.style.color = '#F8FAFC';
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            const el = e.currentTarget as HTMLElement;
            el.style.borderColor = OUTLINE_SUBTLE;
            el.style.background = 'transparent';
            el.style.color = '#DEE6FF';
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
            border: `1px solid rgba(197,165,90,0.2)`,
            borderRadius: 16,
            boxShadow: '0 12px 32px rgba(8,12,20,0.65)',
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
              color: '#6C80BA',
            }}
          >
            Help &amp; Support
          </div>

          {[
            {
              icon: <HelpCircle size={16} color="#9CAAC5" />,
              label: 'League Rules & FAQ',
              action: () => {
                navigate('/help');
                setIsOpen(false);
              },
            },
            {
              icon: <Bug size={16} color="#9CAAC5" />,
              label: 'Report a bug',
              action: () => {
                onBugReport?.();
                setIsOpen(false);
              },
            },
            {
              icon: <MessageSquare size={16} color="#9CAAC5" />,
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
                ((e.currentTarget as HTMLElement).style.background =
                  'rgba(27,58,92,0.3)')
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
              color: '#6C80BA',
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

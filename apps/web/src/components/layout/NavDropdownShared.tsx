/**
 * Shared styled primitives for navigation dropdowns.
 *
 * Editorial aesthetic: Big Shoulders Display headlines, Literata italic
 * descriptions, heritage gold active states, entrance animation.
 */
import { styled } from 'tamagui';
import { Button, YStack } from '@legacy-sports/shared-components/ui';
import { NAV_BUTTON_MIN_WIDTH } from '../../constants/dimensions';

// Inject entrance animation keyframes once into the document
if (typeof document !== 'undefined') {
  const STYLE_ID = 'nav-dropdown-keyframes';
  if (!document.getElementById(STYLE_ID)) {
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = `
      @keyframes navDropdownEnter {
        from { opacity: 0; transform: translateY(-6px) scale(0.98); }
        to   { opacity: 1; transform: translateY(0)    scale(1);    }
      }
      @media (prefers-reduced-motion: reduce) {
        @keyframes navDropdownEnter {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      }
    `;
    document.head.appendChild(el);
  }
}

/** Apply via `style={{ animation: NAV_DROPDOWN_ANIMATION }}` on DropdownContent. */
export const NAV_DROPDOWN_ANIMATION =
  'navDropdownEnter 180ms cubic-bezier(0.16, 1, 0.3, 1) both';

/** Big Shoulders Display — display/headline font for item titles. */
export const FONT_DISPLAY = "'Big Shoulders Display', sans-serif";

/** Literata — editorial body font for item descriptions. */
export const FONT_BODY = "'Literata', serif";

/** Heritage gold border tint — subtle warm suggestion, not a stripe. */
export const DROPDOWN_BORDER = 'rgba(197, 165, 90, 0.20)';

/** Trigger button shared across Players / Sports / My Leagues dropdowns. */
export const DropdownButton = styled(Button, {
  size: '$3',
  gap: '$2',
  backgroundColor: 'transparent',
  borderWidth: 0,
  borderRadius: '$2',
  paddingHorizontal: '$4',
  minWidth: NAV_BUTTON_MIN_WIDTH,
  hoverStyle: {
    backgroundColor: '$color3',
  },
  pressStyle: {
    backgroundColor: '$color4',
    scale: 0.97,
  },
  variants: {
    highlight: {
      true: {
        backgroundColor: '$color3',
        fontWeight: '600',
      },
    },
  } as const,
});

/**
 * Dropdown panel — elevated surface with refined shadow.
 * Always pass `style={{ borderColor: DROPDOWN_BORDER, animation: NAV_DROPDOWN_ANIMATION }}`
 * at each usage for the gold border tint and entrance animation.
 */
export const DropdownContent = styled(YStack, {
  backgroundColor: '$color2',
  borderRadius: 10,
  borderWidth: 1,
  borderColor: '$borderColor',
  padding: '$3',
  gap: '$1',
  minWidth: 260,
  shadowColor: '$shadowColor',
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.5,
  shadowRadius: 36,
  elevation: 14,
});

/** Base menu item for nav dropdown rows. */
export const MenuItem = styled(Button, {
  justifyContent: 'flex-start',
  backgroundColor: 'transparent',
  borderWidth: 0,
  paddingHorizontal: '$3',
  paddingVertical: 10,
  borderRadius: '$3',
  width: '100%',
  height: 'auto',
  gap: '$3',
  hoverStyle: {
    backgroundColor: '$color3',
  },
  pressStyle: {
    backgroundColor: '$color4',
  },
  variants: {
    active: {
      true: {
        backgroundColor: '$accentMuted',
      },
    },
  } as const,
});

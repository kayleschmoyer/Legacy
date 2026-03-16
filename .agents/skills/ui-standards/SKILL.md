---
name: ui-standards
description: Guidelines for building modern, responsive UI components using Tamagui, including glassmorphism, gradients, and interactive states.
---

# UI Standards & Styling Guide

Use this guide when creating or updating UI components in the web and mobile apps. We use **Tamagui** for styling and layout.

## Tech Stack

- **Framework**: Tamagui (Universal React styling)
- **Icons**: `@tamagui/lucide-icons`
- **Theme**: Custom theme with variables like `$background`, `$blue10`, `$surfaceCard`.

## Core Stylistic Patterns

### 1. Glassmorphism Headers

Use sticky headers with backdrop blur to create depth and maintain context while scrolling.

**Key Properties:**

- `position: 'sticky'`
- `top: NAV_HEIGHT_PX` (import from `../../constants/dimensions` — sticks immediately below the nav bar, not over it)
- `zIndex: CONTENT_STICKY_Z_INDEX` (import from `../../constants/dimensions` — must be lower than the nav's `NAV_Z_INDEX`)
- `backgroundColor: '$background075'` (75% opacity — defined in both `brandDark` and `brandLight` themes)
- `backdropFilter: 'blur(12px)'`

**Example:**

```tsx
import {
  NAV_HEIGHT_PX,
  CONTENT_STICKY_Z_INDEX,
} from '../../constants/dimensions';

const GlassHeader = styled(XStack, {
  position: 'sticky' as const,
  // Offset by nav height so this sticks directly below the nav, not over it.
  // zIndex must stay below NAV_Z_INDEX so the nav always wins the stack.
  top: NAV_HEIGHT_PX,
  zIndex: CONTENT_STICKY_Z_INDEX,
  backgroundColor: '$background075',
  backdropFilter: 'blur(12px)',
  paddingVertical: '$4',
  borderBottomWidth: 1,
  borderBottomColor: '$borderColor',
  width: '100%',
});
```

### 2. Interactive Cards

Cards should provide visual feedback on hover and press.

**Key Properties:**

- `animation: 'quick'` (for smooth transitions)
- `hoverStyle`: Change border color or background.
- `pressStyle`: Slight scale down (`scale: 0.98`) for tactile feel.

**Example:**

```tsx
const InteractiveCard = styled(Card, {
  bordered: true,
  padding: '$3',
  animation: 'quick',
  pressStyle: { scale: 0.98 },
  hoverStyle: {
    borderColor: '$blue8',
    backgroundColor: '$backgroundHover',
  },
});
```

### 3. Gradients & Active States

Use theme tokens to create "glowing" or "active" effects without hardcoding hex values.

- **Active Buttons**: `theme="active"`, `backgroundColor="$blue9"`
- **Tags/Badges**: `backgroundColor="$blue3"`, `color="$blue10"`

## Layout Best Practices

- **Stacks**: Use `XStack` (row) and `YStack` (column) for almost all layout.
- **Spacing**: Use standard tokens (`$2`, `$4`, `$6`) for `gap`, `padding`, and `margin`.
- **Responsiveness**: Use the `$sm`, `$md` keys in styles for mobile-first breakpoints.

## Component Checklist

- [ ] **Accessibility**: Ensure interactive elements have accessible labels or roles.
- [ ] **Responsiveness**: Test layout on small screens (using `$sm` variants).
- [ ] **Type Safety**: Strictly define Props interfaces; avoid `any`.
- [ ] **Performance**: Use `fetchPolicy: 'cache-and-network'` for lists that update frequently.

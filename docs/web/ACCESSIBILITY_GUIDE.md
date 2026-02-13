# Accessibility (A11y) Best Practices

**Last updated**: LS-92 (Feb 2026)

## Overview

The Legacy Sports web app follows WCAG 2.1 Level AA guidelines for accessibility.

## Core Patterns

### 1. Semantic HTML

- Always use proper HTML elements (`<button>`, `<nav>`, `<main>`, etc.)
- Use heading hierarchy correctly (H1 → H2 → H3, no skipping levels)
- Provide landmarks with `role` attributes when needed

### 2. ARIA Attributes

- **Images & Emojis**: Wrap in `<span role="img" aria-label="description">`
- **Loading States**: Use `aria-busy="true"` and `aria-live="polite"`
- **Error States**: Use `role="alert"` or `aria-live="assertive"`
- **Interactive Elements**: Buttons should have descriptive `aria-label` when text is unclear

### 3. Screen Reader Announcements

Use the global announcer for non-blocking notifications:

```typescript
import { announcePolite } from '@/utils/a11y';

// Success messages
announcePolite('League created successfully');

// Status updates
announcePolite('Player added to roster');
```

### 4. Keyboard Navigation

- All interactive elements must be keyboard-accessible
- Use proper `tabIndex` (0 for focusable, -1 for programmatic focus)
- Implement arrow key navigation for radiogroups/menus
- Test with Tab, Enter, Space, Arrow keys

### 5. Focus Management

- Visible focus indicators (handled by global CSS)
- Trap focus in modals/dialogs
- Return focus after modal closes
- Skip links for main content (`<a href="#main-content">`)

## Component Checklist

When creating/updating components:

- [ ] Proper semantic HTML elements
- [ ] All images have `alt` text
- [ ] All emojis wrapped with `role="img" aria-label`
- [ ] Forms have associated `<label>` elements
- [ ] Buttons have descriptive text or `aria-label`
- [ ] Loading states use `aria-busy`
- [ ] Errors use `role="alert"` or screen reader announcements
- [ ] Color contrast ratio ≥ 4.5:1 for text
- [ ] Interactive elements keyboard accessible
- [ ] Focus visible on all focusable elements

## Testing

### Automated

```bash
# Run a11y linting
pnpm exec nx lint web

# Run a11y-specific tests
pnpm exec nx test web --testNamePattern=a11y
```

### Manual

1. **Keyboard**: Navigate entire page using only keyboard
2. **Screen Reader**: Test with NVDA (Windows) or VoiceOver (Mac)
3. **Color Blind**: Use browser DevTools to simulate color blindness
4. **Zoom**: Test at 200% zoom level

## Common Patterns

### Loading States

```tsx
<div role="status" aria-busy="true" aria-live="polite">
  <Paragraph>Loading data...</Paragraph>
</div>
```

### Error Messages

```tsx
<YStack role="alert">
  <Paragraph color="$red10">Error loading data</Paragraph>
</YStack>
```

### Icon Buttons

```tsx
<button aria-label="Close dialog">
  <XIcon />
</button>
```

### Emojis

```tsx
<span role="img" aria-label="baseball">
  ⚾
</span>
```

## Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- docs/web/THEME_AND_A11Y_NOTES.md - Project-specific patterns
- apps/web/src/components/**tests**/EliteDraftBoard.a11y.spec.tsx - Example tests

## Enforcement

- ESLint rules: `jsx-a11y` plugin enabled
- Pre-commit hooks validate common issues
- PR reviews check for a11y compliance

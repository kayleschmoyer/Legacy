# IconButton Component

A square icon button aligned with the Legacy Sports design system. Five brand variants, three sizes, and optional inline label. Built on Tamagui for cross-platform use.

## Breaking Changes (LS-4716 — design system alignment)

The following API surface was changed to match the design system spec:

| Removed                      | Replacement                                                              |
| ---------------------------- | ------------------------------------------------------------------------ |
| `variant: 'secondary'`       | `variant: 'ghost'` (low-emphasis)                                        |
| `variant: 'accent'`          | `variant: 'seam'` (alert/destructive) or `variant: 'gold'` (achievement) |
| `colorScheme` prop           | Removed — colours are now determined by `variant`                        |
| `showGradient` prop          | Removed — gradient overlay system removed                                |
| `IconButtonColorScheme` type | Removed                                                                  |

**Impact**: `IconButton` had no consumers outside its own Storybook stories at the time of this change. The stories have been updated to use the new API.

## Basic Usage

```tsx
import { IconButton } from '@legacy-sports/shared-components';

// Icon-only (sm=36, md=44, lg=56 px)
<IconButton icon="home" variant="primary" size="md" onPress={() => {}} />

// With inline label
<IconButton icon="plus" label="Add Player" variant="default" onPress={() => {}} />
```

## Props

| Prop                 | Type                                                    | Default     | Description           |
| -------------------- | ------------------------------------------------------- | ----------- | --------------------- |
| `icon`               | `string`                                                | —           | Icon name (required)  |
| `label`              | `string`                                                | —           | Optional inline label |
| `size`               | `'sm' \| 'md' \| 'lg'`                                  | `'md'`      | Button size           |
| `variant`            | `'default' \| 'primary' \| 'seam' \| 'gold' \| 'ghost'` | `'default'` | Visual style          |
| `onPress`            | `() => void`                                            | —           | Press handler         |
| `disabled`           | `boolean`                                               | `false`     | Disable the button    |
| `accessibilityLabel` | `string`                                                | —           | Custom a11y label     |
| `testID`             | `string`                                                | —           | Test identifier       |

## Sizes

| Size | Dimensions | Icon  | Use case            |
| ---- | ---------- | ----- | ------------------- |
| `sm` | 36 × 36 px | 14 px | Compact toolbars    |
| `md` | 44 × 44 px | 18 px | Standard navigation |
| `lg` | 56 × 56 px | 22 px | Hero actions        |

## Variants

| Variant   | Background               | Foreground | Use case                             |
| --------- | ------------------------ | ---------- | ------------------------------------ |
| `default` | `$color3` (surface-card) | `$color11` | Secondary / low-priority actions     |
| `primary` | `$brandNavy`             | `#fff`     | Primary interactive actions          |
| `seam`    | `$brandSeamRed`          | `#fff`     | Destructive / alert actions          |
| `gold`    | `$brandGold`             | `#111`     | Achievement / premium states         |
| `ghost`   | transparent              | `$color11` | Minimal-chrome, low-emphasis actions |

## Label Behaviour

When `label` is provided the button expands to auto-width:

- `padding: 0 14 px`, `gap: 8 px`
- `border-radius` changes from 14 px to 12 px
- Label text: Big Shoulders Display 700, 13 px, letter-spacing 0.04 em (matches `$heading` token)

```tsx
<IconButton icon="plus" label="Add Player" variant="default" onPress={() => {}} />
<IconButton icon="star"  label="Export"     variant="primary" onPress={() => {}} />
```

## Accessibility

- `accessibilityLabel` defaults to `label` prop, then `"<icon> button"`
- Touch target meets 44 px minimum for `md` and `lg`; `sm` targets (36 px) should only appear in dense toolbars

## Storybook

```bash
pnpm run storybook
```

Navigate to **Components / IconButton**.

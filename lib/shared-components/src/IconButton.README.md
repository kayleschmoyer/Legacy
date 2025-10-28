# IconButton Component

A modern, animated icon button component with hover effects and gradient shadows, inspired by contemporary mobile UI design patterns. Built with Tamagui for cross-platform compatibility.

## Features

- ✨ **Smooth Animations**: Scale and shadow animations on hover and press
- 🎨 **Gradient Effects**: Customizable gradient overlays with multiple color schemes
- 📱 **Cross-Platform**: Works seamlessly on web and React Native
- 🎯 **Multiple Variants**: Default, primary, secondary, and accent styles
- 📏 **Flexible Sizing**: Small, medium, and large size options
- ♿ **Accessibility**: Built-in accessibility support with labels
- 🎭 **Tamagui Integration**: Uses your project's design tokens and themes

## Basic Usage

```tsx
import { IconButton } from '@legacy-sports/shared-components';

// Simple icon button
<IconButton
  icon="home"
  label="Home"
  onPress={() => console.log('Home pressed')}
/>;
```

## Props

| Prop                 | Type                                                | Default     | Description                    |
| -------------------- | --------------------------------------------------- | ----------- | ------------------------------ |
| `icon`               | `string`                                            | -           | Icon name (required)           |
| `label`              | `string`                                            | -           | Optional text label below icon |
| `size`               | `'sm' \| 'md' \| 'lg'`                              | `'md'`      | Button size                    |
| `variant`            | `'default' \| 'primary' \| 'secondary' \| 'accent'` | `'default'` | Visual style variant           |
| `colorScheme`        | `'blue' \| 'purple' \| 'green' \| 'red' \| 'gold'`  | `'blue'`    | Color scheme for gradients     |
| `showGradient`       | `boolean`                                           | `true`      | Enable gradient shadow effects |
| `onPress`            | `() => void`                                        | -           | Press handler function         |
| `disabled`           | `boolean`                                           | `false`     | Disable the button             |
| `accessibilityLabel` | `string`                                            | -           | Custom accessibility label     |
| `testID`             | `string`                                            | -           | Test identifier                |

## Examples

### Navigation Bar

```tsx
<XStack gap="$4" alignItems="center">
  <IconButton
    icon="home"
    label="Home"
    variant="primary"
    colorScheme="blue"
    onPress={() => navigate('home')}
  />
  <IconButton
    icon="search"
    label="Search"
    variant="default"
    colorScheme="blue"
    onPress={() => navigate('search')}
  />
  <IconButton
    icon="user"
    label="Profile"
    variant="default"
    colorScheme="blue"
    onPress={() => navigate('profile')}
  />
</XStack>
```

### Action Grid

```tsx
<YStack gap="$4">
  <XStack gap="$4">
    <IconButton
      icon="plus"
      label="Add"
      variant="primary"
      colorScheme="green"
      size="lg"
      onPress={() => addPlayer()}
    />
    <IconButton
      icon="edit"
      label="Edit"
      variant="secondary"
      colorScheme="blue"
      size="lg"
      onPress={() => editPlayer()}
    />
  </XStack>
  <XStack gap="$4">
    <IconButton
      icon="star"
      label="Favorite"
      variant="accent"
      colorScheme="gold"
      size="lg"
      onPress={() => toggleFavorite()}
    />
    <IconButton
      icon="delete"
      label="Remove"
      variant="primary"
      colorScheme="red"
      size="lg"
      onPress={() => removePlayer()}
    />
  </XStack>
</YStack>
```

### Different Sizes

```tsx
<XStack gap="$4" alignItems="center">
  <IconButton
    icon="star"
    label="Small"
    size="sm"
    variant="primary"
    onPress={() => {}}
  />
  <IconButton
    icon="star"
    label="Medium"
    size="md"
    variant="primary"
    onPress={() => {}}
  />
  <IconButton
    icon="star"
    label="Large"
    size="lg"
    variant="primary"
    onPress={() => {}}
  />
</XStack>
```

### Color Schemes

```tsx
<XStack gap="$4" alignItems="center">
  <IconButton
    icon="heart"
    label="Like"
    variant="primary"
    colorScheme="red"
    onPress={() => {}}
  />
  <IconButton
    icon="check"
    label="Done"
    variant="accent"
    colorScheme="green"
    onPress={() => {}}
  />
  <IconButton
    icon="settings"
    label="Settings"
    variant="secondary"
    colorScheme="purple"
    onPress={() => {}}
  />
</XStack>
```

### Without Gradient Effects

```tsx
<IconButton
  icon="home"
  label="Simple"
  showGradient={false}
  onPress={() => {}}
/>
```

## Variants

### Default

- Background: `$color3`
- Suitable for secondary actions
- Subtle hover effects

### Primary

- Background: `$blue4`
- For main call-to-action buttons
- Enhanced hover animations

### Secondary

- Background: `$purple4`
- For secondary but important actions
- Purple-themed gradient effects

### Accent

- Background: `$green4`
- For success states and positive actions
- Green-themed gradient effects

## Size Guidelines

| Size | Dimensions | Icon Size | Use Case                    |
| ---- | ---------- | --------- | --------------------------- |
| `sm` | 60×60px    | 20px      | Compact layouts, toolbars   |
| `md` | 80×80px    | 28px      | Standard navigation, forms  |
| `lg` | 100×100px  | 36px      | Hero actions, main features |

## Color Schemes

- **Blue**: Default scheme for navigation and informational actions
- **Purple**: Creative and secondary actions
- **Green**: Success states, confirmations, additions
- **Red**: Destructive actions, deletions, errors
- **Gold**: Premium features, favorites, achievements

## Platform Behavior

### Web

- Hover effects with scale and shadow animations
- CSS transitions for smooth interactions
- Mouse cursor changes on hover

### React Native

- Touch feedback with scale animations
- Native shadow effects on supported platforms
- Haptic feedback integration ready

## Accessibility

The IconButton component includes built-in accessibility features:

- Automatic accessibility labels based on the `label` prop
- Custom accessibility labels via `accessibilityLabel`
- Screen reader support
- Keyboard navigation support (web)
- Touch target size compliance (44px minimum)

## Integration with Legacy Sports Design System

This component integrates seamlessly with your existing Tamagui configuration:

- Uses design tokens from `@legacy-sports/tamagui-config`
- Respects dark/light theme preferences
- Follows the established color palette
- Matches spacing and typography scales

## Storybook

View all component variations and test interactions in Storybook:

```bash
pnpm run storybook
```

Navigate to `Components/IconButton` to see all examples and documentation.

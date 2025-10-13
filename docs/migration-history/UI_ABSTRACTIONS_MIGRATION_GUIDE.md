# UI Abstractions Migration Guide

This document provides step-by-step instructions for migrating from direct Tamagui imports to the new UI Abstractions layer.

## 🎯 Why Migrate?

The UI Abstractions layer provides:

- **Stable Types**: No more complex Tamagui type errors
- **Consistent API**: Same props across all components
- **Future-Proofing**: Easy to update underlying UI library
- **Better DX**: Improved autocomplete and error messages

## 📋 Migration Steps

### Step 1: Update Imports

**Before (Direct Tamagui):**
```typescript
import { 
  Button, 
  Text, 
  View, 
  XStack, 
  YStack, 
  TamaguiProvider 
} from 'tamagui';
```

**After (UI Abstractions):**
```typescript
import { 
  Button, 
  Text, 
  View, 
  XStack, 
  YStack, 
  UIThemeProvider 
} from '@legacy-sports/ui-abstractions';
```

### Step 2: Update Provider

**Before:**
```typescript
import { TamaguiProvider } from 'tamagui';
import { tamaguiConfig } from '@legacy-sports/tamagui-config';

<TamaguiProvider config={tamaguiConfig}>
  <App />
</TamaguiProvider>
```

**After:**
```typescript
import { UIThemeProvider } from '@legacy-sports/ui-abstractions';
import { tamaguiConfig } from '@legacy-sports/tamagui-config';

<UIThemeProvider tamaguiConfig={tamaguiConfig} theme="auto">
  <App />
</UIThemeProvider>
```

### Step 3: Update Component Props

Most props remain the same, but some are standardized:

**Button variants:**
```typescript
// Before (Tamagui-specific)
<Button variant="outlined">Click Me</Button>

// After (Abstracted)
<Button variant="primary">Click Me</Button>
<Button variant="outline">Click Me</Button>
```

**Text variants:**
```typescript
// Before
<Text fontSize="$sm" color="$gray11">Caption text</Text>

// After (with semantic variants)
<Text variant="caption">Caption text</Text>
```

## 🔄 Component Mapping

### Text Components
| Tamagui | UI Abstractions | Notes |
|---------|----------------|--------|
| `Text` | `Text` | Same API, added variants |
| `H1`, `H2`, etc. | `H1`, `H2`, etc. | Consistent sizing |
| `Paragraph` | `Paragraph` | Same API |

### Layout Components
| Tamagui | UI Abstractions | Notes |
|---------|----------------|--------|
| `View` | `View` | Same API |
| `XStack` | `XStack` | Same API |
| `YStack` | `YStack` | Same API |
| `Card` | `Card` | Added `elevated` prop |

### Button Components
| Tamagui | UI Abstractions | Notes |
|---------|----------------|--------|
| `Button` | `Button` | Standardized variants |

### Input Components
| Tamagui | UI Abstractions | Notes |
|---------|----------------|--------|
| `Input` | `Input` | Same API |
| `TextArea` | `TextArea` | Same API |

### Utility Components
| Tamagui | UI Abstractions | Notes |
|---------|----------------|--------|
| `Spinner` | `Spinner` | Simplified size prop |
| `Separator` | `Separator` | Same API |

## 📝 File-by-File Migration Examples

### Example 1: Simple Component

**Before:**
```typescript
// lib/shared-components/src/LoadingPanel.tsx
import { Spinner } from 'tamagui';

export function LoadingPanel(): React.JSX.Element {
  return <Spinner />;
}
```

**After:**
```typescript
// lib/shared-components/src/LoadingPanel.tsx
import { LoadingPanel as UILoadingPanel } from '@legacy-sports/ui-abstractions';

export function LoadingPanel(): React.JSX.Element {
  return <UILoadingPanel message="Loading..." />;
}

// Or use the Spinner directly:
import { Spinner } from '@legacy-sports/ui-abstractions';

export function LoadingPanel(): React.JSX.Element {
  return <Spinner size="large" />;
}
```

### Example 2: Layout Component

**Before:**
```typescript
// lib/shared-components/src/Layout.tsx
import { XStack, YStack, Text, Button } from 'tamagui';

export function PlayerCard({ player, onEdit }) {
  return (
    <YStack space="$3" padding="$4" backgroundColor="$gray2">
      <Text fontSize="$lg" fontWeight="bold">{player.name}</Text>
      <Text fontSize="$sm" color="$gray11">{player.position}</Text>
      <XStack justifyContent="flex-end">
        <Button variant="outlined" onPress={onEdit}>
          Edit
        </Button>
      </XStack>
    </YStack>
  );
}
```

**After:**
```typescript
// lib/shared-components/src/Layout.tsx
import { 
  XStack, 
  YStack, 
  Text, 
  Button,
  Card
} from '@legacy-sports/ui-abstractions';

export function PlayerCard({ player, onEdit }) {
  return (
    <Card padding="$4">
      <YStack space="$3">
        <Text fontSize="$lg" fontWeight="bold">{player.name}</Text>
        <Text variant="caption">{player.position}</Text>
        <XStack justifyContent="flex-end">
          <Button variant="outline" onPress={onEdit}>
            Edit
          </Button>
        </XStack>
      </YStack>
    </Card>
  );
}
```

### Example 3: Provider Setup

**Before:**
```typescript
// apps/web/src/main.tsx
import { TamaguiProvider } from 'tamagui';
import { tamaguiConfig } from '@legacy-sports/tamagui-config';

export function App() {
  return (
    <TamaguiProvider config={tamaguiConfig}>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
      </Routes>
    </TamaguiProvider>
  );
}
```

**After:**
```typescript
// apps/web/src/main.tsx
import { UIThemeProvider } from '@legacy-sports/ui-abstractions';
import { tamaguiConfig } from '@legacy-sports/tamagui-config';

export function App() {
  return (
    <UIThemeProvider tamaguiConfig={tamaguiConfig} theme="auto">
      <Routes>
        <Route path="/" element={<HomeScreen />} />
      </Routes>
    </UIThemeProvider>
  );
}
```

## 🎨 Theme Usage

**Before:**
```typescript
import { useTheme } from 'tamagui';

function MyComponent() {
  const theme = useTheme();
  
  return (
    <View backgroundColor={theme.background.val}>
      <Text color={theme.color.val}>Hello</Text>
    </View>
  );
}
```

**After:**
```typescript
import { useUITheme } from '@legacy-sports/ui-abstractions';

function MyComponent() {
  const { theme } = useUITheme();
  
  return (
    <View backgroundColor={theme.colors.background}>
      <Text color={theme.colors.text}>Hello</Text>
    </View>
  );
}
```

## ⚡ Quick Migration Script

You can use this search-and-replace pattern for bulk migrations:

```bash
# Update imports
find . -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/from '\''tamagui'\''/from '\''@legacy-sports\/ui-abstractions'\''/g'

# Update TamaguiProvider
find . -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/TamaguiProvider/UIThemeProvider/g'

# Update variant props (manual review recommended)
find . -name "*.tsx" -o -name "*.ts" | xargs sed -i 's/variant="outlined"/variant="outline"/g'
```

**Note**: Always review changes manually and test thoroughly!

## 🧪 Testing Migration

After migrating a component:

1. **Build Test**: `npx nx build [project-name]`
2. **Type Check**: Ensure no TypeScript errors
3. **Visual Test**: Check that components render correctly
4. **Functionality Test**: Verify all interactions work

## 🚨 Common Migration Issues

### Issue 1: Type Errors

**Problem**: Complex Tamagui types cause build errors

**Solution**: Use the abstracted types from UI Abstractions

```typescript
// Before (problematic)
import type { ButtonProps as TamaguiButtonProps } from 'tamagui';

// After (stable)
import type { ButtonProps } from '@legacy-sports/ui-abstractions';
```

### Issue 2: Missing Props

**Problem**: Some Tamagui-specific props aren't available

**Solution**: Use the abstracted equivalent or file an issue to add it

```typescript
// Before
<Button chromeless unstyled>Click</Button>

// After (simplified)
<Button variant="ghost">Click</Button>
```

### Issue 3: Provider Configuration

**Problem**: TamaguiProvider config doesn't work with UIThemeProvider

**Solution**: Pass tamaguiConfig as a prop

```typescript
// Before
<TamaguiProvider config={tamaguiConfig}>

// After  
<UIThemeProvider tamaguiConfig={tamaguiConfig}>
```

## 🎯 Migration Priority

Migrate in this order for best results:

1. **Provider components** (App.tsx, _layout.tsx)
2. **Utility components** (LoadingPanel, etc.)
3. **Layout components** (Views, Stacks)
4. **Text components** (Text, Headings)
5. **Interactive components** (Buttons, Inputs)
6. **Complex components** (Forms, Modals)

## ✅ Migration Checklist

- [ ] Updated imports to use `@legacy-sports/ui-abstractions`
- [ ] Replaced `TamaguiProvider` with `UIThemeProvider`
- [ ] Updated component props to use abstracted API
- [ ] Tested build process
- [ ] Verified visual rendering
- [ ] Tested functionality
- [ ] Updated tests if necessary
- [ ] Documented any custom patterns

## 🤝 Getting Help

If you encounter issues during migration:

1. Check this guide for common patterns
2. Look at `UIAbstractionsExample.tsx` for reference implementations
3. Check the UI Abstractions README for component documentation
4. File an issue if you need additional abstracted components

The UI Abstractions layer is designed to make migration straightforward while providing long-term stability for the Legacy Sports codebase.

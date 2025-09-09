# Shared Components Library

Cross-platform UI components and utilities shared between web and mobile applications.

## 📚 Overview

This library provides:
- **Cross-platform components**: Work on both React Native and web
- **Consistent design system**: Tamagui-based theming
- **Business logic**: Shared screens and data handling
- **Utilities**: Common functions and types

## 🧩 Package Structure

```
lib/shared-components/
├── src/
│   ├── components/        # Base UI components
│   ├── screens/          # Complete screen components
│   ├── features/         # Feature-specific components
│   ├── providers/        # Context providers
│   ├── utils/           # Utility functions
│   └── index.ts         # Public API exports
├── tamagui.config.ts    # Tamagui configuration
└── project.json         # NX build configuration
```

## 🎨 Components

### Screen Components

Pre-built screens ready to use:
- `HomeScreen`: Dashboard and navigation
- `PlayersScreen`: Player data display
- `BaseballScreen`: Baseball-specific views
- `FootballScreen`: Football-specific views
- `DemoScreen`: Component demonstrations

### UI Components

Base components for building interfaces:
- `LoadingPanel`: Loading states
- `ErrorBoundary`: Error handling
- Tables, icons, forms, and more

### Feature Components

Domain-specific functionality:
- Authentication flows
- Data visualization
- Sport-specific components

## 🛠️ Development

### Building the Library

```bash
# Build shared components
npx nx build shared-components

# Watch for changes during development
npx nx build shared-components --watch
```

### Testing Components

```bash
# Run component tests
npx nx test shared-components

# Test with coverage
npx nx test shared-components --coverage
```

### Storybook (Development UI)

```bash
# Start Storybook for component development
npx nx storybook shared-components
```

## 🎨 Tamagui Configuration

### Theme System

Configured in `tamagui.config.ts`:
- Light and dark themes
- Consistent color palette
- Typography scale
- Spacing system

### Platform Differences

Components automatically adapt:
- **Web**: CSS-based styling
- **React Native**: Native platform styling
- **Responsive**: Breakpoint-based layouts

## 📱 Usage

### In React Native App

```typescript
import { PlayersScreen, AppProvider } from '@legacy-sports/shared-components';

function App() {
  return (
    <AppProvider apolloClient={client} colorScheme="dark">
      <PlayersScreen />
    </AppProvider>
  );
}
```

### In Web App

```typescript
import { PlayersScreen, AppProvider } from '@legacy-sports/shared-components';

function App() {
  return (
    <AppProvider apolloClient={client} colorScheme="dark">
      <PlayersScreen />
    </AppProvider>
  );
}
```

## 🔧 Configuration

### AppProvider Props

```typescript
interface AppProviderProps {
  children: React.ReactNode;
  apolloClient: ApolloClient;
  colorScheme?: 'light' | 'dark';
  isLoading?: boolean;
}
```

### Platform Detection

The library automatically detects platform:
- Uses `Platform.OS === 'web'` for web-specific code
- Renders appropriate components for each platform
- Handles navigation and styling differences

## 🧪 Testing

### Component Testing

```bash
# Run all component tests
npm test

# Run specific test file
npx jest components/LoadingPanel.test.tsx

# Run tests in watch mode
npm run test:watch
```

### Visual Testing

Use Storybook for visual component testing:
- Component isolation
- Props playground
- Visual regression testing
- Accessibility testing

## 📦 Building & Publishing

### Build Output

The library builds to multiple formats:
- **ES Modules**: Modern bundlers
- **CommonJS**: Node.js compatibility
- **Type Definitions**: TypeScript support

### Adding New Components

1. Create component in appropriate directory
2. Add to main `index.ts` export
3. Write tests and stories
4. Update documentation

### Example Component

```typescript
// src/components/MyComponent.tsx
import React from 'react';
import { View, Text } from 'react-native';

interface MyComponentProps {
  title: string;
  onPress?: () => void;
}

export function MyComponent({ title, onPress }: MyComponentProps) {
  return (
    <View>
      <Text onPress={onPress}>{title}</Text>
    </View>
  );
}

// src/index.ts
export { MyComponent } from './components/MyComponent';
```

## 🔍 Troubleshooting

### Build Issues

**TypeScript errors**:
- Check component prop types
- Verify imports and exports
- Run `npx tsc --noEmit` for type checking

**Platform-specific issues**:
- Use Platform.select() for different implementations
- Check react-native-web compatibility
- Test on both platforms

### Runtime Issues

**Theme not working**:
- Ensure TamaguiProvider wraps components
- Check theme configuration
- Verify component usage of theme tokens

**Components not rendering**:
- Check AppProvider setup
- Verify Apollo Client configuration
- Check for JavaScript errors in console

## 📚 Resources

- [Tamagui Documentation](https://tamagui.dev)
- [React Native Documentation](https://reactnative.dev)
- [Storybook Documentation](https://storybook.js.org)
- [Apollo Client Documentation](https://apollographql.com/docs/react)

---

This library is the foundation for consistent UI across all Legacy Sports applications.

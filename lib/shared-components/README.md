# Shared Components Library

Cross-platform UI components and utilities shared between web and mobile applications.

## 📚 Overview

This library provides:

- **Cross-platform components**: Work on both React Native and web
- **Consistent design system**: Tamagui-based theming
- **Business logic**: Shared screens and data handling
- **Utilities**: Common functions and types

## 🏗️ Hybrid Platform Architecture

This library uses a **hybrid platform resolution system** for optimal cross-platform support:

### 🎯 **Magic String System** (Complex UI Components)

```typescript
// Build-time resolved platform-specific implementations
import { Icon, Table, OAuthProvider } from '@legacy-sports/shared-components';

// Automatically uses web or mobile implementation
<Icon name="search" size={24} />
<Table headers={headers} data={data} />
```

**Location**: `src/platform-components/` - Icons, Tables, OAuth Providers  
**Benefits**: Build-time optimization, strong type contracts, dead code elimination

### 📱 **Metro Native Resolution** (Simple Utilities)

```typescript
// Metro automatically picks .native.ts for React Native, .ts for web
import { SecureStorage, getDbOptions } from '@legacy-sports/shared-components';

// Same API, different implementation per platform
await SecureStorage.setItem('token', 'value');
const dbOptions = getDbOptions();
```

**Location**: `src/utils/` - SecureStorage, DbOptions, AwsSecrets  
**Benefits**: Native Metro support, simple developer experience, CI reliability

**📚 Learn More**: [Hybrid Platform Resolution Guide](../../docs/HYBRID_PLATFORM_RESOLUTION_GUIDE.md)

## 💡 Usage Examples

### ✅ Complex UI Components (Magic String System)

```typescript
// These components use build-time platform resolution
import {
  Icon,
  Table,
  OAuthProvider,
  PlatformProviders
} from '@legacy-sports/shared-components';

// Icons - Automatically uses Expo Vector Icons on mobile, CSS icons on web
<Icon name="search" size={24} color="blue" />
<Icon name="home" size={32} />

// Tables - HTML table on web, React Native implementation on mobile
<Table
  headers={['Name', 'Position', 'Team']}
  data={[
    ['Mike Trout', 'CF', 'Angels'],
    ['Mookie Betts', 'RF', 'Dodgers']
  ]}
/>

// OAuth - Google OAuth web integration vs Expo AuthSession
const handleLogin = () => OAuthProvider.signIn();
```

### ✅ Simple Utilities (Metro Native Resolution)

```typescript
// These utilities use .native.ts file resolution
import {
  SecureStorage,
  getDbOptions,
  readSecret,
} from '@legacy-sports/shared-components';

// SecureStorage - sessionStorage on web, Expo SecureStore on mobile
await SecureStorage.setItem('auth_token', token);
const storedToken = await SecureStorage.getItem('auth_token');

// DbOptions - Node.js path resolution on web, env vars only on mobile
const dbConfig = getDbOptions();

// AwsSecrets - AWS SDK on web, environment fallbacks on mobile
const secret = await readSecret({ secretName: 'db-credentials' });
```

### ✅ Screen Components (Universal)

```typescript
// Screen components work the same across platforms
import {
  PlayersScreen,
  HomeScreen,
  AppProvider
} from '@legacy-sports/shared-components';

function App() {
  return (
    <AppProvider apolloClient={client} colorScheme="dark">
      <HomeScreen />
      <PlayersScreen />
    </AppProvider>
  );
}
```

## 🧩 Package Structure

```
lib/shared-components/
├── src/
│   ├── components/        # Base UI components
│   ├── features/         # Feature-specific components
│   ├── platform-components/ # Magic string system (Icons, Tables, OAuth)
│   ├── utils/            # Metro native resolution (SecureStorage, etc.)
│   ├── providers/        # Context providers
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
pnpm exec nx build shared-components

# Watch for changes during development
pnpm exec nx build shared-components --watch
```

### Testing Components

```bash
# Run component tests
pnpm exec nx test shared-components

# Test with coverage
pnpm exec nx test shared-components --coverage
```

### Storybook (Development UI)

```bash
# Start Storybook for component development
pnpm exec nx storybook shared-components
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
pnpm exec jest components/LoadingPanel.test.tsx

# Run tests in watch mode
pnpm run test:watch
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
- Run `pnpm exec tsc --noEmit` for type checking

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

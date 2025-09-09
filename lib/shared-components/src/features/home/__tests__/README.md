# HomeScreen Test Documentation

## Overview

This document describes the comprehensive test suite created for the HomeScreen component in the shared-components library.

## Test Structure

### Files Created

- `lib/shared-components/jest.config.ts` - Jest configuration for the shared-components library
- `lib/shared-components/src/test-setup.ts` - Test setup with React Native mocks
- `lib/shared-components/src/features/home/__tests__/HomeScreen.test.tsx` - Main test file
- `lib/shared-components/src/features/home/__tests__/__snapshots__/HomeScreen.test.tsx.snap` - Generated snapshots

### Test Configuration

The Jest configuration includes:

- TypeScript support
- React Native component mocking
- JSdom test environment
- Transform patterns for React Native dependencies
- Coverage collection settings

## Snapshot Tests (9 tests)

All snapshot tests verify the component renders correctly under different conditions:

1. **Default Props Mobile** - Basic rendering with default configuration
2. **Custom Title/Subtitle** - Custom header text rendering
3. **Custom Sports List** - Rendering with specific sports provided
4. **Custom Actions** - Additional action buttons rendering
5. **Disabled Sports** - Sports with enabled/disabled states
6. **ShowAllSports Disabled** - Filtered view hiding disabled sports
7. **Tablet Layout** - Responsive design for larger screens
8. **Empty Sports List** - Graceful handling of no sports
9. **Full Configuration** - Complete feature set with all props

## Behavior Tests (4 tests)

Interaction and logic tests verify component functionality:

1. **Sport Press Handler** - `onSportPress` callback is called correctly
2. **Custom Action Press** - Custom action buttons trigger their callbacks
3. **Filtered Sports Display** - Only enabled sports show when `showAllSports=false`
4. **All Sports Display** - All sports show when `showAllSports=true`

## Key Features Tested

### Props Interface

```typescript
interface HomeScreenProps {
  title?: string;
  subtitle?: string;
  sports?: SportOption[];
  onSportPress: (sportKey: string) => void;
  customActions?: Array<{
    title: string;
    icon?: string;
    onPress: () => void;
    color?: string;
  }>;
  showAllSports?: boolean;
}
```

### Responsive Design

- Mobile layout (2 columns)
- Tablet layout (3 columns)
- Screen width detection via Dimensions.get()

### Sport Configuration

- Default sports from SPORT_CONFIGS
- Custom sport icons and theming
- Enabled/disabled state handling
- Sport-specific color schemes

### Cross-Platform Compatibility

- React Native components (View, Text, TouchableOpacity, ScrollView)
- Platform-specific styling
- Proper mocking for test environment

## Test Execution

Run the tests with:

```bash
npx nx test shared-components
```

Update snapshots when component changes:

```bash
npx nx test shared-components -- -u
```

## Test Results

✅ **13/13 tests passing**
✅ **9/9 snapshots passing**
✅ **4/4 behavior tests passing**
✅ **Full test coverage** of component functionality

## Mock Configuration

The test setup includes proper mocking of:

- React Native Dimensions API
- React Native Platform detection
- StyleSheet utilities
- React Native components as strings for snapshot testing

## Notes

- Tests use `@testing-library/react-native` for component rendering and interaction
- `fireEvent.press()` is used for simulating user interactions
- Component filtering logic was fixed during test development
- All snapshots are automatically generated and maintained

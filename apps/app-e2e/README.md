# React Native App E2E Tests

This project contains comprehensive end-to-end tests for the Legacy Sports React Native application using Detox.

## Overview

The `app-e2e` project provides thorough testing of the React Native app to ensure:

- **App builds correctly** and launches without crashes
- **Core functionality** works as expected across platforms
- **Sports features** (Football, Baseball) are functional
- **Performance** meets acceptable standards
- **Error handling** is robust

## Project Structure

```
apps/app-e2e/
├── src/
│   ├── app.spec.ts                    # Core app functionality tests
│   ├── sports.spec.ts                 # Sports-specific feature tests
│   └── build-verification.spec.ts     # Build and performance verification
├── .detoxrc.json                      # Detox configuration
├── jest.config.json                   # Jest configuration
├── test-setup.ts                      # Global test setup and utilities
├── project.json                       # Nx project configuration
└── tsconfig.*.json                    # TypeScript configurations
```

## Available Commands

### Run All E2E Tests

```bash
# Run comprehensive test suite
npx nx test app-e2e

# Run with CI configuration
npx nx test app-e2e --configuration=ci
```

### Platform-Specific Tests

```bash
# iOS Simulator (Release build)
npx nx test-ios app-e2e

# iOS Simulator (Debug build)
npx nx test-ios app-e2e --configuration=debug

# Android Emulator (Release build)
npx nx test-android app-e2e

# Android Emulator (Debug build)
npx nx test-android app-e2e --configuration=debug
```

### Focused Test Suites

```bash
# Quick smoke test (app launch and basic navigation)
npx nx test-smoke app-e2e

# Build verification tests only
npx nx test-build-verification app-e2e

# Sports functionality tests only
npx nx test-sports-functionality app-e2e
```

### Linting

```bash
# Run linting
npx nx lint app-e2e
```

## Test Categories

### Core App Tests (`app.spec.ts`)

- **App Launch**: Verifies app launches successfully
- **Navigation**: Tests screen navigation and routing
- **Authentication**: Validates login/logout flows
- **UI Components**: Tests button interactions, scrolling, text input
- **Error Handling**: Ensures graceful error handling
- **Accessibility**: Checks for proper accessibility support

### Sports Functionality (`sports.spec.ts`)

- **Football Features**: Game display, team information, scoring
- **Baseball Features**: Game selection, innings, runs/hits/errors
- **Live Updates**: Score updates and game status
- **Data Persistence**: Offline mode and preferences
- **Refresh Functionality**: Data reload capabilities

### Build Verification (`build-verification.spec.ts`)

- **Launch Performance**: App startup time verification
- **Memory Management**: Tests for memory leaks
- **Platform Integration**: iOS/Android specific features
- **Resource Loading**: Image and network request handling
- **Stability**: Rapid interaction and orientation testing
- **Error Boundaries**: React Native error boundary testing

## Test Configuration

### Detox Configurations

- **iOS Simulator**: `ios.sim.debug` and `ios.sim.release`
- **Android Emulator**: `android.emu.debug` and `android.emu.release`
- **Local Builds**: `ios.local` and `android.local`

### Test Environment

- **Timeout**: 120 seconds per test
- **Screenshots**: Automatic on failure
- **Logging**: Comprehensive test execution logs
- **Error Handling**: Graceful fallbacks for missing features

## Test Utilities

The `TestUtils` class provides helper methods:

```typescript
// Wait for app to load completely
await TestUtils.waitForAppToLoad();

// Navigate to a specific tab safely
await TestUtils.navigateToTab('football-tab');

// Take screenshot for debugging
await TestUtils.takeScreenshot('test-failure');

// Check if element exists without throwing
const exists = await TestUtils.checkElementExists('element-id');

// Tap element safely with error handling
const tapped = await TestUtils.tapElementSafely('button-id');

// Verify no React Native red box errors
await TestUtils.verifyNoRedBoxErrors();
```

## Device Requirements

### iOS

- iOS Simulator (iPhone 15 Plus recommended)
- Xcode installed and configured
- iOS deployment target: 13.0+

### Android

- Android Emulator or physical device
- Android SDK and build tools
- Minimum API level: 23 (Android 6.0)

## Test Strategy

### Build Verification Focus

1. **Launch Performance**: App should start within 15 seconds
2. **Memory Management**: No memory leaks during navigation
3. **Platform Features**: Proper iOS/Android behavior
4. **Error Resilience**: App handles errors gracefully
5. **Resource Loading**: Images and API calls work correctly

### Functional Testing

1. **Core Navigation**: All screens accessible
2. **Sports Data**: Football and baseball features work
3. **User Interactions**: Taps, scrolls, and inputs function
4. **Authentication**: Login/logout flows complete
5. **Offline Support**: App works without network

### Performance Testing

1. **Startup Time**: Fast app launch
2. **Smooth Transitions**: Responsive navigation
3. **Memory Usage**: Stable memory consumption
4. **Battery Efficiency**: Minimal background activity

## Troubleshooting

### Common Issues

- **App won't launch**: Check device/simulator is running
- **Tests timeout**: Increase timeout in jest.config.json
- **Element not found**: Verify element IDs in app code
- **Build failures**: Ensure app builds successfully first

### Debug Mode

Run tests with `--configuration=debug` for detailed logging and slower execution.

### Screenshots

Failed tests automatically capture screenshots in `test-results/` directory.

## CI/CD Integration

The tests are configured for CI environments with:

- **JUnit reports** for test result integration
- **Parallel execution** disabled for stability
- **Comprehensive logging** for debugging failures
- **Build artifact verification** before testing

## Dependencies

This project requires:

- `detox`: React Native E2E testing framework
- `@nx/detox`: Nx integration for Detox
- `jest`: Test runner
- React Native app with proper test IDs

## Best Practices

1. **Use test IDs**: Add `testID` props to important elements
2. **Wait for elements**: Always use `waitFor` for dynamic content
3. **Handle failures gracefully**: Use try/catch for optional features
4. **Keep tests independent**: Each test should work in isolation
5. **Focus on user workflows**: Test real user scenarios

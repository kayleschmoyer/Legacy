# Mobile App (React Native CLI)

The Legacy Sports mobile application built with React Native CLI for iOS and Android platforms.

## 🚀 Quick Start

### Prerequisites

- **Node.js**: v18+
- **React Native CLI**: `npm install -g react-native-cli`
- **Android Studio**: For Android development
- **Xcode**: For iOS development (macOS only)

### Development Setup

```bash
# From project root
cd apps/app

# Start Metro bundler
npm run start
# or
npx react-native start

# Run on Android (in another terminal)
npm run android
# or
npx react-native run-android

# Run on iOS (macOS only)
npm run ios
# or
npx react-native run-ios
```

## 📱 Platform Requirements

### Android

- **Android Studio**: Latest version
- **Android SDK**: API 29+ (Android 10+)
- **Java**: JDK 11 or newer
- **Android device or emulator**

### iOS

- **Xcode**: Latest version (macOS only)
- **iOS Simulator or device**
- **Apple Developer Account** (for device testing)

## 🔧 Configuration

### Metro Configuration

The app uses a custom Metro configuration (`metro.config.js`) with:
- **Tamagui support**: For cross-platform UI components
- **SVG support**: React Native SVG transformer
- **NX integration**: Monorepo module resolution

### Environment Variables

No environment variables needed for basic development. GraphQL endpoint is configured in shared components.

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run E2E tests
npm run test:e2e
```

## 📦 Building

### Android

```bash
# Debug build
npm run build:android:debug

# Release build (requires signing configuration)
npm run build:android:release

# Build APK directly
cd android
./gradlew assembleRelease
```

### iOS

```bash
# Debug build
npm run build:ios:debug

# Release build (requires provisioning profile)
npm run build:ios:release
```

## 🛠️ Development

### Hot Reloading

- **Fast Refresh**: Enabled by default
- **Reload**: Shake device or press `R` twice
- **Dev Menu**: Shake device or press `Cmd+D` (iOS) / `Cmd+M` (Android)

### Debugging

- **Flipper**: Network debugging and device logs
- **React DevTools**: Component inspection
- **Chrome DevTools**: JavaScript debugging

### Common Commands

```bash
# Clean build artifacts
npm run clean

# Reset Metro cache
npm run start:reset

# Install iOS dependencies (macOS only)
cd ios && pod install
```

## 🎨 UI Components

Uses Tamagui for cross-platform UI components:
- Shared with web application
- Consistent design system
- Platform-specific optimizations

## 🔍 Troubleshooting

### Common Issues

**Metro bundler won't start**:
```bash
# Clear cache and restart
npx react-native start --reset-cache
```

**Android build fails**:
```bash
# Clean and rebuild
cd android
./gradlew clean
cd ..
npm run android
```

**iOS build fails**:
```bash
# Clean and reinstall pods
cd ios
rm -rf Pods Podfile.lock
pod install
cd ..
npm run ios
```

**App crashes on startup**:
- Check Metro bundler logs
- Verify all native dependencies are installed
- Check for version conflicts in package.json

### Platform-Specific Issues

**Android**:
- Ensure Android SDK is properly configured
- Check `ANDROID_HOME` environment variable
- Verify emulator or device is running

**iOS**:
- Check Xcode configuration
- Verify iOS Simulator is running
- Check provisioning profiles for device builds

## 📚 Resources

- [React Native Documentation](https://reactnative.dev)
- [Android Developer Guide](https://developer.android.com)
- [iOS Developer Guide](https://developer.apple.com/ios/)
- [Tamagui Documentation](https://tamagui.dev)

---

For issues specific to this app, check the main project README or create an issue.

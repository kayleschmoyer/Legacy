# Mobile App (Expo / React Native)

The Legacy Sports mobile application built with Expo (prebuilt `android/` project committed) targeting Android.

> **Note**: iOS builds are currently disabled as we are not actively using the iOS platform.

## 🚀 Quick Start

### Prerequisites

- **Node.js**: v18+ (must be on the PATH of whatever launches Gradle — the Android build shells out to `node` to resolve React Native and Expo)
- **Android Studio**: For SDK/AVD management and native debugging
- **Xcode**: For iOS development (macOS only)

### Development Setup

```bash
# One command from repo root: boots an emulator if none is running,
# then Gradle debug build + install + Metro with Fast Refresh
make app-dev

# Preflight only — verify SDK/emulator/AVD setup without launching anything
make app-dev CHECK=1

# Or without the emulator-boot step (device/emulator must already be running):
pnpm run android          # from repo root, or apps/app

# Metro alone (after the app is already installed)
pnpm --filter @legacy-sports/app start
```

Environment variables (`EXPO_PUBLIC_*`) are loaded from the repo root `.env` by `app.config.js` — make sure it exists before starting Metro or the app will build but fail to reach the backend.

## 📱 Platform Requirements

### Android

- **Android Studio**: Latest version
- **Android SDK**: compileSdk comes from the Expo version catalog (currently API 36) — see [docs/mobile/android-version-matrix.md](../../docs/mobile/android-version-matrix.md)
- **Java**: JDK 17 (Temurin recommended; Android Studio's bundled JBR also works)
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
# Unit tests for changed files, from repo root
make test

# Mobile E2E (Maestro flows against a running emulator)
make maestro
```

## 📦 Building

### Android

```bash
# From repo root
pnpm run build-android-debug   # debug APK
pnpm run build-android         # release APK (unsigned by default — see LS-4960)

# Or build with Gradle directly
cd apps/app/android
./gradlew assembleDebug
```

### iOS

```bash
# From repo root (currently disabled/unused)
pnpm run build-ios
```

## 🛠️ Development

### Hot Reloading

- **Fast Refresh**: Enabled by default
- **Reload**: Shake device or press `R` twice
- **Dev Menu**: Shake device or press `Cmd+D` (iOS) / `Cmd+M` (Android)

### Debugging

- **React Native DevTools**: press `j` in the Metro terminal
- **Android Studio**: logcat and native debugging

### Common Commands

```bash
# Reset Metro cache
npx expo start --clear

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
pnpm exec react-native start --reset-cache
```

**Android build fails**:

```bash
# Clean and rebuild
cd android
./gradlew clean
cd ..
pnpm run android
```

**iOS build fails**:

```bash
# Clean and reinstall pods
cd ios
rm -rf Pods Podfile.lock
pod install
cd ..
pnpm run ios
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

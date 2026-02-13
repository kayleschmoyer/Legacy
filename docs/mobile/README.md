# Mobile Development Documentation

This directory contains mobile development documentation, focusing on React Native and Android-specific configurations for the Legacy Sports platform.

## 📑 Contents

### Android Development

- **[Android Build Setup](android-build-setup.md)** - Complete Android development environment setup
- **[Android Version Matrix](android-version-matrix.md)** - SDK versions, compatibility, and dependencies
- **[Android Build Caching](android-build-caching.md)** - Build performance optimization with multi-layer caching
- **[Mobile Build Automation](mobile-build-automation.md)** - CI/CD for mobile builds

## 🎯 Quick Start

### Setting Up Android Development

1. Follow [Android Build Setup](android-build-setup.md) for environment configuration
2. Review [Android Version Matrix](android-version-matrix.md) for compatibility
3. Understand [Android Build Caching](android-build-caching.md) for optimal performance
4. Configure [Mobile Build Automation](mobile-build-automation.md) for CI/CD

### Building for Android

1. Set up local environment per [Android Build Setup](android-build-setup.md)
2. Understand caching strategy in [Android Build Caching](android-build-caching.md)
3. Check version compatibility in [Android Version Matrix](android-version-matrix.md)
4. Test build locally before CI/CD

### Automating Mobile Builds

1. Configure CI per [Mobile Build Automation](mobile-build-automation.md)
2. Set up signing keys and secrets
3. Test automated builds

## 🔗 Related Documentation

- [Cross-Platform System](../architecture/cross-platform-system.md) - Shared code architecture
- [Authentication](../authentication/) - Mobile authentication implementation
- [CI/CD System](../ci-cd/) - Build automation pipelines
- [Development Setup](../guides/development-setup.md) - General dev environment

## 💡 Common Tasks

### Set Up Android Development Environment

1. Install Android Studio and SDK per [Android Build Setup](android-build-setup.md)
2. Configure Gradle build tools
3. Set up emulator or physical device
4. Test React Native setup

### Build Android APK/AAB

1. Review [Android Version Matrix](android-version-matrix.md) for target SDK
2. Configure signing in `android/app/build.gradle`
3. Run `nx run app:build-android` or similar
4. Test on device/emulator

### Troubleshoot Android Build Issues

1. Verify SDK versions in [Android Version Matrix](android-version-matrix.md)
2. Check Gradle configuration
3. Clean build: `cd android && ./gradlew clean`
4. Review [Troubleshooting Guide](../guides/troubleshooting.md)

### Update Android Dependencies

1. Check [Android Version Matrix](android-version-matrix.md) for compatibility
2. Update `android/build.gradle` and `android/app/build.gradle`
3. Test thoroughly
4. Update version matrix documentation

## 📱 Platform-Specific Notes

### React Native

- Uses Metro bundler for JavaScript
- Supports hot reload for development
- See [Cross-Platform System](../architecture/cross-platform-system.md) for shared code

### Android Specifics

- Minimum SDK version: Check [Android Version Matrix](android-version-matrix.md)
- Target SDK version: Check version matrix
- Build variants: debug, release
- Signing: Configure in `android/app/build.gradle`

### CI/CD Integration

- GitHub Actions workflows in `.github/workflows/`
- Automated builds via [Mobile Build Automation](mobile-build-automation.md)
- Secrets stored in GitHub repository settings

---

[← Back to Documentation Hub](../README.md)

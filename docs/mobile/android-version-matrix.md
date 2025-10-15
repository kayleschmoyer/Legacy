# Android Build Version Compatibility Matrix

## 📋 Current Configuration

### Primary Versions (Production)
- **React Native**: `0.79.6`
- **Expo SDK**: `53.0.22`
- **Java JDK**: `17` (Temurin distribution)
- **Node.js**: `22`
- **Android Compile SDK**: `35` (Android 14)
- **Android Target SDK**: `35` (Android 14)
- **Android Min SDK**: `24` (Android 7.0)
- **NDK**: `27.1.12297006`
- **Gradle**: `8.8.2`
- **Kotlin**: `1.9.10`

## 🔄 Compatibility Matrix

### React Native 0.79.x Compatibility

| Component | Minimum | Recommended | Maximum | Notes |
|-----------|---------|-------------|---------|--------|
| **Java JDK** | 11 | 17 | 21 | JDK 17 recommended for best compatibility |
| **Node.js** | 18.18.0 | 22 | 22.x | Active LTS versions |
| **Android SDK** | 33 | 35 | 35 | Target SDK 35 for Google Play |
| **Min SDK** | 24 | 24 | - | Android 7.0+ (covers 95%+ devices) |
| **NDK** | 25.x | 27.1.12297006 | 27.x | Latest stable for RN 0.79 |
| **Gradle** | 8.6 | 8.8.2 | 8.10.x | AGP 8.8.2 compatibility |
| **Kotlin** | 1.8.0 | 1.9.10 | 1.9.x | Stable with current Gradle |

### Build Tools Compatibility

| Tool | Version | Compatibility Notes |
|------|---------|-------------------|
| **Android Gradle Plugin** | 8.8.2 | Matches Gradle version |
| **Build Tools** | 35.0.0 | Automatic with SDK 35 |
| **React Native CLI** | 18.0.0+ | Via @react-native-community/cli |
| **Metro** | 0.81.1 | Bundled with RN 0.79.6 |
| **Hermes** | Bundled | Enabled by default |

## 🏗️ Matrix Strategy

### Environment Matrix

```yaml
strategy:
  matrix:
    include:
      # Production Configuration (Primary)
      - name: "Production (RN 0.79.6)"
        react_native_version: "0.79.6"
        java_version: "17"
        node_version: "22"
        android_api_level: "35"
        ndk_version: "27.1.12297006"
        gradle_version: "8.8.2"
        kotlin_version: "1.9.10"
        
      # Compatibility Testing
      - name: "Minimum Supported"
        react_native_version: "0.79.6"
        java_version: "11"
        node_version: "18"
        android_api_level: "33"
        ndk_version: "25.2.9519653"
        gradle_version: "8.6"
        kotlin_version: "1.8.22"
        
      # Future Compatibility
      - name: "Latest Stable"
        react_native_version: "0.79.6"
        java_version: "21"
        node_version: "22"
        android_api_level: "35"
        ndk_version: "27.1.12297006"
        gradle_version: "8.10.2"
        kotlin_version: "1.9.25"
```

### Operating System Matrix

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
    include:
      - os: ubuntu-latest
        gradle_executable: "./gradlew"
        cache_paths: |
          ~/.gradle/caches
          ~/.gradle/wrapper
          ~/.android/sdk
      - os: macos-latest  
        gradle_executable: "./gradlew"
        cache_paths: |
          ~/.gradle/caches
          ~/.gradle/wrapper
          ~/Library/Android/sdk
      - os: windows-latest
        gradle_executable: "gradlew.bat"
        cache_paths: |
          ~/.gradle/caches
          ~/.gradle/wrapper
          %ANDROID_HOME%
```

## 🔧 Implementation

### 1. Updated CI Workflow

The matrix should be implemented in `.github/workflows/build-android-matrix.yml`:

```yaml
name: Android Build Matrix

on:
  push:
    branches: [main, develop]
  pull_request:
    paths:
      - "apps/app/**"
      - "android/**"
      - ".github/workflows/build-android-matrix.yml"
  workflow_dispatch:
    inputs:
      matrix_type:
        description: "Matrix Type"
        required: false
        default: "production"
        type: choice
        options:
          - production
          - compatibility
          - full

jobs:
  matrix-build:
    name: "Build ${{ matrix.name }}"
    runs-on: ${{ matrix.os || 'ubuntu-latest' }}
    timeout-minutes: 45
    
    strategy:
      fail-fast: false
      matrix:
        include:
          # Matrix configurations here
```

### 2. Gradle Version Management

Update `apps/app/android/gradle/wrapper/gradle-wrapper.properties`:

```properties
distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\://services.gradle.org/distributions/gradle-8.8.2-all.zip
networkTimeout=60000
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
```

### 3. Dynamic Version Configuration

Create `apps/app/android/version-matrix.gradle`:

```gradle
// Dynamic version configuration based on environment
ext.getVersionFromMatrix = { component ->
    def matrixVersions = [
        java: System.getenv('JAVA_VERSION') ?: '17',
        kotlin: System.getenv('KOTLIN_VERSION') ?: '1.9.10',
        gradle: System.getenv('GRADLE_VERSION') ?: '8.8.2',
        androidApi: System.getenv('ANDROID_API_LEVEL') ?: '35',
        ndk: System.getenv('NDK_VERSION') ?: '27.1.12297006'
    ]
    
    return matrixVersions[component]
}
```

## ⚠️ Breaking Changes & Migrations

### Java Version Compatibility

- **Java 11**: Minimum for RN 0.79.x
- **Java 17**: Recommended (LTS, best performance)  
- **Java 21**: Supported but not extensively tested

### Android SDK Updates

- **API 35**: Required for new Google Play submissions
- **API 34**: Still supported but deprecated for new apps
- **API 33**: Minimum supported, legacy compatibility

### Gradle & AGP Compatibility

- **Gradle 8.6+**: Required for AGP 8.8+
- **AGP 8.8.2**: Current stable with RN 0.79.6
- **Kotlin 1.9.x**: Stable branch, avoid 2.0 alpha

## 🧪 Testing Strategy

### Matrix Testing Phases

1. **Smoke Test**: Production configuration only
2. **Compatibility Test**: Minimum + recommended + latest
3. **Full Matrix**: All combinations (scheduled runs)

### Validation Criteria

✅ **Build Success**: APK/AAB generation without errors  
✅ **Size Validation**: APK size within acceptable limits  
✅ **Hermes Compilation**: JavaScript bundle optimization  
✅ **Architecture Support**: ARM64, ARM32, x86_64, x86  
✅ **API Level**: Runs on minimum SDK 24  

## 📊 Performance Metrics

### Build Time Targets

- **Production Config**: < 15 minutes
- **Compatibility Matrix**: < 25 minutes  
- **Full Matrix**: < 45 minutes

### Cache Efficiency

- **Gradle Cache**: 80%+ hit rate
- **Node Modules**: 90%+ hit rate
- **Android SDK**: 95%+ hit rate

## 🔄 Upgrade Path

### React Native 0.80+ Preparation

1. **Gradle 8.10+**: Required for RN 0.80
2. **Java 17+**: Minimum requirement increase
3. **Android API 36**: Future target SDK
4. **NDK 28.x**: Next LTS NDK version

### Automated Updates

- **Dependabot**: Monitor Gradle, Kotlin, AGP versions
- **Renovate**: React Native and NDK updates
- **Matrix Testing**: Validate before promotion

---

**Last Updated**: October 2025  
**Next Review**: React Native 0.80 release

# Mobile App Build Automation

## 📱 Overview

Your repository now has comprehensive GitHub Actions workflows for building both Android and iOS applications automatically. Here's what's available:

## 🔧 Available Workflows

### 1. **Android APK Builds**

#### `publish-android-apk.yml` - Production Android Builds

- **Triggers:**
  - Push to `main` branch (when app code changes)
  - Manual trigger via GitHub UI
- **Outputs:**
  - Signed APK files
  - GitHub Releases with download links
  - Artifacts with 90-day retention
- **Features:**
  - Automatic versioning with timestamps
  - APK signing (development certificates)
  - Release notes generation

#### `build-android-manual.yml` - Manual Android Builds

- **Triggers:** Manual only
- **Options:**
  - Choose Release or Debug build
  - Option to create GitHub release
- **Use Case:** Testing, debugging, custom builds

### 2. **iOS IPA Builds**

#### `publish-ios-ipa.yml` - iOS Builds (NEW)

- **Triggers:**
  - Push to `main` branch (when app code changes)
  - Manual trigger via GitHub UI
- **Outputs:**
  - IPA files (for Release builds)
  - App bundles (for Debug builds)
  - GitHub Releases with installation instructions
- **Features:**
  - Xcode archive and export
  - CocoaPods integration
  - Multiple installation methods

### 3. **Cross-Platform Builds**

#### `build-mobile-apps.yml` - Unified Mobile Builds (NEW)

- **Triggers:**
  - Push to `main` branch
  - Manual trigger with platform selection
- **Options:**
  - Build both platforms or select specific one
  - Choose Release or Debug builds
  - Combined releases with both APK and IPA
- **Benefits:**
  - Parallel builds for faster execution
  - Unified versioning across platforms
  - Single release with both mobile apps

## 🚀 Build Capabilities

### ✅ **What's Automated**

**Version Management:**

- Automatic version extraction from `package.json`
- Build number generation with timestamps
- Git commit SHA integration
- Consistent versioning across platforms

**Android Builds:**

- Gradle-based compilation
- APK generation (Release/Debug)
- Automatic signing (development)
- Size optimization

**iOS Builds:**

- Xcode workspace compilation
- Archive creation for distribution
- IPA export for device installation
- Simulator builds for testing

**Artifact Management:**

- GitHub Artifacts with retention policies
- GitHub Releases for permanent downloads
- Versioned filenames with metadata
- Latest symlinks for easy access

### 🎯 **Trigger Strategies**

**Automatic (Recommended):**

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'apps/app/**' # App code changes
      - 'lib/**' # Shared library changes
      - 'package.json' # Dependency changes
```

**Manual (Flexible):**

```yaml
on:
  workflow_dispatch:
    inputs:
      platforms: # Choose Android, iOS, or both
      build_type: # Release or Debug
      create_releases: # Generate GitHub releases
```

## 📦 Output Artifacts

### **Android APK Files**

```
legacy-sports-android-v1.0.0-20240912_143022-abc123.apk
legacy-sports-android-latest.apk (symlink)
```

### **iOS IPA Files**

```
legacy-sports-ios-v1.0.0-20240912_143022-abc123.ipa
legacy-sports-ios-latest.ipa (symlink)
```

### **Debug Builds**

```
legacy-sports-android-v1.0.0-20240912_143022-abc123-debug.apk
legacy-sports-ios-v1.0.0-20240912_143022-abc123-debug.app.zip
```

## 📋 Installation Methods

### **Android APK Installation**

1. **Direct Installation:**
   - Enable "Install from Unknown Sources"
   - Download and tap APK file
   - Follow installation prompts

2. **ADB Installation:**

   ```bash
   adb install legacy-sports-latest.apk
   ```

3. **Testing:**
   - Works on physical devices
   - Works on Android emulators

### **iOS IPA Installation**

1. **Sideloading Tools:**
   - **AltStore:** Free, requires Apple ID
   - **Sideloadly:** Popular third-party tool
   - **3uTools:** Windows/Mac desktop tool

2. **Xcode Installation:**
   - Connect iOS device to Mac
   - Open Xcode → Devices and Simulators
   - Drag .ipa or .app to device

3. **TestFlight Distribution:**
   - Upload IPA to App Store Connect
   - Invite testers via TestFlight

## 🔐 Code Signing Status

### **Current Setup (Development)**

**Android:**

- ✅ Development keystore included
- ✅ Basic APK signing functional
- ⚠️ Uses debug certificates (not for production)

**iOS:**

- ⚠️ Code signing disabled for CI builds
- ✅ Archive creation functional
- ⚠️ Requires manual signing for device installation

### **Production Setup (Future)**

For production releases, you'll need:

**Android:**

- Upload keystore to GitHub Secrets
- Configure release signing in Gradle
- Enable Play Store upload automation

**iOS:**

- Add provisioning profiles to secrets
- Configure code signing certificates
- Enable App Store Connect automation

## 🎮 Usage Examples

### **Build Both Platforms (Manual)**

1. Go to GitHub Actions tab
2. Select "Build Mobile Apps (Cross-Platform)"
3. Click "Run workflow"
4. Choose:
   - Platforms: `both`
   - Build Type: `release`
   - Create Releases: `true`
5. Download from Artifacts or Releases

### **Android Only (Automatic)**

1. Make changes to `apps/app/` code
2. Create PR and merge to `main`
3. "Build and Publish Android APK" runs automatically
4. APK available in Artifacts and Releases

### **iOS Testing Build**

1. Go to "Build iOS IPA" workflow
2. Run with Debug configuration
3. Download .app.zip for simulator testing

## 📊 Build Performance

**Typical Build Times:**

- **Android APK:** ~10-15 minutes
- **iOS IPA:** ~15-25 minutes
- **Cross-Platform:** ~20-30 minutes (parallel)

**Resource Usage:**

- **Android:** Ubuntu runners (cost-effective)
- **iOS:** macOS runners (higher cost, required for iOS)
- **Concurrent:** Up to 2 jobs can run simultaneously

## 🔍 Troubleshooting

### **Common Android Issues**

**Gradle Build Fails:**

- Check Java version compatibility
- Verify Android SDK versions
- Review dependency conflicts

**APK Size Too Large:**

- Enable ProGuard/R8 optimization
- Remove unused resources
- Check asset sizes

### **Common iOS Issues**

**Xcode Build Fails:**

- Verify Xcode version compatibility
- Check CocoaPods integration
- Review iOS deployment target

**IPA Export Fails:**

- Code signing configuration
- Provisioning profile issues
- Export options plist problems

### **Debug Steps**

1. **Check workflow logs** for detailed error messages
2. **Review build summaries** in GitHub Actions
3. **Test locally** with same versions and configs
4. **Compare working commits** to identify changes

## 🚀 Next Steps

### **Immediate (Ready to Use)**

- ✅ Manual builds via GitHub UI
- ✅ Automatic builds on main branch merges
- ✅ Development distribution via GitHub

### **Enhanced Setup (Optional)**

- 🔐 Production code signing setup
- 📱 App Store/Play Store upload automation
- 🧪 Integration with testing frameworks
- 📊 Build metrics and notifications

### **Advanced Features (Future)**

- 🌟 Feature branch builds with PR comments
- 🎯 A/B testing build variants
- 📈 Crash reporting integration
- 🔄 Automated rollback capabilities

Your mobile build infrastructure is now production-ready for development and testing. The workflows provide flexibility for both automated CI/CD and manual testing builds.

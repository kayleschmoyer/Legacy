#!/usr/bin/env node

/**
 * Android Build Version Matrix Validator
 * 
 * Validates that the current environment matches the expected version matrix
 * for React Native 0.79.6 Android builds.
 */

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Version compatibility matrix for React Native 0.79.6
const VERSION_MATRIX = {
  reactNative: '0.79.6',
  java: {
    minimum: 11,
    recommended: 17,
    maximum: 21
  },
  nodejs: {
    minimum: '18.18.0',
    recommended: '22'
  },
  android: {
    compileSdk: 35,
    targetSdk: 35,
    minSdk: 24
  },
  gradle: {
    minimum: '8.6',
    recommended: '8.8.2',
    maximum: '8.10.2'
  },
  kotlin: {
    minimum: '1.8.0',
    recommended: '1.9.10',
    maximum: '1.9.25'
  },
  ndk: {
    minimum: '25.2.9519653',
    recommended: '27.1.12297006'
  }
};

class VersionValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.info = [];
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${message}`;
    
    switch (level) {
      case 'error':
        this.errors.push(message);
        console.error(`❌ ${formattedMessage}`);
        break;
      case 'warning':
        this.warnings.push(message);
        console.warn(`⚠️  ${formattedMessage}`);
        break;
      case 'info':
        this.info.push(message);
        console.log(`ℹ️  ${formattedMessage}`);
        break;
      case 'success':
        console.log(`✅ ${formattedMessage}`);
        break;
    }
  }

  parseVersion(versionString) {
    const match = versionString.match(/(\d+)\.(\d+)\.?(\d+)?/);
    if (!match) return null;
    
    return {
      major: parseInt(match[1]),
      minor: parseInt(match[2]),
      patch: parseInt(match[3] || 0),
      string: versionString
    };
  }

  compareVersions(v1, v2) {
    if (v1.major !== v2.major) return v1.major - v2.major;
    if (v1.minor !== v2.minor) return v1.minor - v2.minor;
    return v1.patch - v2.patch;
  }

  validateJavaVersion() {
    try {
      const javaVersion = execSync('java -version 2>&1', { encoding: 'utf8' });
      const versionMatch = javaVersion.match(/version "?(\d+)\.?(\d+)?/);
      
      if (!versionMatch) {
        this.log('error', 'Unable to detect Java version');
        return false;
      }

      const majorVersion = parseInt(versionMatch[1]);
      const { minimum, recommended, maximum } = VERSION_MATRIX.java;

      if (majorVersion < minimum) {
        this.log('error', `Java ${majorVersion} is below minimum requirement (${minimum})`);
        return false;
      }

      if (majorVersion > maximum) {
        this.log('warning', `Java ${majorVersion} is above tested maximum (${maximum})`);
      }

      if (majorVersion === recommended) {
        this.log('success', `Java ${majorVersion} matches recommended version`);
      } else {
        this.log('info', `Java ${majorVersion} is compatible (recommended: ${recommended})`);
      }

      return true;
    } catch (error) {
      this.log('error', `Failed to check Java version: ${error.message}`);
      return false;
    }
  }

  validateNodeVersion() {
    try {
      const nodeVersion = process.version.substring(1); // Remove 'v' prefix
      const currentVersion = this.parseVersion(nodeVersion);
      const minimumVersion = this.parseVersion(VERSION_MATRIX.nodejs.minimum);
      const recommendedVersion = this.parseVersion(VERSION_MATRIX.nodejs.recommended);

      if (!currentVersion) {
        this.log('error', `Unable to parse Node.js version: ${nodeVersion}`);
        return false;
      }

      if (!minimumVersion) {
        this.log('error', `Unable to parse minimum Node.js version: ${VERSION_MATRIX.nodejs.minimum}`);
        return false;
      }

      if (this.compareVersions(currentVersion, minimumVersion) < 0) {
        this.log('error', `Node.js ${nodeVersion} is below minimum requirement (${VERSION_MATRIX.nodejs.minimum})`);
        return false;
      }

      const recommendedMajor = parseInt(VERSION_MATRIX.nodejs.recommended);
      
      if (currentVersion.major === recommendedMajor) {
        this.log('success', `Node.js ${nodeVersion} matches recommended version`);
      } else {
        this.log('info', `Node.js ${nodeVersion} is compatible (recommended: ${VERSION_MATRIX.nodejs.recommended})`);
      }

      return true;
    } catch (error) {
      this.log('error', `Failed to check Node.js version: ${error.message}`);
      return false;
    }
  }

  validateReactNativeVersion() {
    try {
      // Check main package.json
      const mainPackagePath = path.join(process.cwd(), 'package.json');
      const appPackagePath = path.join(process.cwd(), 'apps', 'app', 'package.json');
      
      let reactNativeVersion = null;

      if (fs.existsSync(mainPackagePath)) {
        const mainPackage = JSON.parse(fs.readFileSync(mainPackagePath, 'utf8'));
        reactNativeVersion = mainPackage.dependencies?.['react-native'];
      }

      if (!reactNativeVersion && fs.existsSync(appPackagePath)) {
        const appPackage = JSON.parse(fs.readFileSync(appPackagePath, 'utf8'));
        reactNativeVersion = appPackage.dependencies?.['react-native'];
      }

      if (!reactNativeVersion) {
        this.log('error', 'React Native version not found in package.json');
        return false;
      }

      // Remove any version prefixes (^, ~, etc.)
      const cleanVersion = reactNativeVersion.replace(/^[~^]/, '');
      
      if (cleanVersion === VERSION_MATRIX.reactNative) {
        this.log('success', `React Native ${cleanVersion} matches expected version`);
      } else {
        this.log('warning', `React Native ${cleanVersion} differs from expected ${VERSION_MATRIX.reactNative}`);
      }

      return true;
    } catch (error) {
      this.log('error', `Failed to check React Native version: ${error.message}`);
      return false;
    }
  }

  validateGradleVersion() {
    try {
      const gradleWrapperPath = path.join(process.cwd(), 'apps', 'app', 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties');
      
      if (!fs.existsSync(gradleWrapperPath)) {
        this.log('error', 'Gradle wrapper properties not found');
        return false;
      }

      const wrapperContent = fs.readFileSync(gradleWrapperPath, 'utf8');
      const distributionUrlMatch = wrapperContent.match(/distributionUrl=.*gradle-(\d+\.\d+(?:\.\d+)?)/);

      if (!distributionUrlMatch) {
        this.log('error', 'Unable to parse Gradle version from wrapper properties');
        return false;
      }

      const gradleVersion = distributionUrlMatch[1];
      const currentVersion = this.parseVersion(gradleVersion);
      const minimumVersion = this.parseVersion(VERSION_MATRIX.gradle.minimum);
      const recommendedVersion = this.parseVersion(VERSION_MATRIX.gradle.recommended);

      if (this.compareVersions(currentVersion, minimumVersion) < 0) {
        this.log('error', `Gradle ${gradleVersion} is below minimum requirement (${VERSION_MATRIX.gradle.minimum})`);
        return false;
      }

      if (gradleVersion === VERSION_MATRIX.gradle.recommended) {
        this.log('success', `Gradle ${gradleVersion} matches recommended version`);
      } else {
        this.log('info', `Gradle ${gradleVersion} is compatible (recommended: ${VERSION_MATRIX.gradle.recommended})`);
      }

      return true;
    } catch (error) {
      this.log('error', `Failed to check Gradle version: ${error.message}`);
      return false;
    }
  }

  validateAndroidConfiguration() {
    try {
      const buildGradlePath = path.join(process.cwd(), 'apps', 'app', 'android', 'build.gradle');
      
      if (!fs.existsSync(buildGradlePath)) {
        this.log('error', 'Android build.gradle not found');
        return false;
      }

      const buildGradleContent = fs.readFileSync(buildGradlePath, 'utf8');
      
      // Extract SDK versions
      const compileSdkMatch = buildGradleContent.match(/compileSdkVersion\s*=\s*.*?(\d+)/);
      const targetSdkMatch = buildGradleContent.match(/targetSdkVersion\s*=\s*.*?(\d+)/);
      const minSdkMatch = buildGradleContent.match(/minSdkVersion\s*=\s*.*?(\d+)/);

      if (compileSdkMatch) {
        const compileSdk = parseInt(compileSdkMatch[1]);
        if (compileSdk === VERSION_MATRIX.android.compileSdk) {
          this.log('success', `Compile SDK ${compileSdk} matches expected version`);
        } else {
          this.log('warning', `Compile SDK ${compileSdk} differs from expected ${VERSION_MATRIX.android.compileSdk}`);
        }
      }

      if (targetSdkMatch) {
        const targetSdk = parseInt(targetSdkMatch[1]);
        if (targetSdk === VERSION_MATRIX.android.targetSdk) {
          this.log('success', `Target SDK ${targetSdk} matches expected version`);
        } else {
          this.log('warning', `Target SDK ${targetSdk} differs from expected ${VERSION_MATRIX.android.targetSdk}`);
        }
      }

      if (minSdkMatch) {
        const minSdk = parseInt(minSdkMatch[1]);
        if (minSdk === VERSION_MATRIX.android.minSdk) {
          this.log('success', `Min SDK ${minSdk} matches expected version`);
        } else {
          this.log('info', `Min SDK ${minSdk} (expected: ${VERSION_MATRIX.android.minSdk})`);
        }
      }

      return true;
    } catch (error) {
      this.log('error', `Failed to validate Android configuration: ${error.message}`);
      return false;
    }
  }

  validate() {
    console.log('🔍 Starting Android Build Version Matrix Validation...\n');

    const checks = [
      { name: 'Java Version', fn: () => this.validateJavaVersion() },
      { name: 'Node.js Version', fn: () => this.validateNodeVersion() },
      { name: 'React Native Version', fn: () => this.validateReactNativeVersion() },
      { name: 'Gradle Version', fn: () => this.validateGradleVersion() },
      { name: 'Android Configuration', fn: () => this.validateAndroidConfiguration() }
    ];

    let allPassed = true;

    for (const check of checks) {
      console.log(`\n📋 ${check.name}:`);
      const result = check.fn();
      allPassed = allPassed && result;
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 VALIDATION SUMMARY');
    console.log('='.repeat(60));

    if (this.errors.length > 0) {
      console.log(`❌ Errors (${this.errors.length}):`);
      this.errors.forEach(error => console.log(`   • ${error}`));
    }

    if (this.warnings.length > 0) {
      console.log(`⚠️  Warnings (${this.warnings.length}):`);
      this.warnings.forEach(warning => console.log(`   • ${warning}`));
    }

    if (allPassed && this.errors.length === 0) {
      console.log('✅ All version compatibility checks passed!');
      console.log('🚀 Environment is ready for Android builds');
      return true;
    } else {
      console.log('❌ Version matrix validation failed');
      console.log('🛠️  Please update your environment to match the compatibility matrix');
      return false;
    }
  }

  generateReport() {
    return {
      timestamp: new Date().toISOString(),
      status: this.errors.length === 0 ? 'passed' : 'failed',
      errors: this.errors,
      warnings: this.warnings,
      info: this.info,
      matrix: VERSION_MATRIX
    };
  }
}

// CLI usage
if (require.main === module) {
  const validator = new VersionValidator();
  const success = validator.validate();
  
  // Write report if requested
  if (process.argv.includes('--report')) {
    const report = validator.generateReport();
    fs.writeFileSync('version-validation-report.json', JSON.stringify(report, null, 2));
    console.log('\n📄 Report written to version-validation-report.json');
  }
  
  process.exit(success ? 0 : 1);
}

module.exports = VersionValidator;

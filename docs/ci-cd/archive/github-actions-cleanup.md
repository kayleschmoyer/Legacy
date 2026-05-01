> **Archived 2026-04-27.** This document describes a system that has been replaced. See [ci-greenfield-design.md](../ci-greenfield-design.md) for the current architecture.

---

# GitHub Actions Workflow Cleanup

## 🧹 Cleanup Summary (Sept 12, 2025)

### ❌ **Deleted Redundant Workflows**

1. **`build-mobile-apps.yml`** - Redundant cross-platform workflow
   - **Reason**: Replaced by focused `build-android-app.yml`
   - **Status**: ✅ Deleted

2. **`build-android-manual.yml`** - Manual-only Android build
   - **Reason**: Overlapped with `build-android-app.yml` functionality
   - **Status**: ✅ Deleted

3. **`publish-android-apk.yml`** - Basic Android build workflow
   - **Reason**: Superseded by advanced `build-android-app.yml` with more features
   - **Status**: ✅ Deleted

4. **`test-dependency-actions.yml`** - Testing workflow for custom actions
   - **Reason**: Not developing custom GitHub Actions
   - **Status**: ✅ Deleted

5. **`validate-dependabot.yml`** - Dependabot PR validation
   - **Reason**: Not using Dependabot for automated dependency updates
   - **Status**: ✅ Deleted

### ⏸️ **Disabled Workflows**

6. **`publish-ios-ipa.yml`** - iOS app builds
   - **Reason**: No Apple Developer Program subscription ($99/year)
   - **Status**: ⚠️ Disabled (manual trigger only with warning)
   - **Future**: Re-enable when iOS certificates are available

## ✅ **Active Workflows** (9 remaining)

| Workflow                        | Purpose                        | Trigger              |
| ------------------------------- | ------------------------------ | -------------------- |
| **`build-android-app.yml`**     | Primary Android APK builds     | Push to main, Manual |
| **`ci.yml`**                    | Main CI pipeline (tests, lint) | Push, PR             |
| **`deploy-web.yml`**            | Web app to GitHub Pages        | Push to main         |
| **`pr-validation.yml`**         | PR validation and testing      | Pull requests        |
| **`publish-android-apk.yml`**   | Alternative Android build      | Push to main, Manual |
| **`publish-gql.yml`**           | GraphQL Lambda deployment      | S3-based deployment  |
| **`publish-oauth-proxy.yml`**   | OAuth Lambda deployment        | S3-based deployment  |
| **`publish-stats-lambda.yml`**  | Stats Lambda deployment        | S3-based deployment  |
| **`validate-package-json.yml`** | Package.json standards         | Push, PR             |
| **`publish-ios-ipa.yml`**       | iOS builds (disabled)          | Manual only          |

## 🎯 **Benefits of Cleanup**

- ✅ **Reduced complexity** - 4 fewer workflows to maintain
- ✅ **Clear purpose** - Each remaining workflow has a distinct role
- ✅ **No redundancy** - Eliminated overlapping Android build workflows
- ✅ **Future-ready** - iOS workflow preserved but safely disabled
- ✅ **Cost-effective** - No unnecessary CI/CD runs

## 📝 **Notes**

- **Android builds**: Use `build-android-app.yml` as the primary workflow
- **iOS builds**: Disabled until Apple Developer Program subscription
- **Lambda deployments**: All use the new S3-based deployment system
- **Web deployment**: Continues to work with GitHub Pages

# About Page Implementation

## Summary

Added About pages to both the web and mobile applications that display current release information including version, build details, and environment configuration.

## Changes Made

### Mobile App (React Native)

1. **Created**: `apps/app/src/screens/AboutScreen.tsx`
   - Displays app version from `app.json`
   - Shows Expo SDK version
   - Displays native build version
   - Shows current environment (Development/Production)
   - Shows platform information (iOS/Android)
   - Displays build date

2. **Updated**: `apps/app/src/navigation/AppNavigator.tsx`
   - Added import for `AboutScreen`
   - Added "About" screen to Stack Navigator

3. **Updated**: `apps/app/src/app/(app)/index.tsx`
   - Added "About" to `RootStackParamList` type
   - Added "About" button on home screen

### Web App (Next.js/React)

**Enhanced**: `apps/web/src/components/AboutPage.tsx`

- Added clickable commit SHA link to GitHub
- Added formatted build date with timezone
- Added GraphQL API URL display
- Added "Links" section with GitHub repository and commit buttons
- Enhanced styling with hover effects
- Added copyright and tech stack information

## Release Information Displayed

### Mobile App

- App Version (from app.json)
- Native Build Version
- Expo SDK Version
- Build Date
- Environment (Development/Production)
- Platform (iOS/Android)

### Web App

- App Version (from VITE_APP_VERSION)
- Commit SHA (clickable link to GitHub)
- Build Date (formatted with timezone)
- Environment (Development/Production)
- GraphQL API URL
- Base URL
- Links to GitHub repository and current commit

## Environment Variables Used

### Web App

Build-time variables injected via Vite:

- `VITE_APP_VERSION` - Application version (default: '0.0.0')
- `VITE_COMMIT_SHA` - Git commit SHA (auto-detected from git)
- `VITE_BUILD_DATE` - ISO timestamp of build
- Runtime config from `env` module

### Mobile App

- Uses Expo Constants API to read from `app.json`
- No additional environment setup needed

## Testing

### Mobile App

1. Run the app: `pnpm exec nx run app:start`
2. Navigate to Home screen
3. Tap the "ℹ️ About" button at the bottom
4. Verify all information displays correctly

### Web App

1. Start dev server (if not running): `pnpm exec nx run web:serve`
2. Navigate to `/about` or click "About" in navigation
3. Verify version info displays
4. Test clicking commit SHA link (should open GitHub)
5. Test "View on GitHub" and "View Current Commit" buttons

## Future Enhancements

- Add changelog display
- Add release notes
- Add system health indicators
- Add feature flags status
- Add API version compatibility info

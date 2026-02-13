# Google Analytics 4 Integration

## Overview

This project now includes Google Analytics 4 (GA4) tracking for the web application. Analytics are automatically initialized when a valid measurement ID is provided.

## Configuration

### Environment Variable

Add the following environment variable to enable Google Analytics:

```bash
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

**Note:** Analytics are disabled in development mode (`isDev: true`) and when no measurement ID is provided.

### Setup Steps

1. Create a GA4 property in [Google Analytics](https://analytics.google.com/)
2. Copy your Measurement ID (format: `G-XXXXXXXXXX`)
3. Add `VITE_GA_MEASUREMENT_ID` to your environment variables
4. Deploy your application

## Features

### Automatic Page View Tracking

Page views are automatically tracked whenever the user navigates to a new route in the application.

### Custom Event Tracking

The following pre-built event trackers are available:

**Authentication:**

- `trackLogin(method)` - Track user login
- `trackSignup(method)` - Track user registration

**League Management:**

- `trackLeagueCreated(leagueId)` - Track league creation
- `trackLeagueJoined(leagueId, method)` - Track joining a league
- `trackLeagueConfigured(config)` - Track league configuration

**Draft & Roster:**

- `trackDraftStarted(leagueId, draftType)` - Track draft start
- `trackPlayerSelected(playerId, position)` - Track player selection
- `trackRosterAction(action, details)` - Track roster changes (add/drop/trade/position)

**Viewing & Navigation:**

- `trackTeamViewed(teamId, leagueId)` - Track team page views
- `trackMatchupViewed(matchupId, leagueId, weekNumber)` - Track matchup views
- `trackAnalyticsViewed(leagueId, tab)` - Track analytics page usage

**Search & Discovery:**

- `trackSearch(searchTerm, resultCount, context)` - Track search activity

**Performance & Monitoring:**

- `trackError(errorType, errorMessage, context)` - Track application errors
- `trackTiming(category, variable, timeMs)` - Track performance metrics

**Monetization:**

- `trackPremiumFeatureClick(featureName)` - Track interest in premium features

**User Properties:**

- `setUserId(userId)` - Set user identifier
- `setUserProperties(properties)` - Set user segmentation properties

### Generic Event Tracking

For custom events, use the generic `trackEvent` function:

```typescript
import { trackEvent } from './utils/analytics';

trackEvent('button_click', {
  category: 'engagement',
  label: 'Submit Draft',
  value: 1,
});
```

## Usage Examples

### Setting User Properties

```typescript
import { setUserProperties } from '../utils/analytics';

// After user authentication, set comprehensive user properties
setUserProperties({
  userId: user.id,
  userType: user.isCommissioner ? 'commissioner' : 'league_member',
  totalLeagues: user.leagues.length,
  primarySport: 'baseball',
  accountAge:
    userAccountAge < 7 ? 'new' : userAccountAge < 30 ? 'returning' : 'veteran',
  subscriptionTier: 'free',
});
```

### Tracking League Operations

```typescript
import {
  trackLeagueCreated,
  trackLeagueJoined,
  trackLeagueConfigured,
} from '../utils/analytics';

// When user creates a league
trackLeagueCreated(newLeague.id);

// When user joins via invite code
trackLeagueJoined(league.id, 'invite_code');

// When league settings are configured
trackLeagueConfigured({
  leagueId: league.id,
  maxRosterSize: 25,
  scoringType: 'points',
  draftType: 'snake',
  teamCount: 10,
});
```

### Tracking Roster Management

```typescript
import { trackRosterAction } from '../utils/analytics';

// When player position changes
trackRosterAction('position_change', {
  leagueId: league.id,
  playerId: player.id,
  fromPosition: 'Bench',
  toPosition: 'Starting Pitcher',
});

// When dropping a player
trackRosterAction('drop', {
  leagueId: league.id,
  playerId: player.id,
});
```

### Tracking Page Views and Navigation

```typescript
import {
  trackMatchupViewed,
  trackAnalyticsViewed,
  trackTeamViewed,
} from '../utils/analytics';

// In matchup detail page
trackMatchupViewed(matchup.id, league.id, matchup.weekNumber);

// In analytics page with tab selection
trackAnalyticsViewed(league.id, 'power');

// In team detail page
trackTeamViewed(team.id, league.id);
```

### Tracking Search Activity

```typescript
import { trackSearch } from '../utils/analytics';

// When user searches for players
const results = searchPlayers(query);
trackSearch(query, results.length, 'players');
```

### Error Tracking

```typescript
import { trackError } from '../utils/analytics';

try {
  // Some operation
} catch (error) {
  trackError('api_error', error.message, {
    endpoint: '/api/leagues',
    league_id: leagueId,
  });
  // Also send to Sentry
  captureError(error);
}
```

### Performance Timing

```typescript
import { trackTiming } from '../utils/analytics';

const startTime = performance.now();
// Perform operation
const data = await fetchLeagueData(leagueId);
const duration = performance.now() - startTime;

trackTiming('api_call', 'fetch_league_data', duration);
```

### Tracking Custom Events in Components

```typescript
import { trackEvent } from '../utils/analytics';

function MyComponent() {
  const handleButtonClick = () => {
    trackEvent('custom_action', {
      category: 'user_interaction',
      label: 'My Button',
    });
  };

  return <button onClick={handleButtonClick}>Click Me</button>;
}
```

### Tracking User Properties (Legacy)

```typescript
import { setUserId } from '../utils/analytics';

// Set user ID after successful authentication
setUserId(user.id);
```

## Implementation Details

### Files Modified

1. **`apps/web/src/config/environment.ts`**
   - Added `googleAnalyticsMeasurementId` to environment configuration

2. **`apps/web/index.html`**
   - Added comment for Google Analytics (script loaded dynamically)

3. **`apps/web/src/utils/analytics.ts`** (New)
   - Core analytics utility with tracking functions

4. **`apps/web/src/hooks/usePageTracking.ts`** (New)
   - React hook for automatic page view tracking

5. **`apps/web/src/main.tsx`**
   - Initialize analytics on app startup
   - Track login events

6. **`apps/web/src/app/app.tsx`**
   - Integrate automatic page view tracking

## Privacy & GDPR Compliance

### Current Implementation

- Analytics only loads in production when configured
- No tracking in development mode
- Uses secure cookie flags (`SameSite=None;Secure`)

### Future Enhancements (Recommended)

For full GDPR compliance, consider implementing:

1. **Cookie Consent Banner**
   - Display cookie notice before initializing analytics
   - Store user consent preference
   - Only load GA4 after user accepts

2. **IP Anonymization** (GA4 does this by default)
   - Already enabled in GA4 properties

3. **User Opt-Out**
   ```typescript
   // Disable analytics
   window['ga-disable-G-XXXXXXXXXX'] = true;
   ```

## Monitoring

### Verify Analytics are Working

1. **Real-time Reports**
   - Go to Google Analytics → Reports → Realtime
   - Navigate through your app
   - Check if page views appear

2. **Browser Console**
   - Look for `[Analytics]` log messages
   - Verify gtag.js script loaded
   - Check dataLayer array in console

3. **GA Debugger Chrome Extension**
   - Install [Google Analytics Debugger](https://chrome.google.com/webstore/detail/google-analytics-debugger/jnkmfdileelhofjcijamephohjechhna)
   - Enable and check console for detailed GA logs

## Troubleshooting

### Analytics Not Loading

1. **Check Environment Variable**

   ```typescript
   console.log(import.meta.env.VITE_GA_MEASUREMENT_ID);
   ```

2. **Check Console Logs**
   - Look for `[Analytics] Google Analytics initialized`
   - Verify no errors loading gtag.js

3. **Check Network Tab**
   - Look for requests to `googletagmanager.com`
   - Verify gtag.js script loads successfully

4. **Verify Not in Dev Mode**
   - Analytics are disabled when `isDev: true`
   - Check `import.meta.env.DEV`

## Additional Resources

- [GA4 Documentation](https://developers.google.com/analytics/devguides/collection/ga4)
- [gtag.js Reference](https://developers.google.com/tag-platform/gtagjs/reference)
- [Recommended Events](https://developers.google.com/analytics/devguides/collection/ga4/reference/events)

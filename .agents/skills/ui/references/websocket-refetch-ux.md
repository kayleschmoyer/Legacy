# WebSocket Refetch UX

> **When to apply:** Adding or modifying any WebSocket event handler that calls `refetch()`, creating pages that subscribe to WebSocket events, or debugging pages that "flash" or go blank on real-time updates.

## Overview

When a WebSocket notification arrives (draft completed, roster update, matchup stats, etc.), the page typically calls Apollo `refetch()` to pull fresh data. If done naively, this **replaces the entire page with a spinner** for the duration of the network request — a jarring experience that makes all content disappear and reappear.

## The Problem

Apollo's `useQuery` hook returns a `loading` boolean. By default, `loading` is only `true` during the initial fetch. However, if the query sets `notifyOnNetworkStatusChange: true`, Apollo also sets `loading = true` during **refetches** (network status 4).

If the page has a loading guard like:

```tsx
// BAD — triggers on every refetch, not just initial load
if (loading || positionsLoading || teamMembersLoading) {
  return <Spinner />;
}
```

...then every WebSocket-triggered refetch replaces the entire page with a spinner.

## Rules

### 1. Never use `notifyOnNetworkStatusChange: true` on queries that feed a full-page loading guard

```tsx
// BAD
const { data, loading } = useGetLeagueByIdQuery({
  variables: { id: leagueId },
  notifyOnNetworkStatusChange: true,
});

// GOOD — loading only fires on initial fetch
const { data, loading } = useGetLeagueByIdQuery({
  variables: { id: leagueId },
});
```

### 2. Guard on `loading && !data` (initial load only)

Even without `notifyOnNetworkStatusChange`, be defensive. The `!data` check ensures cached data stays visible during any refetch:

```tsx
// GOOD — full-page spinner only when there's no data at all
const initialLoading =
  (loading && !data) || positionsLoading || teamMembersLoading;

if (initialLoading) {
  return <FullPageSpinner />;
}
```

### 3. Don't clear Redux/state before a refetch

Clearing cached state (e.g., `dispatch(setTeamMembers([]))`) before the refetch completes causes dependent `skip` guards to re-trigger and dependent loading flags to flip `true`, producing the same full-page spinner flash.

```tsx
// BAD — clears data, triggers teamMembersLoading
const handleDraftCompleted = useCallback(() => {
  void refetchLeague();
  dispatch(setTeamMembers([]));
  void refetchTeamMembers();
}, [refetchLeague, dispatch]);

// GOOD — let new data replace old seamlessly
const handleDraftCompleted = useCallback(() => {
  void backgroundRefetch();
  void refetchTeamMembers();
}, [backgroundRefetch]);
```

### 4. Track `isRefreshing` separately for a subtle UI indicator

Wrap `refetch()` in a helper that manages its own state so you can show a non-intrusive "Updating..." banner:

```tsx
const [isRefreshing, setIsRefreshing] = useState(false);

const backgroundRefetch = useCallback(async () => {
  setIsRefreshing(true);
  try {
    await refetchLeague();
  } finally {
    setIsRefreshing(false);
  }
}, [refetchLeague]);
```

Then use it in every WebSocket handler:

```tsx
const handleRosterUpdate = useCallback(() => {
  void backgroundRefetch();
}, [backgroundRefetch]);
```

### 5. Show a subtle refresh indicator

Place a small banner at the top of the page (below the `<PageContainer>` but above the hero/header) that appears only during background refetches:

```tsx
{
  isRefreshing && (
    <XStack
      alignItems="center"
      justifyContent="center"
      gap="$2"
      paddingVertical="$1.5"
      backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
      animation="quick"
      enterStyle={{ opacity: 0, y: -8 }}
      exitStyle={{ opacity: 0, y: -8 }}
      role="status"
      aria-live="polite"
    >
      <Spinner size="small" color={BRAND_NAVY_LIGHT} />
      <Text fontSize="$2" fontWeight="600" color={BRAND_NAVY_LIGHT}>
        Updating...
      </Text>
    </XStack>
  );
}
```

## Checklist for New Pages

When adding WebSocket subscriptions to a page:

- [ ] Query does **not** use `notifyOnNetworkStatusChange: true`
- [ ] Full-page loading guard checks `loading && !data`, not bare `loading`
- [ ] WebSocket handlers call `backgroundRefetch()`, not raw `refetch()`
- [ ] No state is cleared (Redux or local) before the refetch resolves
- [ ] A subtle "Updating..." indicator is shown during background refetches
- [ ] Reconnect catch-up refetches also use `backgroundRefetch()`

## Reference Implementation

See `apps/web/src/pages/baseball/LeagueDetailPage.tsx` (LS-394) for the canonical implementation of this pattern.

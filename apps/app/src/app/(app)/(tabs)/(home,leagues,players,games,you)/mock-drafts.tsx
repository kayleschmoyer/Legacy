import React, { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import {
  MockDraftsHub,
  type MockDraftsHubTab,
} from '@legacy-sports/shared-components/draft';

const TABS: readonly MockDraftsHubTab[] = ['join', 'mine', 'invites'];

/**
 * The Mock Drafts hub (LS-10079): join a public lobby, resume or review your
 * own mock drafts, and answer invites. Mirrors web `/mock-drafts`;
 * `?tab=mine|invites` opens a tab directly.
 */
export default function MockDraftsHubScreen(): React.JSX.Element {
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const initialTab = TABS.find((t) => t === tab) ?? 'join';

  // Refetch the open tab each time the screen regains focus — e.g. coming
  // back from a lobby — so seat counts and statuses are current.
  const [refreshKey, setRefreshKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setRefreshKey((k) => k + 1);
    }, []),
  );

  return (
    <ScrollView
      testID="mock-drafts-page"
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <MockDraftsHub
        initialTab={initialTab}
        refreshKey={refreshKey}
        onOpenDraft={(target) =>
          router.push({
            pathname: '/mock-draft/[draftId]',
            params: { draftId: String(target.draftId) },
          })
        }
        onInviteAccepted={(target) => {
          if (target.kind === 'mock') {
            router.push({
              pathname: '/mock-draft/[draftId]',
              params: { draftId: String(target.draftId) },
            });
          } else {
            router.push(`/${target.sport}/league/${String(target.leagueId)}`);
          }
        }}
        onCreateMockDraft={() => router.push('/baseball/mock-draft')}
      />
    </ScrollView>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../../_screenErrorBoundary';

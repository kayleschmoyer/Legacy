import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MockDraftsHub,
  type MockDraftsHubTab,
} from '@legacy-sports/shared-components/draft';
import { PageMeta } from '../../components/PageMeta';
import { joinedTargetPath } from '../join/joinedTargetPath';

const TABS: readonly MockDraftsHubTab[] = ['join', 'mine', 'invites'];

/**
 * The Mock Drafts hub, /mock-drafts (LS-10079): join a public lobby, resume
 * or review your own mock drafts, and answer invites. `?tab=mine|invites`
 * deep-links a tab.
 */
export function MockDraftsHubPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab = TABS.find((t) => t === tabParam) ?? 'join';

  // The browser refetches the open tab whenever the window regains focus, so
  // seat counts are fresh without a live subscription.
  const [refreshKey, setRefreshKey] = React.useState(0);
  React.useEffect(() => {
    const onFocus = () => setRefreshKey((k) => k + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  return (
    <>
      <PageMeta
        title="Mock Drafts"
        description="Join a public mock draft, pick up your own mock drafts, and answer draft invites."
      />
      <MockDraftsHub
        initialTab={initialTab}
        refreshKey={refreshKey}
        onOpenDraft={(target) =>
          navigate(`/${target.sport}/mock-draft/${String(target.draftId)}`)
        }
        onInviteAccepted={(target) => navigate(joinedTargetPath(target))}
        // The setup page picks its sport itself; football is an option there.
        onCreateMockDraft={() => navigate('/baseball/mock-draft')}
      />
    </>
  );
}

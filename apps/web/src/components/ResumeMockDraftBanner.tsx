/**
 * Web wiring for the shared "Resume your mock draft" banner (LS-10465).
 *
 * Loads `myActiveMockDrafts` and sends the user back to the chosen draft's
 * room at `/:sport/mock-draft/:draftId`. Shown on the mock-draft setup page
 * and the minigames hub; renders nothing while loading, on error, or when the
 * user has nothing to resume.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sport, useGetMyActiveMockDraftsQuery } from '@legacy-sports/graphql';
import { YStack } from '@legacy-sports/shared-components/ui';
import {
  type ResumableMockDraft,
  ResumeMockDraftBanner as SharedResumeMockDraftBanner,
} from '@legacy-sports/shared-components/draft';

interface ResumeMockDraftBannerProps {
  /** Spacing below the banner, applied only when it renders. */
  marginBottom?: React.ComponentProps<typeof YStack>['marginBottom'];
}

export function ResumeMockDraftBanner({
  marginBottom,
}: ResumeMockDraftBannerProps): React.JSX.Element | null {
  const navigate = useNavigate();
  // `cache-and-network` so returning to the page after leaving a draft (or
  // after it finished) drops it from the list.
  const { data } = useGetMyActiveMockDraftsQuery({
    fetchPolicy: 'cache-and-network',
  });

  const drafts: ResumableMockDraft[] = (data?.myActiveMockDrafts ?? []).flatMap(
    (d) =>
      d.draftId != null && d.status != null
        ? [
            {
              draftId: d.draftId,
              sport: d.sport === Sport.Football ? 'football' : 'baseball',
              status: d.status,
              isHost: d.isHost === true,
              totalSeats: d.totalSeats ?? 0,
            },
          ]
        : [],
  );

  if (drafts.length === 0) return null;

  return (
    <YStack marginBottom={marginBottom}>
      <SharedResumeMockDraftBanner
        drafts={drafts}
        onResume={(draft) =>
          navigate(`/${draft.sport}/mock-draft/${String(draft.draftId)}`)
        }
      />
    </YStack>
  );
}

/**
 * ResumeMockDraftBanner — "Resume your mock draft" (LS-10465).
 *
 * Lists the caller's unfinished mock drafts (lobbies and live drafts they host
 * or sit in) so a user who navigated away from the draft room — or lost the
 * in-memory invite card between setup and room — can get back in.
 *
 * Pure presentational, cross-platform (Tamagui only) — consumers own the
 * `myActiveMockDrafts` query and navigation via `onResume`. Renders nothing
 * when there is nothing to resume.
 */
import React from 'react';
import { Button, Text, XStack, YStack } from 'tamagui';

export interface ResumableMockDraft {
  draftId: number;
  sport: 'baseball' | 'football';
  /** 'not-started' for a lobby; anything else is a live draft. */
  status: string;
  isHost: boolean;
  totalSeats: number;
}

export interface ResumeMockDraftBannerProps {
  drafts: readonly ResumableMockDraft[];
  onResume: (draft: ResumableMockDraft) => void;
}

const SPORT_LABEL: Record<ResumableMockDraft['sport'], string> = {
  baseball: 'Baseball',
  football: 'Football',
};

function describeDraft(draft: ResumableMockDraft): string {
  const stage = draft.status === 'not-started' ? 'lobby' : 'draft in progress';
  const role = draft.isHost ? 'Hosting' : 'Joined';
  return `${SPORT_LABEL[draft.sport]} ${stage} · ${String(draft.totalSeats)} teams · ${role}`;
}

export function ResumeMockDraftBanner({
  drafts,
  onResume,
}: ResumeMockDraftBannerProps): React.JSX.Element | null {
  if (drafts.length === 0) return null;

  return (
    <YStack
      testID="resume-mock-draft-banner"
      role="region"
      aria-label="Resume your mock draft"
      gap="$3"
      padding="$4"
      borderRadius="$5"
      backgroundColor="$surfacePanel"
      borderWidth={1}
      borderColor="$brandGold"
    >
      <Text
        fontFamily="$heading"
        fontSize={16}
        fontWeight="800"
        color="$brandGold"
      >
        Resume your mock draft
      </Text>
      {drafts.map((draft) => (
        <XStack
          key={draft.draftId}
          alignItems="center"
          justifyContent="space-between"
          gap="$3"
        >
          <Text color="$textMuted" fontSize={14} flexShrink={1}>
            {describeDraft(draft)}
          </Text>
          <Button
            size="$3"
            backgroundColor="$brandGold"
            pressStyle={{ scale: 0.98 }}
            onPress={() => onResume(draft)}
            aria-label={`Resume ${describeDraft(draft)}`}
          >
            <Text fontWeight="700" fontSize={13} color="$textOnAccent">
              Resume
            </Text>
          </Button>
        </XStack>
      ))}
    </YStack>
  );
}

import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CombinedGraphQLErrors } from '@apollo/client';
import { H1, ScrollView, Text, YStack } from 'tamagui';
import { JoinMockDraftForm } from '@legacy-sports/shared-components/draft';
import { LOGGER } from '@legacy-sports/logging';
import { useJoinMockDraftMutation } from '@legacy-sports/graphql';

/**
 * Join-by-code screen for a Shared mock draft lobby (LS-9181). Mirrors
 * league/join.tsx's shape but is scoped to mock drafts: no capacity/plan
 * gating applies to the joiner, and a successful join lands directly in the
 * draft room (which renders PreDraftLobby while the draft is 'not-started').
 */
export default function JoinMockDraftScreen(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams();
  const urlInviteCode = params.inviteCode as string | undefined;

  const [joinMockDraft, { loading }] = useJoinMockDraftMutation();
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (
    inviteCode: string,
    teamName: string,
  ): Promise<void> => {
    setError(null);
    try {
      const result = await joinMockDraft({
        variables: { inviteCode, teamName },
      });
      const leagueId = result.data?.joinMockDraft?.team?.leagueId;
      if (leagueId != null) {
        router.navigate({
          pathname: '/DraftBoardPage',
          params: { leagueId: String(leagueId) },
        });
      }
    } catch (err) {
      const caught = err instanceof Error ? err : new Error(String(err));
      setError(caught.message || 'Failed to join mock draft');
      const isUserInputError =
        CombinedGraphQLErrors.is(err) &&
        err.errors.some((e) => e.extensions?.['code'] === 'BAD_USER_INPUT');
      if (!isUserInputError) {
        LOGGER.error('Error joining mock draft', caught);
      }
    }
  };

  return (
    <ScrollView>
      <YStack
        flex={1}
        padding="$6"
        space="$4"
        maxWidth={600}
        alignSelf="center"
        width="100%"
      >
        <YStack space="$2">
          <H1 size="$9" color="$brandGold">
            🎟️ Join Mock Draft
          </H1>
          <Text color="$gray11" fontSize="$5">
            {urlInviteCode
              ? 'Your invite code has been pre-filled. Just enter your team name to join!'
              : "Enter the invite code shared by the draft's creator"}
          </Text>
        </YStack>

        <JoinMockDraftForm
          onSubmit={(code, teamName) => {
            void handleSubmit(code, teamName);
          }}
          onCancel={() => router.back()}
          loading={loading}
          error={error}
          initialInviteCode={urlInviteCode}
        />

        <Text color="$gray10" fontSize="$2" textAlign="center">
          Joining is free and doesn&apos;t count against your weekly mock draft
          limit.
        </Text>
      </YStack>
    </ScrollView>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';

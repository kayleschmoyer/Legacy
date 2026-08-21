import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CombinedGraphQLErrors } from '@apollo/client';
import { Text } from 'tamagui';
import { H1, Paragraph, YStack } from '@legacy-sports/shared-components/ui';
import { JoinMockDraftForm } from '@legacy-sports/shared-components/draft';
import { LOGGER } from '@legacy-sports/logging';
import { useJoinMockDraftMutation } from '@legacy-sports/graphql';
import { PageMeta } from '../../components/PageMeta';
import {
  BRAND_GOLD,
  GRADIENT_BOARD_BG,
  OVERLAY_WHITE_10,
  SURFACE_CARD,
} from '../../constants/colors';

/**
 * Join-by-code screen for a Shared mock draft lobby (LS-9181). Mirrors
 * JoinLeagueByCodePage's shape but is scoped to mock drafts: no capacity/plan
 * gating applies to the joiner, and a successful join lands directly in the
 * draft room (which renders PreDraftLobby while the draft is 'not-started').
 */
export function JoinMockDraftPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { inviteCode: urlInviteCode } = useParams<{ inviteCode?: string }>();
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
      const sport = result.data?.joinMockDraft?.sport;
      if (leagueId && sport) {
        // joinMockDraft returns the league's sport alongside the claimed team
        // (LS-9480) — the joiner reaches this page without ever choosing a
        // sport-specific route, so routing on the mutation result (rather
        // than a hardcoded/guessed sport) is what keeps FootballGate applied
        // to football joiners the same way it already applies to creators.
        navigate(`/${sport}/league/${leagueId}/draft`);
      } else {
        setError(
          'Joined the mock draft but navigation failed — please visit My Leagues.',
        );
        LOGGER.warn('joinMockDraft mutation returned no leagueId or sport', {
          data: result.data?.joinMockDraft,
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
    <YStack
      minHeight="100vh"
      alignItems="center"
      justifyContent="center"
      padding="$5"
      style={{ background: GRADIENT_BOARD_BG }}
    >
      <PageMeta
        title="Join a Mock Draft"
        description="Enter an invite code to join a friend's Shared mock draft."
      />
      <YStack width="100%" maxWidth={480}>
        <YStack alignItems="center" gap="$2" marginBottom="$6">
          <H1
            fontFamily="$display"
            fontSize={32}
            fontWeight="800"
            color={BRAND_GOLD}
            textAlign="center"
            margin={0}
          >
            Join Mock Draft
          </H1>
          <Paragraph
            fontFamily="$body"
            fontSize={14}
            color="$gray11"
            textAlign="center"
            margin={0}
          >
            {urlInviteCode
              ? 'Your invite code has been pre-filled. Just enter your team name to join!'
              : "Enter the invite code shared by the draft's creator"}
          </Paragraph>
        </YStack>

        <YStack
          backgroundColor={SURFACE_CARD}
          borderRadius="$6"
          padding="$6"
          borderWidth={1}
          borderColor={OVERLAY_WHITE_10}
        >
          <JoinMockDraftForm
            onSubmit={(code, teamName) => {
              void handleSubmit(code, teamName);
            }}
            onCancel={() => navigate('/baseball/mock-draft')}
            loading={loading}
            error={error}
            initialInviteCode={urlInviteCode}
          />
        </YStack>

        <Text
          fontFamily="$body"
          fontSize={12}
          color="$gray10"
          textAlign="center"
          marginTop="$4"
        >
          Joining is free and doesn't count against your weekly mock draft
          limit.
        </Text>
      </YStack>
    </YStack>
  );
}

export default JoinMockDraftPage;

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CombinedGraphQLErrors } from '@apollo/client';
import { Button, Card, XStack, YStack } from '@legacy-sports/shared-components';
import { H1, H2, Input, Spinner, Text } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import { PageMeta } from '../../components/PageMeta';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';
import {
  useJoinLeagueByCodeMutation,
  useValidateInviteCodeLazyQuery,
} from '../../api/db/graphql.generated';

export function JoinLeagueByCodePage(): React.JSX.Element {
  const navigate = useNavigate();
  const { inviteCode: urlInviteCode } = useParams<{ inviteCode?: string }>();
  const [inviteCode, setInviteCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Auto-fill invite code from URL parameter if present
  useEffect(() => {
    if (urlInviteCode) {
      setInviteCode(urlInviteCode.toUpperCase());
    }
  }, [urlInviteCode]);

  const [joinLeague, { loading }] = useJoinLeagueByCodeMutation();
  const [validateCode, { data: validateData, loading: validating }] =
    useValidateInviteCodeLazyQuery();

  // Validate the code against the server whenever it reaches 8 chars
  useEffect(() => {
    const code = inviteCode.trim().toUpperCase();
    const codePattern = /^[A-Z0-9]{8}$/;
    if (codePattern.test(code)) {
      void validateCode({ variables: { code } });
    }
  }, [inviteCode, validateCode]);

  const leagueInfo = validateData?.validateInviteCode;
  const isLeagueFull =
    leagueInfo?.isFull ??
    Boolean(
      error &&
      (error.toLowerCase().includes('league is full') ||
        error.toLowerCase().includes('all teams have been claimed')),
    );

  const handleJoin = async (): Promise<void> => {
    setError(null);

    // Validate inputs
    if (!inviteCode.trim()) {
      setError('Please enter an invite code');
      return;
    }

    if (!teamName.trim()) {
      setError('Please enter a team name');
      return;
    }

    // Validate invite code format (8 uppercase alphanumeric characters)
    const codePattern = /^[A-Z0-9]{8}$/;
    if (!codePattern.test(inviteCode.trim().toUpperCase())) {
      setError('Invite code must be 8 characters (letters and numbers only)');
      return;
    }

    try {
      const result = await joinLeague({
        variables: {
          inviteCode: inviteCode.trim().toUpperCase(),
          teamName: teamName.trim(),
        },
      });

      const leagueId = result.data?.joinLeagueByCode?.leagueId;
      if (leagueId) {
        navigate(`/baseball/league/${leagueId}`);
      } else {
        setError(
          'League joined but navigation failed — please visit My Leagues.',
        );
        LOGGER.warn('joinLeagueByCode mutation returned no leagueId', {
          data: result.data?.joinLeagueByCode,
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error.message || 'Failed to join league');
      // Only log unexpected errors to Rollbar. BAD_USER_INPUT errors (invalid
      // invite code, already a member, league full) are expected user-facing
      // conditions and should not generate error noise in error tracking.
      const isUserInputError =
        CombinedGraphQLErrors.is(err) &&
        err.errors.some((e) => e.extensions?.['code'] === 'BAD_USER_INPUT');
      if (!isUserInputError) {
        LOGGER.error('Error joining league', error);
      }
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleJoin();
  };

  return (
    <YStack
      flex={1}
      padding="$6"
      $sm={{ padding: '$3' }}
      space="$4"
      maxWidth={600}
      margin="auto"
      width="100%"
      role="main"
      aria-labelledby="join-league-title"
    >
      <PageMeta
        title="Join a League"
        description="Enter your invitation code to join a fantasy baseball league on Legacy Sports and start competing."
      />
      <YStack space="$2">
        <H1 size="$9" color={BRAND_GOLD_LIGHT} id="join-league-title">
          <span role="img" aria-label="ticket">
            🎟️
          </span>{' '}
          Join League
        </H1>
        <Text color="$gray11" fontSize="$5">
          {urlInviteCode
            ? 'Your invite code has been pre-filled. Just enter your team name to join!'
            : 'Enter the invite code shared by your league commissioner'}
        </Text>
      </YStack>

      {urlInviteCode && (
        <Card
          backgroundColor="$green2"
          borderColor="$green6"
          padding="$3"
          role="status"
          aria-live="polite"
        >
          <XStack gap="$2" alignItems="center">
            <Text fontSize="$4">
              <span role="img" aria-label="check">
                ✅
              </span>
            </Text>
            <Text color="$green11" fontSize="$3" fontWeight="600">
              Invite code loaded from link! Ready to join.
            </Text>
          </XStack>
        </Card>
      )}

      <Card
        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
        borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.35)}
        padding="$5"
      >
        <form
          onSubmit={handleFormSubmit}
          aria-describedby="join-form-help"
          aria-busy={loading}
        >
          <YStack space="$4">
            {/* Invite Code Input */}
            <YStack space="$2">
              <Text
                color="$gray12"
                fontWeight="600"
                fontSize="$4"
                id="invite-code-label"
              >
                Invite Code
              </Text>
              <label htmlFor="invite-code" className="sr-only">
                Invite Code
              </label>
              <Input
                placeholder="Enter 8-character code"
                value={inviteCode}
                onChangeText={(text: string) =>
                  setInviteCode(text.toUpperCase())
                }
                maxLength={8}
                autoCapitalize="characters"
                autoCorrect={false}
                fontFamily="$mono"
                fontSize="$6"
                letterSpacing={2}
                textAlign="center"
                backgroundColor="$background"
                borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.5)}
                disabled={loading}
                id="invite-code"
                aria-labelledby="invite-code-label"
                aria-describedby={`invite-code-help${error?.toLowerCase().includes('invite code') || error?.toLowerCase().includes('8') ? ' invite-code-error' : ''}`}
                aria-required="true"
                aria-invalid={Boolean(
                  error &&
                  (error.toLowerCase().includes('invite code') ||
                    error.toLowerCase().includes('8')),
                )}
                inputMode="text"
                autoComplete="off"
              />
              <Text color="$gray10" fontSize="$2" id="invite-code-help">
                Example: ABC12XYZ
              </Text>

              {/* Live invite code status */}
              {validating && (
                <XStack gap="$2" alignItems="center">
                  <Spinner size="small" color={BRAND_NAVY_LIGHT} />
                  <Text color="$gray10" fontSize="$2">
                    Checking code...
                  </Text>
                </XStack>
              )}
              {!validating &&
                leagueInfo &&
                (leagueInfo.isFull ? (
                  <Text
                    color="$orange10"
                    fontSize="$2"
                    fontWeight="600"
                    data-testid="invite-status-full"
                  >
                    <span role="img" aria-label="no entry">
                      🚫
                    </span>{' '}
                    League full &mdash; all {leagueInfo.totalSpots} spots taken
                  </Text>
                ) : (
                  <Text
                    color="$green10"
                    fontSize="$2"
                    fontWeight="600"
                    data-testid="invite-status-available"
                  >
                    <span role="img" aria-label="check mark">
                      ✅
                    </span>{' '}
                    {leagueInfo.leagueName} &mdash; {leagueInfo.availableSpots}{' '}
                    of {leagueInfo.totalSpots} spot
                    {leagueInfo.availableSpots !== 1 ? 's' : ''} available
                  </Text>
                ))}
              {!validating && !leagueInfo && inviteCode.trim().length === 8 && (
                <Text color="$red10" fontSize="$2" fontWeight="600">
                  <span role="img" aria-label="error">
                    ❌
                  </span>{' '}
                  Invalid invite code
                </Text>
              )}
            </YStack>

            {/* Team Name Input */}
            <YStack space="$2">
              <Text
                color="$gray12"
                fontWeight="600"
                fontSize="$4"
                id="team-name-label"
              >
                Team Name
              </Text>
              <label htmlFor="team-name" className="sr-only">
                Team Name
              </label>
              <Input
                placeholder="Enter your team name"
                value={teamName}
                onChangeText={setTeamName}
                maxLength={50}
                backgroundColor="$background"
                borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.5)}
                disabled={loading}
                id="team-name"
                data-testid="team-name"
                aria-labelledby="team-name-label"
                aria-describedby={`team-name-help${error?.toLowerCase().includes('team name') ? ' team-name-error' : ''}`}
                aria-required="true"
                aria-invalid={Boolean(
                  error && error.toLowerCase().includes('team name'),
                )}
                inputMode="text"
                autoComplete="off"
              />
              <Text color="$gray10" fontSize="$2" id="team-name-help">
                Choose a unique name for your team
              </Text>
            </YStack>

            {/* League Full Banner */}
            {isLeagueFull && (
              <Card
                data-testid="alert-league-full"
                backgroundColor="$orange2"
                borderColor="$orange6"
                padding="$4"
                role="alert"
                aria-live="assertive"
              >
                <YStack space="$2">
                  <Text color="$orange11" fontSize="$4" fontWeight="700">
                    <span role="img" aria-label="no entry">
                      🚫
                    </span>{' '}
                    This league is full
                  </Text>
                  <Text color="$orange11" fontSize="$3">
                    All teams have already been claimed. Contact the league
                    commissioner for assistance.
                  </Text>
                </YStack>
              </Card>
            )}

            {/* Error Message */}
            {error && !isLeagueFull && (
              <Card
                data-testid="join-form-error"
                backgroundColor="$red2"
                borderColor="$red6"
                padding="$3"
                role="alert"
                aria-live="assertive"
              >
                <Text
                  color="$red11"
                  fontSize="$3"
                  id={
                    error.toLowerCase().includes('invite code') ||
                    error.toLowerCase().includes('8')
                      ? 'invite-code-error'
                      : error.toLowerCase().includes('team name')
                        ? 'team-name-error'
                        : 'form-error'
                  }
                >
                  <span role="img" aria-label="error">
                    ❌
                  </span>{' '}
                  {error}
                </Text>
              </Card>
            )}

            {/* Submit Button */}
            <XStack gap="$3" justifyContent="flex-end">
              <Button
                backgroundColor="$gray6"
                color="$gray11"
                onPress={() => navigate('/baseball')}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                backgroundColor={BRAND_NAVY_LIGHT}
                color="white"
                onPress={() => void handleJoin()}
                disabled={
                  loading ||
                  validating ||
                  !inviteCode.trim() ||
                  !teamName.trim() ||
                  !leagueInfo ||
                  isLeagueFull
                }
                minWidth={150}
                aria-label="Join league"
              >
                {loading ? (
                  <XStack gap="$2" alignItems="center">
                    <Spinner size="small" color="white" />
                    <Text color="white">Joining...</Text>
                  </XStack>
                ) : (
                  'Join League'
                )}
              </Button>
            </XStack>
          </YStack>
        </form>
      </Card>

      {/* Info Card */}
      <Card backgroundColor="$purple2" borderColor="$purple6" padding="$4">
        <YStack space="$2">
          <H2 size="$5" color="$purple11">
            <span role="img" aria-label="lightbulb">
              💡
            </span>{' '}
            How It Works
          </H2>
          <Text color="$gray11" fontSize="$3">
            • Get an invite code from your league's commissioner
          </Text>
          <Text color="$gray11" fontSize="$3">
            • Enter the 8-character code above
          </Text>
          <Text color="$gray11" fontSize="$3">
            • Choose a team name for your league entry
          </Text>
          <Text color="$gray11" fontSize="$3">
            • You'll be added to the league and can start managing your team!
          </Text>
        </YStack>
      </Card>
    </YStack>
  );
}

export default JoinLeagueByCodePage;

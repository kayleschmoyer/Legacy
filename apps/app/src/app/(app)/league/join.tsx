import React, { useEffect, useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CombinedGraphQLErrors } from '@apollo/client';
import { LOGGER } from '@legacy-sports/logging';
import {
  Button,
  Card,
  H1,
  H2,
  Input,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  Sport,
  useGetPublicLeaguesQuery,
  useJoinLeagueByCodeMutation,
  useJoinPublicLeagueMutation,
  useValidateInviteCodeLazyQuery,
  type ValidateInviteCodeQuery,
} from '@legacy-sports/graphql';
import { useSubscription } from '../../../features/subscription/useSubscription';

type SportChoice = 'baseball' | 'football';

const QUICK_JOIN_LIMIT = 3;

/**
 * Premium-only shortcut to join an open public league without typing an
 * invite code. Reuses the Team Name field already on the Join screen, so a
 * premium user only has to name their team and tap Quick Join (LS-6290).
 */
function QuickJoinPanel({
  sport,
  teamName,
  onRequireTeamName,
  onJoined,
}: {
  sport: SportChoice;
  teamName: string;
  onRequireTeamName: () => void;
  onJoined: (leagueId: number) => void;
}): React.JSX.Element | null {
  const { data, loading } = useGetPublicLeaguesQuery({
    variables: {
      sport: sport === 'football' ? Sport.Football : Sport.Baseball,
      limit: QUICK_JOIN_LIMIT,
    },
    fetchPolicy: 'cache-and-network',
  });
  const [joinPublicLeague, { loading: joining }] =
    useJoinPublicLeagueMutation();
  const [joiningLeagueId, setJoiningLeagueId] = useState<number | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const leagues = (data?.publicLeagues ?? []).filter(
    (league): league is typeof league & { id: number } =>
      league.id != null && !league.isFull && !league.isAlreadyMember,
  );

  const handleQuickJoin = async (leagueId: number): Promise<void> => {
    if (!teamName.trim()) {
      onRequireTeamName();
      return;
    }
    setJoinError(null);
    setJoiningLeagueId(leagueId);
    try {
      const result = await joinPublicLeague({
        variables: { leagueId, teamName: teamName.trim() },
      });
      if (result.data?.joinPublicLeague?.success) {
        onJoined(leagueId);
      } else {
        setJoinError(
          result.data?.joinPublicLeague?.message ?? 'Failed to join league',
        );
      }
    } catch (err) {
      LOGGER.error(
        'Quick Join failed',
        err instanceof Error ? err : new Error(String(err)),
      );
      setJoinError(
        err instanceof Error ? err.message : 'Failed to join league',
      );
    } finally {
      setJoiningLeagueId(null);
    }
  };

  if (loading || leagues.length === 0) return null;

  return (
    <Card
      backgroundColor="$surfaceInteractive"
      borderColor="$brandGoldLight"
      borderWidth={1}
      padding="$4"
      testID="quick-join-panel"
    >
      <YStack space="$3">
        <XStack alignItems="center" space="$2">
          <Text
            fontSize="$4"
            accessibilityRole="image"
            accessibilityLabel="lightning bolt"
          >
            ⚡
          </Text>
          <H2 size="$5" color="$brandGoldLight">
            Quick Join
          </H2>
          <Text
            color="$brandGold"
            fontSize="$1"
            fontWeight="700"
            backgroundColor="$brandNavyLight"
            paddingHorizontal="$2"
            paddingVertical={2}
            borderRadius="$2"
          >
            PREMIUM
          </Text>
        </XStack>
        <Text color="$gray11" fontSize="$3">
          Jump straight into an open public league — no invite code needed.
        </Text>
        {leagues.map((league) => (
          <XStack
            key={league.id}
            justifyContent="space-between"
            alignItems="center"
            padding="$3"
            backgroundColor="$background"
            borderRadius="$3"
            testID={`quick-join-league-${league.id}`}
          >
            <YStack flex={1} paddingRight="$2">
              <Text fontWeight="600" fontSize="$4">
                {league.name ?? 'Unknown League'}
              </Text>
              <Text color="$gray10" fontSize="$2">
                {league.availableSpots ?? 0} of {league.totalSpots ?? 0} spots
                available
              </Text>
            </YStack>
            <Button
              size="$3"
              backgroundColor="$brandNavyLight"
              color="white"
              disabled={joining && joiningLeagueId === league.id}
              onPress={() => void handleQuickJoin(league.id)}
            >
              {joining && joiningLeagueId === league.id
                ? 'Joining...'
                : 'Quick Join'}
            </Button>
          </XStack>
        ))}
        {joinError && (
          <Text color="$red10" fontSize="$2" fontWeight="600">
            ❌ {joinError}
          </Text>
        )}
      </YStack>
    </Card>
  );
}

function SportSelector({
  value,
  onChange,
  disabled,
}: {
  value: SportChoice;
  onChange: (s: SportChoice) => void;
  disabled: boolean;
}): React.JSX.Element {
  return (
    <YStack space="$2">
      <Text color="$gray12" fontWeight="600" fontSize="$4">
        Sport *
      </Text>
      <XStack space="$3">
        {(
          [
            { sport: 'baseball' as const, label: '⚾ Baseball' },
            { sport: 'football' as const, label: '🏈 Football' },
          ] as const
        ).map(({ sport, label }) => {
          const selected = value === sport;
          return (
            <Button
              key={sport}
              flex={1}
              size="$4"
              onPress={() => onChange(sport)}
              disabled={disabled}
              backgroundColor={selected ? '$brandNavyLight' : '$color2'}
              borderColor={selected ? '$brandNavyLight' : '$borderColor'}
              borderWidth={selected ? 2 : 1}
              elevation={selected ? 3 : 1}
              pressStyle={{ scale: 0.95 }}
              testID={`sport-selector-${sport}`}
              accessibilityRole="button"
              accessibilityLabel={`Select ${label}`}
            >
              <Text
                color={selected ? '$brandGold' : '$color'}
                fontWeight={selected ? '700' : '500'}
                fontSize="$4"
              >
                {label}
              </Text>
            </Button>
          );
        })}
      </XStack>
    </YStack>
  );
}

export default function JoinLeagueScreen(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams();
  const urlInviteCode = params.inviteCode as string | undefined;

  const [sport, setSport] = useState<SportChoice>('baseball');
  const [inviteCode, setInviteCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (urlInviteCode) {
      setInviteCode(urlInviteCode.toUpperCase());
    }
  }, [urlInviteCode]);

  const [joinLeague, { loading }] = useJoinLeagueByCodeMutation();
  const [validateCode, { loading: validating }] =
    useValidateInviteCodeLazyQuery();
  const { isPremium } = useSubscription();

  const validationVersionRef = useRef(0);
  const [leagueInfo, setLeagueInfo] =
    useState<ValidateInviteCodeQuery['validateInviteCode']>(undefined);
  const [validateError, setValidateError] = useState<unknown>(undefined);

  useEffect(() => {
    const code = inviteCode.trim().toUpperCase();
    const codePattern = /^[A-Z0-9]{8}$/;

    if (!codePattern.test(code)) {
      setLeagueInfo(undefined);
      setValidateError(undefined);
      return;
    }

    const version = ++validationVersionRef.current;
    const timer = setTimeout(() => {
      void validateCode({ variables: { code } }).then((result) => {
        if (validationVersionRef.current === version) {
          setLeagueInfo(result.data?.validateInviteCode ?? undefined);
          setValidateError(result.error);
        }
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [inviteCode, validateCode]);

  // validateInviteCode requires an authenticated caller and throws
  // UNAUTHENTICATED for anonymous callers — an expected condition (e.g. a
  // session that expired while this screen was open), not a bad code
  // (LS-8846). Derived from extensions.code, never from the error message.
  const isAuthRequiredError =
    CombinedGraphQLErrors.is(validateError) &&
    validateError.errors.some(
      (e) =>
        (e.extensions?.['code'] as string | undefined) === 'UNAUTHENTICATED',
    );

  const handleSignIn = (): void => {
    router.navigate('/login');
  };

  const isLeagueFull =
    leagueInfo?.isFull ??
    Boolean(
      error &&
      (error.toLowerCase().includes('league is full') ||
        error.toLowerCase().includes('all teams have been claimed')),
    );

  const handleSubmit = async () => {
    setError(null);

    if (!inviteCode.trim()) {
      setError('Please enter an invite code');
      return;
    }
    if (!teamName.trim()) {
      setError('Please enter a team name');
      return;
    }

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

      if (result.data?.joinLeagueByCode?.leagueId) {
        const leagueId = result.data.joinLeagueByCode.leagueId;
        router.navigate(
          sport === 'football'
            ? `/football/league/${leagueId}`
            : `/baseball/league/${leagueId}`,
        );
      }
    } catch (err) {
      LOGGER.error(
        'Failed to join league',
        err instanceof Error ? err : new Error(String(err)),
      );
      setError(err instanceof Error ? err.message : 'Failed to join league');
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
            🎟️ Join League
          </H1>
          <Text color="$gray11" fontSize="$5">
            {urlInviteCode
              ? 'Your invite code has been pre-filled. Just enter your team name to join!'
              : 'Enter the invite code shared by your league commissioner'}
          </Text>
        </YStack>

        {urlInviteCode && (
          <Card backgroundColor="$green2" borderColor="$green6" padding="$3">
            <XStack gap="$2" alignItems="center">
              <Text fontSize="$4">✅</Text>
              <Text color="$green11" fontSize="$3" fontWeight="600">
                Invite code loaded! Ready to join.
              </Text>
            </XStack>
          </Card>
        )}

        {isPremium && (
          <QuickJoinPanel
            sport={sport}
            teamName={teamName}
            onRequireTeamName={() =>
              setError('Please enter a team name to Quick Join')
            }
            onJoined={(leagueId) => {
              router.navigate(
                sport === 'football'
                  ? `/football/league/${leagueId}`
                  : `/baseball/league/${leagueId}`,
              );
            }}
          />
        )}

        <Card
          backgroundColor="$background"
          borderColor="$borderColor"
          padding="$5"
        >
          <YStack space="$4">
            {/* Sport Selector */}
            <SportSelector
              value={sport}
              onChange={setSport}
              disabled={loading}
            />

            {/* Invite Code Input */}
            <YStack space="$2">
              <Text color="$gray12" fontWeight="600" fontSize="$4">
                Invite Code
              </Text>
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
                disabled={loading}
              />
              <Text color="$gray10" fontSize="$2">
                Example: ABC12XYZ
              </Text>

              {validating && (
                <XStack gap="$2" alignItems="center">
                  <Spinner size="small" color="$brandNavyLight" />
                  <Text color="$gray10" fontSize="$2">
                    Checking code...
                  </Text>
                </XStack>
              )}
              {!validating && leagueInfo && !leagueInfo.isFull && (
                <Text color="$green10" fontSize="$2" fontWeight="600">
                  ✅ {leagueInfo.leagueName} — {leagueInfo.availableSpots} of{' '}
                  {leagueInfo.totalSpots} spot
                  {leagueInfo.availableSpots !== 1 ? 's' : ''} available
                </Text>
              )}
              {!validating && leagueInfo?.isFull && (
                <Text color="$orange10" fontSize="$2" fontWeight="600">
                  🚫 League full — all {leagueInfo.totalSpots} spots taken
                </Text>
              )}
              {!validating && isAuthRequiredError && (
                <YStack space="$2">
                  <Text color="$orange10" fontSize="$2" fontWeight="600">
                    🔒 Sign in to check this invite — this isn&apos;t a problem
                    with your code.
                  </Text>
                  <Button
                    size="$2"
                    alignSelf="flex-start"
                    backgroundColor="$brandNavyLight"
                    color="white"
                    onPress={handleSignIn}
                  >
                    Sign In
                  </Button>
                </YStack>
              )}
              {!validating &&
                !isAuthRequiredError &&
                !leagueInfo &&
                inviteCode.trim().length === 8 && (
                  <Text color="$red10" fontSize="$2" fontWeight="600">
                    ❌ Invalid invite code
                  </Text>
                )}
            </YStack>

            {/* Team Name Input */}
            <YStack space="$2">
              <Text color="$gray12" fontWeight="600" fontSize="$4">
                Team Name
              </Text>
              <Input
                placeholder="Enter your team name"
                value={teamName}
                onChangeText={setTeamName}
                maxLength={50}
                disabled={loading}
              />
              <Text color="$gray10" fontSize="$2">
                Choose a unique name for your team
              </Text>
            </YStack>

            {/* League Full Banner */}
            {isLeagueFull && (
              <Card
                backgroundColor="$orange2"
                borderColor="$orange6"
                padding="$4"
              >
                <YStack space="$2">
                  <Text color="$orange11" fontSize="$4" fontWeight="700">
                    🚫 This league is full
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
              <Card backgroundColor="$red2" borderColor="$red6" padding="$3">
                <Text color="$red11" fontSize="$3">
                  ❌ {error}
                </Text>
              </Card>
            )}

            {/* Buttons */}
            <XStack gap="$3" justifyContent="flex-end">
              <Button
                backgroundColor="$gray6"
                color="$gray11"
                onPress={() => router.back()}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                backgroundColor="$brandNavyLight"
                color="white"
                onPress={() => void handleSubmit()}
                disabled={
                  loading ||
                  !inviteCode.trim() ||
                  !teamName.trim() ||
                  isLeagueFull
                }
                minWidth={150}
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
        </Card>

        {/* How It Works */}
        <Card
          backgroundColor="$surfaceInteractive"
          borderColor="$outlineSubtle"
          padding="$4"
        >
          <YStack space="$2">
            <H2 size="$5" color="$brandGoldLight">
              💡 How It Works
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
    </ScrollView>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';

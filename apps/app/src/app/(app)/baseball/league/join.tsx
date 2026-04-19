/* eslint-disable @typescript-eslint/no-unsafe-assignment -- legacy mobile code pending type improvements */
/* eslint-disable @typescript-eslint/no-unsafe-call -- legacy mobile code pending type improvements */
/* eslint-disable @typescript-eslint/no-unsafe-member-access -- legacy mobile code pending type improvements */
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  useJoinLeagueByCodeMutation,
  useValidateInviteCodeLazyQuery,
  type ValidateInviteCodeQuery,
} from '../../../../api/db/graphql.generated';

const BRAND_NAVY_LIGHT = '#2C4A7C';
const BRAND_GOLD_LIGHT = '#C5A55A';

export default function JoinLeagueByCodeScreen(): React.JSX.Element {
  const router = useRouter();

  const params = useLocalSearchParams();

  const urlInviteCode = params.inviteCode as string | undefined;

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

  const validationVersionRef = useRef(0);
  const [leagueInfo, setLeagueInfo] =
    useState<ValidateInviteCodeQuery['validateInviteCode']>(undefined);

  useEffect(() => {
    const code = inviteCode.trim().toUpperCase();
    const codePattern = /^[A-Z0-9]{8}$/;

    if (!codePattern.test(code)) {
      setLeagueInfo(undefined);
      return;
    }

    const version = ++validationVersionRef.current;
    const timer = setTimeout(() => {
      void validateCode({ variables: { code } }).then((result) => {
        if (validationVersionRef.current === version) {
          setLeagueInfo(result.data?.validateInviteCode ?? undefined);
        }
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [inviteCode, validateCode]);

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
        // Navigate to the joined league
        router.navigate(
          `/baseball/league/${result.data.joinLeagueByCode.leagueId}`,
        );
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to join league');
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
          <H1 size="$9" color={BRAND_GOLD_LIGHT}>
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

        <Card
          backgroundColor="$background"
          borderColor="$borderColor"
          padding="$5"
        >
          <YStack space="$4">
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
                  <Spinner size="small" color={BRAND_NAVY_LIGHT} />
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
              {!validating && !leagueInfo && inviteCode.trim().length === 8 && (
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
                backgroundColor={BRAND_NAVY_LIGHT}
                color="white"
                onPress={handleSubmit}
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
        <Card backgroundColor="$purple2" borderColor="$purple6" padding="$4">
          <YStack space="$2">
            <H2 size="$5" color="$purple11">
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

import React, { useState } from 'react';
import {
  Button,
  Card,
  H1,
  H2,
  Input,
  ScrollView,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { DateTimePicker } from '@legacy-sports/shared-components';
import { LOGGER } from '@legacy-sports/logging';
import {
  CreateLeagueMutation,
  Sport,
  useCreateLeagueMutation,
} from '../../../../api/db/graphql.generated';

// ── Types ────────────────────────────────────────────────────────────────────

type ScoringFormat = 'standard' | 'half_ppr' | 'ppr';
type DefensiveFormat = 'dst' | 'idp';

interface CreateFootballLeagueFormData {
  leagueName: string;
  numberOfTeams: number;
  playerPool: 'all' | 'nfl' | 'afc' | 'nfc';
  draftMode: 'live' | 'automated';
  selectionMethod: 'standard' | 'auction' | 'random';
  draftOrder: 'snake' | 'linear';
  maxRosterSize: number;
  draftDate?: Date;
  scoringFormat: ScoringFormat;
  defensiveFormat: DefensiveFormat;
}

// ── Options ──────────────────────────────────────────────────────────────────

const TEAM_COUNT_OPTIONS = [8, 10, 12, 14] as const;
const ROSTER_SIZE_OPTIONS = [13, 14, 15, 16, 17, 18] as const;

const PLAYER_POOL_OPTIONS: ReadonlyArray<{
  label: string;
  value: 'all' | 'nfl' | 'afc' | 'nfc';
}> = [
  { label: 'All NFL', value: 'all' },
  { label: 'AFC', value: 'afc' },
  { label: 'NFC', value: 'nfc' },
];

const SCORING_FORMAT_OPTIONS: ReadonlyArray<{
  id: ScoringFormat;
  label: string;
  rec: number;
  description: string;
}> = [
  {
    id: 'standard',
    label: 'Standard',
    rec: 0,
    description: 'No reception bonus',
  },
  {
    id: 'half_ppr',
    label: 'Half-PPR',
    rec: 0.5,
    description: '0.5 pts per reception',
  },
  { id: 'ppr', label: 'PPR', rec: 1, description: '1 pt per reception' },
];

const DRAFT_MODE_OPTIONS = [
  { label: 'Live', value: 'live' },
  { label: 'Auto', value: 'automated' },
] as const;

const SELECTION_METHOD_OPTIONS = [
  { label: 'Standard', value: 'standard' },
  { label: 'Auction', value: 'auction' },
  { label: 'Random', value: 'random' },
] as const;

const DRAFT_ORDER_OPTIONS = [
  { label: 'Snake', value: 'snake' },
  { label: 'Linear', value: 'linear' },
] as const;

// ── Helper ───────────────────────────────────────────────────────────────────

function SelectRow<T extends string | number>({
  label,
  hint,
  options,
  value,
  onChange,
  loading,
}: {
  label: string;
  hint?: string;
  options: ReadonlyArray<{ label: string; value: T }>;
  value: T;
  onChange: (v: T) => void;
  loading: boolean;
}): React.JSX.Element {
  return (
    <YStack space="$2">
      <Text size="$4" fontWeight="600" color="$gray12">
        {label}
      </Text>
      <XStack space="$2" flexWrap="wrap">
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <Button
              key={String(opt.value)}
              size="$3"
              flex={1}
              minWidth="$8"
              onPress={() => onChange(opt.value)}
              disabled={loading}
              backgroundColor={selected ? '$green8' : '$color2'}
              borderColor={selected ? '$green8' : '$borderColor'}
              borderWidth={selected ? 2 : 1}
              elevation={selected ? 3 : 1}
              pressStyle={{ scale: 0.95 }}
            >
              <Text
                color={selected ? '$green12' : '$color'}
                fontWeight={selected ? '700' : '500'}
              >
                {opt.label}
              </Text>
            </Button>
          );
        })}
      </XStack>
      {hint != null && (
        <Text size="$2" color="$gray10">
          {hint}
        </Text>
      )}
    </YStack>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function FootballLeagueCreatePage(): React.JSX.Element {
  const router = useRouter();
  const [formData, setFormData] = useState<CreateFootballLeagueFormData>({
    leagueName: '',
    numberOfTeams: 12,
    playerPool: 'all',
    draftMode: 'live',
    selectionMethod: 'standard',
    draftOrder: 'snake',
    maxRosterSize: 16,
    draftDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    scoringFormat: 'ppr',
    defensiveFormat: 'dst',
  });

  const [createLeagueAndTeams, { loading, error }] = useCreateLeagueMutation({
    onCompleted: (data: CreateLeagueMutation) => {
      if (data.createLeagueAndTeams?.league?.id) {
        router.push(`/football/league/${data.createLeagueAndTeams.league.id}`);
      }
    },
    onError: (err: Error) => {
      LOGGER.error('Error creating football league:', err);
      Alert.alert('Error', err.message || 'Failed to create league');
    },
  });

  const trimmedName = formData.leagueName.trim();

  const handleChange = <K extends keyof CreateFootballLeagueFormData>(
    field: K,
    value: CreateFootballLeagueFormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const validate = (): string | null => {
    if (!trimmedName || trimmedName.length < 3)
      return 'League name must be at least 3 characters.';
    if (trimmedName.length > 50)
      return 'League name must be less than 50 characters.';
    if (formData.numberOfTeams < 4 || formData.numberOfTeams > 16)
      return 'Number of teams must be between 4 and 16.';
    if (!formData.draftDate) return 'Please select a draft date.';
    if (formData.draftDate < new Date())
      return 'Draft date must be in the future.';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      Alert.alert('Error', err);
      return;
    }
    try {
      await createLeagueAndTeams({
        variables: {
          input: {
            leagueName: trimmedName,
            sport: Sport.Football,
            numberOfTeams: formData.numberOfTeams,
            playerPool: formData.playerPool,
            draftMode: formData.draftMode,
            selectionMethod: formData.selectionMethod,
            draftOrder: formData.draftOrder,
            maxRosterSize: formData.maxRosterSize,
            startDate: (formData.draftDate ?? new Date()).toISOString(),
            defensiveFormat: formData.defensiveFormat,
            scoringFormat: formData.scoringFormat,
          },
        },
      });
    } catch (e) {
      LOGGER.error(
        'Error in handleSubmit:',
        e instanceof Error ? e : new Error(String(e)),
      );
    }
  };

  return (
    <ScrollView flex={1} backgroundColor="$background" padding="$4">
      <YStack space="$6" maxWidth={600} alignSelf="center" width="100%">
        {/* Header */}
        <YStack alignItems="center" space="$3">
          <H1 size="$8" color="$color" textAlign="center">
            <Text>🏈 Create Football League</Text>
          </H1>
          <Text size="$4" color="$gray11" textAlign="center">
            Set up your fantasy football league
          </Text>
        </YStack>

        <Card
          elevate
          size="$4"
          bordered
          backgroundColor="$color2"
          borderColor="$borderColor"
          padding="$4"
        >
          <YStack space="$5">
            <H2 size="$6" color="$color" marginBottom="$2">
              League Settings
            </H2>

            {/* League Name */}
            <YStack space="$2">
              <Text size="$4" fontWeight="600" color="$gray12">
                League Name *
              </Text>
              <Input
                size="$4"
                placeholder="Enter your league name"
                value={formData.leagueName}
                onChangeText={(text: string) =>
                  handleChange('leagueName', text)
                }
                borderColor="$borderColor"
                backgroundColor="$color1"
                disabled={loading}
              />
            </YStack>

            {/* Teams */}
            <SelectRow
              label="Number of Teams *"
              hint="10 or 12 is standard for football."
              options={TEAM_COUNT_OPTIONS.map((n) => ({
                label: String(n),
                value: n,
              }))}
              value={formData.numberOfTeams}
              onChange={(v) => handleChange('numberOfTeams', v)}
              loading={loading}
            />

            {/* Roster Size */}
            <SelectRow
              label="Roster Size *"
              hint="16 is the standard (1 QB, 2 RB, 2 WR, 1 TE, K, DEF + bench)."
              options={ROSTER_SIZE_OPTIONS.map((n) => ({
                label: String(n),
                value: n,
              }))}
              value={formData.maxRosterSize}
              onChange={(v) => handleChange('maxRosterSize', v)}
              loading={loading}
            />

            {/* Player Pool */}
            <SelectRow
              label="Player Pool *"
              options={PLAYER_POOL_OPTIONS}
              value={formData.playerPool}
              onChange={(v) => handleChange('playerPool', v)}
              loading={loading}
            />

            {/* ── Scoring Format (LS-4158) ── */}
            <YStack space="$3">
              <YStack space="$1">
                <Text size="$4" fontWeight="700" color="$gray12">
                  Scoring Format
                </Text>
                <Text size="$2" color="$gray10">
                  Sets the reception bonus (receiving_rec). All other stats are
                  identical.
                </Text>
              </YStack>
              <XStack space="$2">
                {SCORING_FORMAT_OPTIONS.map((opt) => {
                  const selected = formData.scoringFormat === opt.id;
                  return (
                    <Button
                      key={opt.id}
                      size="$3"
                      flex={1}
                      onPress={() => handleChange('scoringFormat', opt.id)}
                      disabled={loading}
                      backgroundColor={selected ? '$teal8' : '$color2'}
                      borderColor={selected ? '$teal8' : '$borderColor'}
                      borderWidth={selected ? 2 : 1}
                      elevation={selected ? 3 : 1}
                      pressStyle={{ scale: 0.95 }}
                    >
                      <YStack alignItems="center" space="$1">
                        <Text
                          color={selected ? '$teal12' : '$color'}
                          fontWeight={selected ? '700' : '500'}
                          fontSize="$4"
                        >
                          {opt.label}
                        </Text>
                        <Text
                          color={selected ? '$teal10' : '$gray9'}
                          fontSize="$1"
                        >
                          {opt.description}
                        </Text>
                      </YStack>
                    </Button>
                  );
                })}
              </XStack>
            </YStack>

            {/* ── Defensive Format (LS-4158) ── */}
            <YStack space="$3">
              <YStack space="$1">
                <Text size="$4" fontWeight="700" color="$gray12">
                  Defensive Format
                </Text>
                <Text size="$2" color="$gray10">
                  D/ST uses one team defense slot. IDP uses individual defensive
                  players (DL/LB/DB).
                </Text>
              </YStack>
              <XStack space="$2">
                {(
                  [
                    { id: 'dst' as const, label: 'D/ST', sub: 'Team Defense' },
                    {
                      id: 'idp' as const,
                      label: 'IDP',
                      sub: 'Individual Players',
                    },
                  ] as const
                ).map((opt) => {
                  const selected = formData.defensiveFormat === opt.id;
                  return (
                    <Button
                      key={opt.id}
                      size="$3"
                      flex={1}
                      onPress={() => handleChange('defensiveFormat', opt.id)}
                      disabled={loading}
                      backgroundColor={selected ? '$orange8' : '$color2'}
                      borderColor={selected ? '$orange8' : '$borderColor'}
                      borderWidth={selected ? 2 : 1}
                      elevation={selected ? 3 : 1}
                      pressStyle={{ scale: 0.95 }}
                    >
                      <YStack alignItems="center" space="$1">
                        <Text
                          color={selected ? '$orange12' : '$color'}
                          fontWeight={selected ? '700' : '500'}
                          fontSize="$4"
                        >
                          {opt.label}
                        </Text>
                        <Text
                          color={selected ? '$orange10' : '$gray9'}
                          fontSize="$1"
                        >
                          {opt.sub}
                        </Text>
                      </YStack>
                    </Button>
                  );
                })}
              </XStack>
            </YStack>

            {/* Draft Mode */}
            <SelectRow
              label="Draft Mode"
              hint="Live requires all managers online at the same time."
              options={DRAFT_MODE_OPTIONS.map((o) => ({
                label: o.label,
                value: o.value,
              }))}
              value={formData.draftMode}
              onChange={(v) => handleChange('draftMode', v)}
              loading={loading}
            />

            {/* Selection Method */}
            <SelectRow
              label="Selection Method"
              options={SELECTION_METHOD_OPTIONS.map((o) => ({
                label: o.label,
                value: o.value,
              }))}
              value={formData.selectionMethod}
              onChange={(v) => handleChange('selectionMethod', v)}
              loading={loading}
            />

            {/* Draft Order */}
            <SelectRow
              label="Draft Order"
              hint="Snake order reverses each round; linear stays the same."
              options={DRAFT_ORDER_OPTIONS.map((o) => ({
                label: o.label,
                value: o.value,
              }))}
              value={formData.draftOrder}
              onChange={(v) => handleChange('draftOrder', v)}
              loading={loading}
            />

            {/* Draft Date */}
            <YStack space="$2">
              <Text size="$4" fontWeight="600" color="$gray12">
                Draft Date & Time
              </Text>
              <DateTimePicker
                value={formData.draftDate}
                onChange={(date: Date) => handleChange('draftDate', date)}
                placeholder="Select draft date and time"
                disabled={loading}
                minDate={new Date()}
              />
            </YStack>

            {/* Error display */}
            {error != null && (
              <Card backgroundColor="$red3" borderColor="$red7" padding="$3">
                <Text color="$red11" size="$3" fontWeight="600">
                  Error: {error.message || 'Failed to create league'}
                </Text>
              </Card>
            )}

            {/* Actions */}
            <XStack space="$3" justifyContent="flex-end" marginTop="$4">
              <Button
                size="$4"
                variant="outlined"
                onPress={() => router.back()}
                disabled={loading}
                backgroundColor="$color1"
                borderColor="$borderColor"
              >
                <Text color="$color">Cancel</Text>
              </Button>
              <Button
                size="$4"
                onPress={() => void handleSubmit()}
                disabled={loading || trimmedName.length < 3}
                opacity={loading ? 0.6 : 1}
                backgroundColor="$brandNavy"
              >
                <Text color="white" fontWeight="600">
                  {loading ? 'Creating...' : 'Create League'}
                </Text>
              </Button>
            </XStack>
          </YStack>
        </Card>

        {/* Info card */}
        <Card
          size="$4"
          bordered
          backgroundColor="$orange2"
          borderColor="$orange6"
          padding="$4"
        >
          <YStack space="$3">
            <H2 size="$5" color="$orange11">
              What happens next?
            </H2>
            <Text size="$3" color="$orange11">
              • Your football league is created with the specified settings
            </Text>
            <Text size="$3" color="$orange11">
              • You'll be set as the league commissioner
            </Text>
            <Text size="$3" color="$orange11">
              {formData.defensiveFormat === 'idp'
                ? '• IDP roster slots (DL/LB/DB) will be configured for your league'
                : '• A single D/ST slot is included in the default roster'}
            </Text>
            <Text size="$3" color="$orange11">
              • Invite friends to join after creation
            </Text>
          </YStack>
        </Card>
      </YStack>
    </ScrollView>
  );
}

export default FootballLeagueCreatePage;

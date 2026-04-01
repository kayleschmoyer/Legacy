import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { LOGGER } from '@legacy-sports/logging';
import {
  Button,
  Card,
  H1,
  H2,
  Input,
  ScrollView,
  Separator,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { PageMeta } from '../../components/PageMeta';
import {
  useCreateSeasonDraftGameMutation,
  useSearchUsersForDraftLazyQuery,
} from '../../api/db/graphql.generated';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_NAVY_DARK,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  withAlpha,
} from '../../constants/colors';

const STAT_LABELS: Record<string, string> = {
  hr: 'Home Runs',
  h: 'Hits',
  rbi: 'RBI',
  sb: 'Stolen Bases',
  r: 'Runs',
  doubles: 'Doubles',
  triples: 'Triples',
  bb: 'Walks',
  tb: 'Total Bases',
  w: 'Wins',
  so: 'Strikeouts',
  sv: 'Saves',
  sho: 'Shutouts',
  cg: 'Complete Games',
};

const HITTER_STATS = [
  'hr',
  'h',
  'rbi',
  'sb',
  'r',
  'doubles',
  'triples',
  'bb',
  'tb',
];
const PITCHER_STATS = ['w', 'so', 'sv', 'sho', 'cg'];

interface UserResult {
  id: number;
  username: string;
  avatarUrl?: string | null;
}

interface SelectedPlayer {
  userId: number;
  name: string;
}

function SelectButton({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      size="$3"
      onPress={onPress}
      disabled={disabled}
      backgroundColor={selected ? BRAND_NAVY_LIGHT : '$color2'}
      borderColor={selected ? BRAND_NAVY_LIGHT : '$borderColor'}
      borderWidth={selected ? 2 : 1}
      hoverStyle={{
        backgroundColor: selected ? BRAND_NAVY : '$color3',
        borderColor: selected ? BRAND_NAVY : '$borderColorHover',
      }}
      pressStyle={{
        scale: 0.95,
        backgroundColor: selected ? BRAND_NAVY_DARK : '$color4',
      }}
    >
      <Text
        color={selected ? BRAND_GOLD : '$color'}
        fontWeight={selected ? '600' : '400'}
      >
        {label}
      </Text>
    </Button>
  );
}

export const SeasonDraftGameCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [gameName, setGameName] = useState('');
  const [playerType, setPlayerType] = useState<'hitter' | 'pitcher'>('hitter');
  const [gameMode, setGameMode] = useState<'season' | 'career_team'>('season');
  const [statKey, setStatKey] = useState('hr');
  const [userSearch, setUserSearch] = useState('');
  const [players, setPlayers] = useState<SelectedPlayer[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [createGame, { loading }] = useCreateSeasonDraftGameMutation();
  const [searchUsers, { data: searchData }] = useSearchUsersForDraftLazyQuery();
  const userResults = (searchData?.searchUsers ?? []).filter(
    (u): u is UserResult => u != null && u.id != null && u.username != null,
  );

  // Initialise players list once we have user
  useEffect(() => {
    if (user && players.length === 0) {
      setPlayers([
        { userId: user.id, name: user.username ?? user.email ?? 'You' },
      ]);
    }
  }, [user, players.length]);

  // Reset statKey when playerType changes
  useEffect(() => {
    setStatKey(playerType === 'pitcher' ? 'w' : 'hr');
  }, [playerType]);

  const statKeys = playerType === 'pitcher' ? PITCHER_STATS : HITTER_STATS;

  const doSearch = useCallback(
    (term: string) => {
      if (term.length < 2) {
        setShowDropdown(false);
        return;
      }
      void searchUsers({ variables: { searchTerm: term, limit: 10 } });
      setShowDropdown(true);
    },
    [searchUsers],
  );

  useEffect(() => {
    const t = setTimeout(() => doSearch(userSearch), 300);
    return () => clearTimeout(t);
  }, [userSearch, doSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const addPlayer = (u: UserResult) => {
    if (!u.id || !u.username) return;
    if (players.some((p) => p.userId === u.id)) return;
    if (players.length >= 6) return;
    setPlayers((prev) => [...prev, { userId: u.id, name: u.username }]);
    setUserSearch('');
    setShowDropdown(false);
  };

  const removePlayer = (userId: number) => {
    if (userId === user?.id) return;
    setPlayers((prev) => prev.filter((p) => p.userId !== userId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!gameName.trim()) {
      setFormError('Please enter a game name.');
      return;
    }
    if (players.length < 2) {
      setFormError('You need at least 2 players to create a game.');
      return;
    }

    try {
      const result = await createGame({
        variables: {
          name: gameName.trim(),
          playerNames: players.map((p) => p.name),
          userIds: players.map((p) => p.userId),
          statKey,
          gameMode,
          playerType,
        },
      });
      const gameId = result.data?.createSeasonDraftGame;
      if (gameId) {
        navigate(`/games/season-draft/${gameId}`);
      } else {
        setFormError('Failed to create game. Please try again.');
        LOGGER.error(
          'createSeasonDraftGame returned no game ID',
          new Error('Missing game ID'),
        );
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      LOGGER.error('Failed to create season draft game', err);
      setFormError('Failed to create game. Please try again.');
    }
  };

  if (!user) return null;

  const visibleResults = userResults.filter(
    (u) => !players.some((p) => p.userId === u.id),
  );

  return (
    <ScrollView flex={1} backgroundColor="$background">
      <PageMeta
        title="Create Season Draft Game"
        description="Create a new Season Draft Game and invite friends to compete."
      />
      <YStack
        padding="$6"
        $sm={{ padding: '$3', paddingBottom: '$6' }}
        space="$6"
        maxWidth={600}
        alignSelf="center"
        width="100%"
      >
        {/* Header */}
        <YStack alignItems="center" space="$3">
          <H1 size="$8" color="$color" textAlign="center">
            <span role="img" aria-label="trophy">
              🏆
            </span>{' '}
            New Season Draft Game
          </H1>
          <Text size="$4" color="$gray11" textAlign="center">
            Draft players by their stats and compete with friends
          </Text>
        </YStack>

        <Card
          elevate
          size="$4"
          bordered
          backgroundColor="$color2"
          borderColor="$borderColor"
        >
          <Card.Header padded>
            <H2 size="$6" color="$color">
              Game Settings
            </H2>
          </Card.Header>

          <form onSubmit={(e) => void handleSubmit(e)}>
            <YStack padding="$4" space="$5">
              {/* Game Name */}
              <YStack space="$2">
                <Text
                  size="$4"
                  fontWeight="600"
                  color="$gray12"
                  nativeID="label-game-name"
                >
                  Game Name *
                </Text>
                <Input
                  size="$4"
                  placeholder="e.g., HR Challenge 2025"
                  value={gameName}
                  onChangeText={setGameName}
                  borderColor="$borderColor"
                  backgroundColor="$color1"
                  disabled={loading}
                  aria-labelledby="label-game-name"
                  aria-required="true"
                />
              </YStack>

              <Separator />

              {/* Draft Type */}
              <YStack space="$2">
                <Text size="$4" fontWeight="600" color="$gray12">
                  Draft Type
                </Text>
                <XStack space="$2">
                  <SelectButton
                    label="Hitters"
                    selected={playerType === 'hitter'}
                    onPress={() => setPlayerType('hitter')}
                    disabled={loading}
                  />
                  <SelectButton
                    label="Pitchers"
                    selected={playerType === 'pitcher'}
                    onPress={() => setPlayerType('pitcher')}
                    disabled={loading}
                  />
                </XStack>
              </YStack>

              {/* Game Mode */}
              <YStack space="$2">
                <Text size="$4" fontWeight="600" color="$gray12">
                  Game Mode
                </Text>
                <XStack space="$2">
                  <SelectButton
                    label="Season"
                    selected={gameMode === 'season'}
                    onPress={() => setGameMode('season')}
                    disabled={loading}
                  />
                  <SelectButton
                    label="Career w/ Team"
                    selected={gameMode === 'career_team'}
                    onPress={() => setGameMode('career_team')}
                    disabled={loading}
                  />
                </XStack>
                <Text size="$2" color="$gray10">
                  {gameMode === 'season'
                    ? "Draft a player + specific year. Score is that player's stat in that season."
                    : 'Draft a player + team. Score is their career total with that franchise.'}
                </Text>
              </YStack>

              {/* Stat to Draft */}
              <YStack space="$2">
                <Text size="$4" fontWeight="600" color="$gray12">
                  Stat to Draft
                </Text>
                <XStack space="$2" flexWrap="wrap">
                  {statKeys.map((key) => (
                    <SelectButton
                      key={key}
                      label={STAT_LABELS[key] ?? key}
                      selected={statKey === key}
                      onPress={() => setStatKey(key)}
                      disabled={loading}
                    />
                  ))}
                </XStack>
              </YStack>

              <Separator />

              {/* Players */}
              <YStack space="$3">
                <Text size="$4" fontWeight="600" color="$gray12">
                  Players ({players.length}/6)
                </Text>

                {players.map((player) => (
                  <XStack
                    key={player.userId}
                    justifyContent="space-between"
                    alignItems="center"
                    padding="$3"
                    backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
                    borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.35)}
                    borderWidth={1}
                    borderRadius="$3"
                  >
                    <Text fontWeight="600" color="$color">
                      {player.name}
                      {player.userId === user.id && (
                        <Text color={BRAND_GOLD_LIGHT}> (you)</Text>
                      )}
                    </Text>
                    {player.userId !== user.id && (
                      <Button
                        size="$2"
                        backgroundColor={BRAND_SEAM_RED}
                        color="white"
                        hoverStyle={{ backgroundColor: '#8B1A2B' }}
                        pressStyle={{ scale: 0.95, backgroundColor: '#6B1221' }}
                        onPress={() => removePlayer(player.userId)}
                        disabled={loading}
                      >
                        Remove
                      </Button>
                    )}
                  </XStack>
                ))}

                {players.length < 6 && (
                  <YStack space="$1">
                    <Text size="$3" color="$gray10">
                      Add players by username:
                    </Text>
                    <div ref={searchRef} style={{ position: 'relative' }}>
                      <Input
                        size="$4"
                        placeholder="Search by username..."
                        value={userSearch}
                        onChangeText={(v: string) => setUserSearch(v)}
                        borderColor="$borderColor"
                        backgroundColor="$color1"
                        disabled={loading}
                      />
                      {showDropdown && visibleResults.length > 0 && (
                        <YStack
                          position="absolute"
                          top="100%"
                          left={0}
                          right={0}
                          backgroundColor="$color2"
                          borderColor="$borderColor"
                          borderWidth={1}
                          borderRadius="$3"
                          zIndex={100}
                          overflow="hidden"
                        >
                          {visibleResults.map((u) => (
                            <XStack
                              key={u.id}
                              padding="$3"
                              borderBottomColor="$borderColor"
                              borderBottomWidth={1}
                              hoverStyle={{
                                backgroundColor: withAlpha(
                                  BRAND_NAVY_LIGHT,
                                  0.12,
                                ),
                              }}
                              cursor="pointer"
                              onPress={() => addPlayer(u)}
                            >
                              <Text color="$color">{u.username}</Text>
                            </XStack>
                          ))}
                        </YStack>
                      )}
                    </div>
                  </YStack>
                )}
              </YStack>

              {/* Error */}
              {formError && (
                <Text color={BRAND_SEAM_RED} size="$3">
                  {formError}
                </Text>
              )}

              {/* Actions */}
              <XStack space="$3" justifyContent="flex-end" marginTop="$2">
                <Button
                  size="$4"
                  variant="outlined"
                  onPress={() => navigate('/games/season-draft')}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  size="$4"
                  backgroundColor={BRAND_NAVY_LIGHT}
                  color={BRAND_GOLD}
                  borderColor={BRAND_NAVY_LIGHT}
                  hoverStyle={{
                    backgroundColor: BRAND_NAVY,
                    borderColor: BRAND_NAVY,
                  }}
                  pressStyle={{
                    scale: 0.97,
                    backgroundColor: BRAND_NAVY_DARK,
                  }}
                  disabled={!gameName.trim() || players.length < 2 || loading}
                  tag="button"
                  type="submit"
                >
                  {loading ? 'Creating...' : 'Create Game'}
                </Button>
              </XStack>
            </YStack>
          </form>
        </Card>
      </YStack>
    </ScrollView>
  );
};

export default SeasonDraftGameCreatePage;

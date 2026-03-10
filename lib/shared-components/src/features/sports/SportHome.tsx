import React, { useState } from 'react';
import {
  Adapt,
  Button,
  Dialog,
  Input,
  ScrollView,
  Sheet,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Alert, FlatList, Platform } from '../../platform-components';
import { League, User } from '../../types';
import { DEFAULT_COLORS, SPORT_CONFIGS } from '../../config/sports';
import {
  CreateLeagueFormData,
  CreateLeagueModal,
} from '../leagues/CreateLeagueModal';

export interface QuickAction {
  title: string;
  icon?: string;
  onPress: () => void;
  color?: string;
}

export interface SportHomeProps {
  sport: 'baseball' | 'football' | 'basketball' | 'hockey';
  user: User;
  leagues: League[];
  onCreateLeague: (data: CreateLeagueFormData) => Promise<void>;
  onJoinLeague?: (inviteCode: string) => Promise<void>;
  onLeaguePress: (league: League) => void;
  onInviteFriends?: () => void;
  quickActions?: QuickAction[];
  loading?: boolean;
  error?: string | null;
}

function SportHome({
  sport,
  user,
  leagues,
  onCreateLeague,
  onJoinLeague,
  onLeaguePress,
  onInviteFriends,
  quickActions = [],
  loading = false,
  error,
}: SportHomeProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');

  const sportConfig = SPORT_CONFIGS[sport];

  const defaultQuickActions: QuickAction[] = [
    {
      title: 'Create League',
      icon: '➕',
      onPress: () => setShowCreateModal(true),
      color: sportConfig.colors.accent,
    },
    ...(onJoinLeague
      ? [
          {
            title: 'Join League',
            icon: '🚪',
            onPress: () => setShowJoinModal(true),
            color: sportConfig.colors.secondary,
          },
        ]
      : []),
    ...(onInviteFriends
      ? [
          {
            title: 'Invite Friends',
            icon: '👥',
            onPress: onInviteFriends,
            color: DEFAULT_COLORS.info,
          },
        ]
      : []),
    ...quickActions,
  ];

  const handleJoinLeague = () => {
    if (!inviteCode.trim()) {
      const message = 'Please enter an invite code';
      Platform.OS === 'web' ? alert(message) : Alert.alert('Error', message);
      return;
    }

    if (onJoinLeague) {
      onJoinLeague(inviteCode)
        .then(() => {
          setShowJoinModal(false);
          setInviteCode('');
        })
        .catch(() => {
          // Error handling is managed by parent component
        });
    }
  };

  const renderLeague = ({ item }: { item: League }) => (
    <Button
      backgroundColor={DEFAULT_COLORS.secondary}
      borderRadius="$3"
      padding="$4"
      borderLeftWidth={4}
      borderLeftColor={sportConfig.colors.accent}
      onPress={() => onLeaguePress(item)}
      unstyled
      justifyContent="flex-start"
    >
      <XStack
        justifyContent="space-between"
        alignItems="flex-start"
        marginBottom="$2"
      >
        <Text fontSize="$5" fontWeight="bold" color="$gray12" flex={1}>
          {item.name}
        </Text>
        <Text
          fontSize="$2"
          color="$gray10"
          backgroundColor="$gray4"
          paddingHorizontal="$2"
          paddingVertical="$1"
          borderRadius="$3"
        >
          {sportConfig.name}
        </Text>
      </XStack>

      <XStack justifyContent="space-between" alignItems="center">
        <Text fontSize="$3" color="$gray10">
          {item.numberOfTeams} Teams
        </Text>
        <Text fontSize="$3" color="$gray10">
          Draft: {new Date(item.draftDate).toLocaleDateString()}
        </Text>
        <Text fontSize="$2" fontWeight="600" color={sportConfig.colors.accent}>
          {item.playerPool} Pool
        </Text>
      </XStack>
    </Button>
  );

  const renderQuickAction = ({ item }: { item: QuickAction }) => (
    <Button
      paddingVertical="$4"
      paddingHorizontal="$5"
      borderRadius="$3"
      alignItems="center"
      minWidth={120}
      backgroundColor={item.color || DEFAULT_COLORS.accent}
      onPress={item.onPress}
      disabled={loading}
      unstyled
    >
      {item.icon && (
        <Text fontSize="$6" marginBottom="$2">
          {item.icon}
        </Text>
      )}
      <Text fontSize="$3" fontWeight="600" color="white" textAlign="center">
        {item.title}
      </Text>
    </Button>
  );

  return (
    <ScrollView
      flex={1}
      backgroundColor="$gray1"
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <YStack
        padding="$6"
        paddingTop={Platform.OS === 'ios' ? 60 : '$6'}
        backgroundColor={sportConfig.colors.primary}
        borderBottomLeftRadius="$4"
        borderBottomRightRadius="$4"
      >
        <Text fontSize="$8" fontWeight="bold" color="white" marginBottom="$1">
          {sportConfig.name} Fantasy
        </Text>
        <Text fontSize="$4" color="white" opacity={0.8}>
          Welcome back, {user.name}!
        </Text>
      </YStack>

      {/* Quick Actions */}
      <YStack margin="$4">
        <Text fontSize="$6" fontWeight="bold" color="$gray12" marginBottom="$4">
          Quick Actions
        </Text>
        <FlatList
          data={defaultQuickActions}
          renderItem={renderQuickAction}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        />
      </YStack>

      {/* My Leagues */}
      <YStack margin="$4">
        <Text fontSize="$6" fontWeight="bold" color="$gray12" marginBottom="$4">
          My Leagues
        </Text>

        {loading ? (
          <YStack padding="$10" alignItems="center">
            <Text fontSize="$4" color="$gray10">
              Loading leagues...
            </Text>
          </YStack>
        ) : leagues.length > 0 ? (
          <FlatList
            data={leagues}
            renderItem={renderLeague}
            keyExtractor={(item: League) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 12 }}
          />
        ) : (
          <YStack alignItems="center" padding="$10">
            <Text fontSize="$12" marginBottom="$4">
              {Platform.OS === 'web' ? (
                <span role="img" aria-label="Trophy">
                  🏆
                </span>
              ) : (
                '🏆'
              )}
            </Text>
            <Text
              fontSize="$6"
              fontWeight="bold"
              color="$gray12"
              marginBottom="$2"
              textAlign="center"
            >
              No Leagues Yet
            </Text>
            <Text
              fontSize="$4"
              color="$gray10"
              textAlign="center"
              lineHeight="$1"
            >
              Create your first league or join an existing one to get started!
            </Text>
          </YStack>
        )}
      </YStack>

      {/* Create League Modal */}
      <CreateLeagueModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={onCreateLeague}
        loading={loading}
        error={error}
      />

      {/* Join League Modal */}
      {onJoinLeague && (
        <Dialog
          modal
          open={showJoinModal}
          onOpenChange={(open) => !open && setShowJoinModal(false)}
        >
          <Adapt>
            <Sheet
              animation="medium"
              zIndex={200000}
              modal
              dismissOnSnapToBottom
            >
              <Sheet.Frame padding="$4" gap="$4">
                <Adapt.Contents />
              </Sheet.Frame>
              <Sheet.Overlay
                animation="lazy"
                enterStyle={{ opacity: 0 }}
                exitStyle={{ opacity: 0 }}
              />
            </Sheet>
          </Adapt>

          <Dialog.Portal>
            <Dialog.Overlay
              key="overlay"
              animation="slow"
              opacity={0.7}
              enterStyle={{ opacity: 0 }}
              exitStyle={{ opacity: 0 }}
            />
            <Dialog.Content
              bordered
              elevate
              key="content"
              animateOnly={['transform', 'opacity']}
              animation={[
                'quick',
                {
                  opacity: {
                    overshootClamping: true,
                  },
                },
              ]}
              enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
              exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
              gap="$4"
              backgroundColor="$gray2"
              borderRadius="$4"
              padding="$6"
              width={Platform.OS === 'web' ? 350 : '85%'}
            >
              <Text
                fontSize="$6"
                fontWeight="bold"
                color="$gray12"
                marginBottom="$5"
                textAlign="center"
              >
                Join League
              </Text>

              <Text
                fontSize="$3"
                fontWeight="600"
                color="$gray12"
                marginBottom="$2"
              >
                Enter Invite Code
              </Text>
              <YStack marginBottom="$6">
                <Input
                  backgroundColor="$gray1"
                  borderRadius="$2"
                  padding="$3"
                  fontSize="$4"
                  color="$gray12"
                  borderWidth={1}
                  borderColor="$gray6"
                  value={inviteCode}
                  onChangeText={setInviteCode}
                  placeholder="ABC123XYZ"
                  placeholderTextColor="$gray9"
                  autoCapitalize="characters"
                  editable={!loading}
                />
              </YStack>

              <XStack gap="$3">
                <Button
                  flex={1}
                  backgroundColor="$gray6"
                  borderRadius="$2"
                  onPress={() => setShowJoinModal(false)}
                  disabled={loading}
                >
                  <Text fontWeight="600" color="$gray12">
                    Cancel
                  </Text>
                </Button>

                <Button
                  flex={1}
                  backgroundColor={sportConfig.colors.accent}
                  borderRadius="$2"
                  onPress={handleJoinLeague}
                  disabled={loading}
                >
                  <Text fontWeight="600" color="white">
                    {loading ? 'Joining...' : 'Join League'}
                  </Text>
                </Button>
              </XStack>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog>
      )}
    </ScrollView>
  );
}

export { SportHome };

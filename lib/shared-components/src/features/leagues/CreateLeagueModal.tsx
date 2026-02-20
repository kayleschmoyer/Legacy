import React, { useEffect, useState } from 'react';
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
import { Alert, Platform } from '../../platform-components';
import {
  DROPDOWN_TEAM_COUNT_ITEMS,
  PLAYER_POOLS,
  SPORT_CONFIGS,
} from '../../config/sports';
import {
  DraftMode,
  DraftOrder,
  PlayerPool,
  SelectionMethod,
} from '../../types';

export interface CreateLeagueFormData {
  leagueName: string;
  sport: 'baseball' | 'football' | 'basketball' | 'hockey';
  numberOfTeams: number;
  playerPool: PlayerPool;
  draftMode?: DraftMode;
  selectionMethod?: SelectionMethod;
  draftOrder?: DraftOrder;
  draftDate?: Date;
}

export interface CreateLeagueModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: CreateLeagueFormData) => Promise<void>;
  loading?: boolean;
  error?: string | null;
}

function CreateLeagueModal({
  visible,
  onClose,
  onSubmit,
  loading = false,
  error,
}: CreateLeagueModalProps) {
  const [formData, setFormData] = useState<CreateLeagueFormData>({
    leagueName: '',
    sport: 'baseball',
    numberOfTeams: 10,
    playerPool: PlayerPool.ALL,
    draftMode: DraftMode.LIVE,
    selectionMethod: SelectionMethod.STANDARD,
    draftOrder: DraftOrder.SNAKE,
  });

  const [showSportDropdown, setShowSportDropdown] = useState(false);
  const [showTeamCountDropdown, setShowTeamCountDropdown] = useState(false);
  const [showPlayerPoolDropdown, setShowPlayerPoolDropdown] = useState(false);

  const sportOptions = Object.keys(SPORT_CONFIGS);

  useEffect(() => {
    if (error) {
      if (Platform.OS === 'web') {
        alert(error);
      } else {
        Alert.alert('Error', error);
      }
    }
  }, [error]);

  const handleSubmit = async () => {
    if (!formData.leagueName.trim()) {
      const message = 'Please enter a league name';
      if (Platform.OS === 'web') {
        alert(message);
      } else {
        Alert.alert('Error', message);
      }
      return;
    }

    try {
      await onSubmit(formData);
      // Reset form on success
      setFormData({
        leagueName: '',
        sport: 'baseball',
        numberOfTeams: 10,
        playerPool: PlayerPool.ALL,
        draftMode: DraftMode.LIVE,
        selectionMethod: SelectionMethod.STANDARD,
        draftOrder: DraftOrder.SNAKE,
      });
    } catch {
      // Error handling is done via the error prop
    }
  };

  return (
    <Dialog modal open={visible} onOpenChange={(open) => !open && onClose()}>
      <Adapt>
        <Sheet animation="medium" zIndex={200000} modal dismissOnSnapToBottom>
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
            'quicker',
            {
              opacity: {
                overshootClamping: true,
              },
            },
          ]}
          enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
          exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
          gap="$4"
          padding="$6"
          width={Platform.OS === 'web' ? 400 : '90%'}
          maxHeight="80%"
        >
          <Text
            fontSize="$6"
            fontWeight="bold"
            color="$gray12"
            marginBottom="$5"
            textAlign="center"
          >
            Create New League
          </Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* League Name Input */}
            <YStack marginBottom="$4">
              <Text
                fontSize="$3"
                fontWeight="600"
                color="$gray12"
                marginBottom="$2"
              >
                League Name
              </Text>
              <Input
                backgroundColor="$gray1"
                borderRadius="$2"
                padding="$3"
                fontSize="$4"
                borderWidth={1}
                borderColor="$gray6"
                value={formData.leagueName}
                onChangeText={(text: string) =>
                  setFormData((prev) => ({ ...prev, leagueName: text }))
                }
                placeholder="Enter league name"
                editable={!loading}
              />
            </YStack>

            {/* Sport Selection */}
            <YStack marginBottom="$4">
              <Text
                fontSize="$3"
                fontWeight="600"
                color="$gray12"
                marginBottom="$2"
              >
                Sport
              </Text>
              <Button
                backgroundColor="$gray1"
                borderRadius="$2"
                borderWidth={1}
                borderColor="$gray6"
                paddingHorizontal="$3"
                paddingVertical="$3"
                justifyContent="space-between"
                onPress={() => setShowSportDropdown(!showSportDropdown)}
                disabled={loading}
                unstyled
                flexDirection="row"
                alignItems="center"
              >
                <Text fontSize="$4" color="$gray12">
                  {SPORT_CONFIGS[formData.sport].name}
                </Text>
                <Text fontSize="$3" color="$gray10" marginLeft="auto">
                  ▼
                </Text>
              </Button>

              {showSportDropdown && (
                <YStack
                  backgroundColor="white"
                  borderRadius="$2"
                  borderWidth={1}
                  borderColor="$gray6"
                  marginTop="$1"
                >
                  {sportOptions.map((sport) => (
                    <Button
                      key={sport}
                      padding="$3"
                      borderBottomWidth={1}
                      borderBottomColor="$gray4"
                      backgroundColor="transparent"
                      justifyContent="flex-start"
                      onPress={() => {
                        setFormData((prev) => ({
                          ...prev,
                          sport: sport as
                            | 'baseball'
                            | 'football'
                            | 'basketball'
                            | 'hockey',
                        }));
                        setShowSportDropdown(false);
                      }}
                      unstyled
                      borderRadius={0}
                    >
                      <Text fontSize="$4" color="$gray12">
                        {SPORT_CONFIGS[sport].name}
                      </Text>
                    </Button>
                  ))}
                </YStack>
              )}
            </YStack>

            {/* Number of Teams */}
            <YStack marginBottom="$4">
              <Text
                fontSize="$3"
                fontWeight="600"
                color="$gray12"
                marginBottom="$2"
              >
                Number of Teams
              </Text>
              <Button
                backgroundColor="$gray1"
                borderRadius="$2"
                borderWidth={1}
                borderColor="$gray6"
                paddingHorizontal="$3"
                paddingVertical="$3"
                justifyContent="space-between"
                onPress={() => setShowTeamCountDropdown(!showTeamCountDropdown)}
                disabled={loading}
                unstyled
                flexDirection="row"
                alignItems="center"
              >
                <Text fontSize="$4" color="$gray12">
                  {formData.numberOfTeams} Teams
                </Text>
                <Text fontSize="$3" color="$gray10" marginLeft="auto">
                  ▼
                </Text>
              </Button>

              {showTeamCountDropdown && (
                <YStack
                  backgroundColor="white"
                  borderRadius="$2"
                  borderWidth={1}
                  borderColor="$gray6"
                  marginTop="$1"
                >
                  {DROPDOWN_TEAM_COUNT_ITEMS.map((item) => (
                    <Button
                      key={item.value}
                      padding="$3"
                      borderBottomWidth={1}
                      borderBottomColor="$gray4"
                      backgroundColor="transparent"
                      justifyContent="flex-start"
                      onPress={() => {
                        setFormData((prev) => ({
                          ...prev,
                          numberOfTeams: parseInt(item.value, 10),
                        }));
                        setShowTeamCountDropdown(false);
                      }}
                      unstyled
                      borderRadius={0}
                    >
                      <Text fontSize="$4" color="$gray12">
                        {item.text}
                      </Text>
                    </Button>
                  ))}
                </YStack>
              )}
            </YStack>

            {/* Player Pool */}
            <YStack marginBottom="$4">
              <Text
                fontSize="$3"
                fontWeight="600"
                color="$gray12"
                marginBottom="$2"
              >
                Player Pool
              </Text>
              <Button
                backgroundColor="$gray1"
                borderRadius="$2"
                borderWidth={1}
                borderColor="$gray6"
                paddingHorizontal="$3"
                paddingVertical="$3"
                justifyContent="space-between"
                onPress={() =>
                  setShowPlayerPoolDropdown(!showPlayerPoolDropdown)
                }
                disabled={loading}
                unstyled
                flexDirection="row"
                alignItems="center"
              >
                <Text fontSize="$4" color="$gray12">
                  {PLAYER_POOLS.find(
                    (p) => p.value === (formData.playerPool as string),
                  )?.label || 'All MLB'}
                </Text>
                <Text fontSize="$3" color="$gray10" marginLeft="auto">
                  ▼
                </Text>
              </Button>

              {showPlayerPoolDropdown && (
                <YStack
                  backgroundColor="white"
                  borderRadius="$2"
                  borderWidth={1}
                  borderColor="$gray6"
                  marginTop="$1"
                >
                  {PLAYER_POOLS.map((pool) => (
                    <Button
                      key={pool.value}
                      padding="$3"
                      borderBottomWidth={1}
                      borderBottomColor="$gray4"
                      backgroundColor="transparent"
                      justifyContent="flex-start"
                      onPress={() => {
                        setFormData((prev) => ({
                          ...prev,
                          playerPool: pool.value as PlayerPool,
                        }));
                        setShowPlayerPoolDropdown(false);
                      }}
                      unstyled
                      borderRadius={0}
                    >
                      <Text fontSize="$4" color="$gray12">
                        {pool.label}
                      </Text>
                    </Button>
                  ))}
                </YStack>
              )}
            </YStack>
          </ScrollView>

          {/* Action Buttons */}
          <XStack gap="$3" marginTop="$4">
            <Button
              flex={1}
              backgroundColor="$gray6"
              borderRadius="$2"
              onPress={onClose}
              disabled={loading}
            >
              <Text fontWeight="600" color="$gray12">
                Cancel
              </Text>
            </Button>

            <Button
              flex={1}
              backgroundColor="$blue10"
              borderRadius="$2"
              onPress={() => void handleSubmit()}
              disabled={loading}
              opacity={loading ? 0.6 : 1}
            >
              <Text fontWeight="600" color="white">
                {loading ? 'Creating...' : 'Create League'}
              </Text>
            </Button>
          </XStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}

export { CreateLeagueModal };

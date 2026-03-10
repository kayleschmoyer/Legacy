import React, { useEffect, useState } from 'react';
import {
  Adapt,
  Button,
  Dialog,
  Input,
  ScrollView,
  Sheet,
  Text,
  VisuallyHidden,
  XStack,
  YStack,
} from 'tamagui';
import { Alert, Platform } from '../../platform-components';
import {
  DIVISION_COUNTS,
  DRAFT_MODES,
  DRAFT_ORDERS,
  DROPDOWN_TEAM_COUNT_ITEMS,
  PLAYER_POOLS,
  SCHEDULING_STRATEGIES,
  SELECTION_METHODS,
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
  draftMode: DraftMode;
  selectionMethod: SelectionMethod;
  draftOrder: DraftOrder;
  numberOfDivisions: number;
  schedulingStrategy: 'divisional' | 'round-robin' | 'random';
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
    numberOfTeams: 12,
    playerPool: PlayerPool.ALL,
    draftMode: DraftMode.LIVE,
    selectionMethod: SelectionMethod.STANDARD,
    draftOrder: DraftOrder.SNAKE,
    numberOfDivisions: 2,
    schedulingStrategy: 'divisional',
  });

  const [showSportDropdown, setShowSportDropdown] = useState(false);
  const [showTeamCountDropdown, setShowTeamCountDropdown] = useState(false);
  const [showPlayerPoolDropdown, setShowPlayerPoolDropdown] = useState(false);
  const [showDraftModeDropdown, setShowDraftModeDropdown] = useState(false);
  const [showSelectionMethodDropdown, setShowSelectionMethodDropdown] =
    useState(false);
  const [showDraftOrderDropdown, setShowDraftOrderDropdown] = useState(false);
  const [showDivisionCountDropdown, setShowDivisionCountDropdown] =
    useState(false);
  const [showSchedulingStrategyDropdown, setShowSchedulingStrategyDropdown] =
    useState(false);

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
        numberOfTeams: 12,
        playerPool: PlayerPool.ALL,
        draftMode: DraftMode.LIVE,
        selectionMethod: SelectionMethod.STANDARD,
        draftOrder: DraftOrder.SNAKE,
        numberOfDivisions: 2,
        schedulingStrategy: 'divisional',
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
          padding="$6"
          width={Platform.OS === 'web' ? 400 : '90%'}
          maxHeight="80%"
          overflow="hidden"
        >
          <Dialog.Title
            fontSize="$6"
            fontWeight="bold"
            color="$gray12"
            marginBottom="$5"
            textAlign="center"
          >
            Create New League
          </Dialog.Title>
          <VisuallyHidden>
            <Dialog.Description>
              Fill in the form to create a new fantasy league.
            </Dialog.Description>
          </VisuallyHidden>

          <ScrollView showsVerticalScrollIndicator={false} flex={1}>
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

            {/* Draft Mode */}
            <YStack marginBottom="$4">
              <Text
                fontSize="$3"
                fontWeight="600"
                color="$gray12"
                marginBottom="$2"
              >
                Draft Mode
              </Text>
              <Button
                backgroundColor="$gray1"
                borderRadius="$2"
                borderWidth={1}
                borderColor="$gray6"
                paddingHorizontal="$3"
                paddingVertical="$3"
                justifyContent="space-between"
                onPress={() => setShowDraftModeDropdown(!showDraftModeDropdown)}
                disabled={loading}
                unstyled
                flexDirection="row"
                alignItems="center"
              >
                <Text fontSize="$4" color="$gray12">
                  {DRAFT_MODES.find(
                    (m) => m.value === (formData.draftMode as string),
                  )?.label ?? 'Live Draft'}
                </Text>
                <Text fontSize="$3" color="$gray10" marginLeft="auto">
                  ▼
                </Text>
              </Button>

              {showDraftModeDropdown && (
                <YStack
                  backgroundColor="white"
                  borderRadius="$2"
                  borderWidth={1}
                  borderColor="$gray6"
                  marginTop="$1"
                >
                  {DRAFT_MODES.map((mode) => (
                    <Button
                      key={mode.value}
                      padding="$3"
                      borderBottomWidth={1}
                      borderBottomColor="$gray4"
                      backgroundColor="transparent"
                      justifyContent="flex-start"
                      onPress={() => {
                        const newMode = mode.value as DraftMode;
                        setFormData((prev) => ({
                          ...prev,
                          draftMode: newMode,
                          // Automated drafts only support random selection
                          selectionMethod:
                            newMode === DraftMode.AUTOMATED
                              ? SelectionMethod.RANDOM
                              : prev.selectionMethod,
                        }));
                        setShowDraftModeDropdown(false);
                      }}
                      unstyled
                      borderRadius={0}
                    >
                      <Text fontSize="$4" color="$gray12">
                        {mode.label}
                      </Text>
                    </Button>
                  ))}
                </YStack>
              )}
            </YStack>

            {/* Selection Method */}
            <YStack marginBottom="$4">
              <Text
                fontSize="$3"
                fontWeight="600"
                color="$gray12"
                marginBottom="$2"
              >
                Selection Method
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
                  setShowSelectionMethodDropdown(!showSelectionMethodDropdown)
                }
                disabled={loading || formData.draftMode === DraftMode.AUTOMATED}
                opacity={formData.draftMode === DraftMode.AUTOMATED ? 0.5 : 1}
                unstyled
                flexDirection="row"
                alignItems="center"
              >
                <Text fontSize="$4" color="$gray12">
                  {SELECTION_METHODS.find(
                    (s) => s.value === (formData.selectionMethod as string),
                  )?.label ?? 'Standard'}
                </Text>
                <Text fontSize="$3" color="$gray10" marginLeft="auto">
                  ▼
                </Text>
              </Button>

              {showSelectionMethodDropdown && (
                <YStack
                  backgroundColor="white"
                  borderRadius="$2"
                  borderWidth={1}
                  borderColor="$gray6"
                  marginTop="$1"
                >
                  {SELECTION_METHODS.map((method) => (
                    <Button
                      key={method.value}
                      padding="$3"
                      borderBottomWidth={1}
                      borderBottomColor="$gray4"
                      backgroundColor="transparent"
                      justifyContent="flex-start"
                      onPress={() => {
                        setFormData((prev) => ({
                          ...prev,
                          selectionMethod: method.value as SelectionMethod,
                        }));
                        setShowSelectionMethodDropdown(false);
                      }}
                      unstyled
                      borderRadius={0}
                    >
                      <Text fontSize="$4" color="$gray12">
                        {method.label}
                      </Text>
                    </Button>
                  ))}
                </YStack>
              )}
            </YStack>

            {/* Draft Order */}
            <YStack marginBottom="$4">
              <Text
                fontSize="$3"
                fontWeight="600"
                color="$gray12"
                marginBottom="$2"
              >
                Draft Order
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
                  setShowDraftOrderDropdown(!showDraftOrderDropdown)
                }
                disabled={loading}
                unstyled
                flexDirection="row"
                alignItems="center"
              >
                <Text fontSize="$4" color="$gray12">
                  {DRAFT_ORDERS.find(
                    (o) => o.value === (formData.draftOrder as string),
                  )?.label ?? 'Snake'}
                </Text>
                <Text fontSize="$3" color="$gray10" marginLeft="auto">
                  ▼
                </Text>
              </Button>

              {showDraftOrderDropdown && (
                <YStack
                  backgroundColor="white"
                  borderRadius="$2"
                  borderWidth={1}
                  borderColor="$gray6"
                  marginTop="$1"
                >
                  {DRAFT_ORDERS.map((order) => (
                    <Button
                      key={order.value}
                      padding="$3"
                      borderBottomWidth={1}
                      borderBottomColor="$gray4"
                      backgroundColor="transparent"
                      justifyContent="flex-start"
                      onPress={() => {
                        setFormData((prev) => ({
                          ...prev,
                          draftOrder: order.value as DraftOrder,
                        }));
                        setShowDraftOrderDropdown(false);
                      }}
                      unstyled
                      borderRadius={0}
                    >
                      <Text fontSize="$4" color="$gray12">
                        {order.label}
                      </Text>
                    </Button>
                  ))}
                </YStack>
              )}
            </YStack>

            {/* Number of Divisions */}
            <YStack marginBottom="$4">
              <Text
                fontSize="$3"
                fontWeight="600"
                color="$gray12"
                marginBottom="$2"
              >
                Number of Divisions
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
                  setShowDivisionCountDropdown(!showDivisionCountDropdown)
                }
                disabled={loading}
                unstyled
                flexDirection="row"
                alignItems="center"
              >
                <Text fontSize="$4" color="$gray12">
                  {DIVISION_COUNTS.find(
                    (d) => d.value === formData.numberOfDivisions.toString(),
                  )?.label ?? '2 Divisions'}
                </Text>
                <Text fontSize="$3" color="$gray10" marginLeft="auto">
                  ▼
                </Text>
              </Button>

              {showDivisionCountDropdown && (
                <YStack
                  backgroundColor="white"
                  borderRadius="$2"
                  borderWidth={1}
                  borderColor="$gray6"
                  marginTop="$1"
                >
                  {DIVISION_COUNTS.map((division) => (
                    <Button
                      key={division.value}
                      padding="$3"
                      borderBottomWidth={1}
                      borderBottomColor="$gray4"
                      backgroundColor="transparent"
                      justifyContent="flex-start"
                      onPress={() => {
                        setFormData((prev) => ({
                          ...prev,
                          numberOfDivisions: parseInt(division.value, 10),
                        }));
                        setShowDivisionCountDropdown(false);
                      }}
                      unstyled
                      borderRadius={0}
                    >
                      <Text fontSize="$4" color="$gray12">
                        {division.label}
                      </Text>
                    </Button>
                  ))}
                </YStack>
              )}
            </YStack>

            {/* Scheduling Strategy */}
            <YStack marginBottom="$4">
              <Text
                fontSize="$3"
                fontWeight="600"
                color="$gray12"
                marginBottom="$2"
              >
                Scheduling Strategy
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
                  setShowSchedulingStrategyDropdown(
                    !showSchedulingStrategyDropdown,
                  )
                }
                disabled={loading}
                unstyled
                flexDirection="row"
                alignItems="center"
              >
                <Text fontSize="$4" color="$gray12">
                  {SCHEDULING_STRATEGIES.find(
                    (s) => s.value === formData.schedulingStrategy,
                  )?.label ?? 'Divisional'}
                </Text>
                <Text fontSize="$3" color="$gray10" marginLeft="auto">
                  ▼
                </Text>
              </Button>

              {showSchedulingStrategyDropdown && (
                <YStack
                  backgroundColor="white"
                  borderRadius="$2"
                  borderWidth={1}
                  borderColor="$gray6"
                  marginTop="$1"
                >
                  {SCHEDULING_STRATEGIES.map((strategy) => (
                    <Button
                      key={strategy.value}
                      padding="$3"
                      borderBottomWidth={1}
                      borderBottomColor="$gray4"
                      backgroundColor="transparent"
                      justifyContent="flex-start"
                      onPress={() => {
                        setFormData((prev) => ({
                          ...prev,
                          schedulingStrategy: strategy.value as
                            | 'divisional'
                            | 'round-robin'
                            | 'random',
                        }));
                        setShowSchedulingStrategyDropdown(false);
                      }}
                      unstyled
                      borderRadius={0}
                    >
                      <Text fontSize="$4" color="$gray12">
                        {strategy.label}
                      </Text>
                    </Button>
                  ))}
                </YStack>
              )}
            </YStack>
          </ScrollView>

          {/* Action Buttons */}
          <XStack gap="$3" marginTop="$4">
            <Dialog.Close asChild>
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
            </Dialog.Close>

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

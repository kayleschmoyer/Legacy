import React, { useEffect, useState } from 'react';
import {
  Adapt,
  Button,
  Dialog,
  Input,
  Label,
  ScrollView,
  Separator,
  Sheet,
  Text,
  VisuallyHidden,
  XStack,
  YStack,
} from 'tamagui';
import { X } from '@tamagui/lucide-icons';
import { Platform } from '../../platform-components';
import { Dropdown, DropdownItem } from '../../Dropdown';
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

const sportItems: readonly DropdownItem[] = Object.entries(SPORT_CONFIGS).map(
  ([key, config]) => ({ text: config.name, value: key }),
);

const teamCountItems: readonly DropdownItem[] = DROPDOWN_TEAM_COUNT_ITEMS.map(
  (item) => ({ text: `${item.text} Teams`, value: item.value }),
);

const playerPoolItems: readonly DropdownItem[] = PLAYER_POOLS.map((p) => ({
  text: p.label,
  value: p.value,
}));

const draftModeItems: readonly DropdownItem[] = DRAFT_MODES.map((m) => ({
  text: m.label,
  value: m.value,
}));

const selectionMethodItems: readonly DropdownItem[] = SELECTION_METHODS.map(
  (s) => ({ text: s.label, value: s.value }),
);

const draftOrderItems: readonly DropdownItem[] = DRAFT_ORDERS.map((o) => ({
  text: o.label,
  value: o.value,
}));

const divisionCountItems: readonly DropdownItem[] = DIVISION_COUNTS.map(
  (d) => ({ text: d.label, value: d.value }),
);

const schedulingStrategyItems: readonly DropdownItem[] =
  SCHEDULING_STRATEGIES.map((s) => ({ text: s.label, value: s.value }));

function SectionHeader({ children }: { children: string }) {
  return (
    <Text
      fontSize="$3"
      fontWeight="700"
      color="$gray11"
      textTransform="uppercase"
      letterSpacing={1}
    >
      {children}
    </Text>
  );
}

function FieldLabel({
  children,
  htmlFor,
}: {
  children: string;
  htmlFor?: string;
}) {
  return (
    <Label
      htmlFor={htmlFor}
      fontSize="$3"
      fontWeight="500"
      color="$gray11"
      marginBottom="$1"
    >
      {children}
    </Label>
  );
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

  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setValidationError(null);
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (!formData.leagueName.trim()) {
      setValidationError('Please enter a league name');
      return;
    }
    setValidationError(null);

    try {
      await onSubmit(formData);
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

  const displayError = validationError || error;

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
          opacity={0.5}
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />
        <Dialog.Content
          bordered
          elevate
          key="content"
          backgroundColor="$color2"
          borderColor="$borderColor"
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
          padding="$5"
          width={Platform.OS === 'web' ? 480 : '90%'}
          maxHeight={Platform.OS === 'web' ? '85vh' : '85%'}
          overflow="hidden"
        >
          {/* Header */}
          <XStack alignItems="center" justifyContent="space-between">
            <Dialog.Title fontSize="$7" fontWeight="bold" color="$color12">
              Create New League
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                size="$2"
                circular
                variant="outlined"
                backgroundColor="$color1"
                borderColor="$borderColor"
                icon={X}
              />
            </Dialog.Close>
          </XStack>
          <VisuallyHidden>
            <Dialog.Description>
              Fill in the form to create a new fantasy league.
            </Dialog.Description>
          </VisuallyHidden>

          <Separator borderColor="$borderColor" />

          {/* Error Display */}
          {displayError && (
            <XStack
              backgroundColor="$red2"
              borderColor="$red6"
              borderWidth={1}
              borderRadius="$3"
              paddingHorizontal="$3"
              paddingVertical="$2"
              alignItems="center"
            >
              <Text fontSize="$3" color="$red11" flex={1}>
                {displayError}
              </Text>
            </XStack>
          )}

          <ScrollView showsVerticalScrollIndicator={false} flex={1}>
            <YStack gap="$5" paddingBottom="$2">
              {/* League Info Section */}
              <YStack gap="$3">
                <SectionHeader>League Info</SectionHeader>

                <YStack gap="$1">
                  <FieldLabel htmlFor="league-name">League Name</FieldLabel>
                  <Input
                    id="league-name"
                    width="100%"
                    placeholder="Enter league name"
                    value={formData.leagueName}
                    onChangeText={(text: string) => {
                      setFormData((prev) => ({ ...prev, leagueName: text }));
                      if (validationError) setValidationError(null);
                    }}
                    editable={!loading}
                  />
                </YStack>

                <YStack gap="$1">
                  <FieldLabel>Sport</FieldLabel>
                  <Dropdown
                    value={formData.sport}
                    onChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        sport: value as CreateLeagueFormData['sport'],
                      }))
                    }
                    items={sportItems}
                    disabled={loading}
                    aria-label="Sport"
                  />
                </YStack>
              </YStack>

              <Separator borderColor="$borderColor" />

              {/* League Structure Section */}
              <YStack gap="$3">
                <SectionHeader>League Structure</SectionHeader>

                <XStack gap="$3" flexWrap="wrap">
                  <YStack gap="$1" flex={1} minWidth={140}>
                    <FieldLabel>Teams</FieldLabel>
                    <Dropdown
                      value={formData.numberOfTeams.toString()}
                      onChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          numberOfTeams: parseInt(value, 10),
                        }))
                      }
                      items={teamCountItems}
                      disabled={loading}
                      aria-label="Number of teams"
                    />
                  </YStack>

                  <YStack gap="$1" flex={1} minWidth={140}>
                    <FieldLabel>Divisions</FieldLabel>
                    <Dropdown
                      value={formData.numberOfDivisions.toString()}
                      onChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          numberOfDivisions: parseInt(value, 10),
                        }))
                      }
                      items={divisionCountItems}
                      disabled={loading}
                      aria-label="Number of divisions"
                    />
                  </YStack>
                </XStack>

                <XStack gap="$3" flexWrap="wrap">
                  <YStack gap="$1" flex={1} minWidth={140}>
                    <FieldLabel>Player Pool</FieldLabel>
                    <Dropdown
                      value={formData.playerPool as string}
                      onChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          playerPool: value as PlayerPool,
                        }))
                      }
                      items={playerPoolItems}
                      disabled={loading}
                      aria-label="Player pool"
                    />
                  </YStack>

                  <YStack gap="$1" flex={1} minWidth={140}>
                    <FieldLabel>Schedule</FieldLabel>
                    <Dropdown
                      value={formData.schedulingStrategy}
                      onChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          schedulingStrategy:
                            value as CreateLeagueFormData['schedulingStrategy'],
                        }))
                      }
                      items={schedulingStrategyItems}
                      disabled={loading}
                      aria-label="Scheduling strategy"
                    />
                  </YStack>
                </XStack>
              </YStack>

              <Separator borderColor="$borderColor" />

              {/* Draft Settings Section */}
              <YStack gap="$3">
                <SectionHeader>Draft Settings</SectionHeader>

                <YStack gap="$1">
                  <FieldLabel>Draft Mode</FieldLabel>
                  <Dropdown
                    value={formData.draftMode as string}
                    onChange={(value) => {
                      const newMode = value as DraftMode;
                      setFormData((prev) => ({
                        ...prev,
                        draftMode: newMode,
                        selectionMethod:
                          newMode === DraftMode.AUTOMATED
                            ? SelectionMethod.RANDOM
                            : prev.selectionMethod,
                      }));
                    }}
                    items={draftModeItems}
                    disabled={loading}
                    aria-label="Draft mode"
                  />
                </YStack>

                <XStack gap="$3" flexWrap="wrap">
                  <YStack gap="$1" flex={1} minWidth={140}>
                    <FieldLabel>Selection Method</FieldLabel>
                    <Dropdown
                      value={formData.selectionMethod as string}
                      onChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          selectionMethod: value as SelectionMethod,
                        }))
                      }
                      items={selectionMethodItems}
                      disabled={
                        loading || formData.draftMode === DraftMode.AUTOMATED
                      }
                      aria-label="Selection method"
                    />
                  </YStack>

                  <YStack gap="$1" flex={1} minWidth={140}>
                    <FieldLabel>Draft Order</FieldLabel>
                    <Dropdown
                      value={formData.draftOrder as string}
                      onChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          draftOrder: value as DraftOrder,
                        }))
                      }
                      items={draftOrderItems}
                      disabled={loading}
                      aria-label="Draft order"
                    />
                  </YStack>
                </XStack>
              </YStack>
            </YStack>
          </ScrollView>

          <Separator borderColor="$borderColor" />

          {/* Action Buttons */}
          <XStack gap="$3" justifyContent="flex-end">
            <Dialog.Close asChild>
              <Button
                variant="outlined"
                borderColor="$borderColor"
                disabled={loading}
              >
                Cancel
              </Button>
            </Dialog.Close>

            <Button
              theme="blue"
              onPress={() => void handleSubmit()}
              disabled={loading}
              opacity={loading ? 0.6 : 1}
            >
              {loading ? 'Creating...' : 'Create League'}
            </Button>
          </XStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}

export { CreateLeagueModal };

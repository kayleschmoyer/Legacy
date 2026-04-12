import React, { useState } from 'react';
import {
  Button,
  Dialog,
  H3,
  Input,
  Label,
  Select,
  Separator,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Filter, RotateCcw, X } from '@tamagui/lucide-icons';
import { BATTING_POSITIONS, PITCHING_POSITIONS } from '@legacy-sports/utils';
import { PlayerStatsFilters } from './PlayerStatsTypes';

// GraphQL Int is a 32-bit signed integer — clamp filter inputs to prevent query errors
const MAX_GRAPHQL_INT = 2147483647;
const clampInt = (value: string): number | undefined => {
  const n = parseInt(value, 10);
  return n ? Math.min(n, MAX_GRAPHQL_INT) : undefined;
};

export interface PlayerStatsFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: PlayerStatsFilters;
  onFiltersChange: (filters: PlayerStatsFilters) => void;
  onApply: () => void;
  onReset: () => void;
}

export function PlayerStatsFilterDialog({
  open,
  onOpenChange,
  filters,
  onFiltersChange,
  onApply,
  onReset,
}: PlayerStatsFilterDialogProps) {
  const [localFilters, setLocalFilters] = useState<PlayerStatsFilters>(filters);

  const updateFilter = (
    key: keyof PlayerStatsFilters,
    value: string | number | undefined,
  ) => {
    setLocalFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    onFiltersChange(localFilters);
    onApply();
    onOpenChange(false);
  };

  const handleReset = () => {
    const resetFilters: PlayerStatsFilters = {};
    setLocalFilters(resetFilters);
    onFiltersChange(resetFilters);
    onReset();
    onOpenChange(false);
  };

  const handleCancel = () => {
    setLocalFilters(filters); // Reset to original
    onOpenChange(false);
  };

  return (
    <Dialog modal open={open} onOpenChange={onOpenChange}>
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
          p="$4"
          width={600}
          maxWidth="90vw"
          maxHeight="80vh"
        >
          {/* Header */}
          <XStack ai="center" jc="space-between">
            <H3 color="$color12">Filter Player Statistics</H3>
            <Button
              size="$2"
              circular
              variant="outlined"
              backgroundColor="$color1"
              borderColor="$borderColor"
              icon={X}
              onPress={handleCancel}
            />
          </XStack>

          <Separator />

          {/* Filter Content */}
          <YStack gap="$4" maxHeight="60vh" overflow="scroll">
            {/* Basic Info Filters */}
            <YStack gap="$3">
              <Text fontSize="$4" fontWeight="bold" color="$gray11">
                Basic Information
              </Text>

              <XStack gap="$3" flexWrap="wrap">
                <YStack flex={1} minWidth={180}>
                  <Label htmlFor="team-filter">Team</Label>
                  <Input
                    id="team-filter"
                    placeholder="e.g., NYY, BOS, LAD"
                    value={localFilters.team || ''}
                    onChangeText={(value: string) =>
                      updateFilter('team', value)
                    }
                  />
                </YStack>

                <YStack flex={1} minWidth={180}>
                  <Label htmlFor="position-filter">Position</Label>
                  <Select
                    value={localFilters.position || '__all__'}
                    onValueChange={(value) =>
                      updateFilter(
                        'position',
                        value === '__all__' ? undefined : value,
                      )
                    }
                  >
                    <Select.Trigger id="position-filter">
                      <Select.Value placeholder="All positions" />
                    </Select.Trigger>
                    <Select.Content zIndex={200000}>
                      <Select.Viewport>
                        <Select.Item index={0} value="__all__">
                          <Select.ItemText>All Positions</Select.ItemText>
                        </Select.Item>
                        {[...BATTING_POSITIONS, ...PITCHING_POSITIONS].map(
                          (pos, idx) => (
                            <Select.Item key={pos} index={idx + 1} value={pos}>
                              <Select.ItemText>{pos}</Select.ItemText>
                            </Select.Item>
                          ),
                        )}
                      </Select.Viewport>
                    </Select.Content>
                  </Select>
                </YStack>
              </XStack>

              <YStack>
                <Label htmlFor="player-type-filter">Player Type</Label>
                <Select
                  value={localFilters.playerType || ''}
                  onValueChange={(value) =>
                    updateFilter('playerType', value || undefined)
                  }
                >
                  <Select.Trigger>
                    <Select.Value placeholder="All player types" />
                  </Select.Trigger>
                  <Select.Content zIndex={200000}>
                    <Select.Viewport>
                      <Select.Item index={0} value="">
                        <Select.ItemText>All Players</Select.ItemText>
                      </Select.Item>
                      <Select.Item index={1} value="BATTER">
                        <Select.ItemText>Batters Only</Select.ItemText>
                      </Select.Item>
                      <Select.Item index={2} value="PITCHER">
                        <Select.ItemText>Pitchers Only</Select.ItemText>
                      </Select.Item>
                      <Select.Item index={3} value="BOTH">
                        <Select.ItemText>Two-Way Players</Select.ItemText>
                      </Select.Item>
                    </Select.Viewport>
                  </Select.Content>
                </Select>
              </YStack>
            </YStack>

            <Separator />

            {/* Career Batting Filters */}
            <YStack gap="$3">
              <Text fontSize="$4" fontWeight="bold" color="$gray11">
                Career Batting Statistics
              </Text>

              <XStack gap="$3" flexWrap="wrap">
                <YStack flex={1} minWidth={120}>
                  <Label htmlFor="min-games">Min Games</Label>
                  <Input
                    id="min-games"
                    placeholder="0"
                    keyboardType="numeric"
                    value={localFilters.minGames?.toString() || ''}
                    onChangeText={(value: string) =>
                      updateFilter(
                        'minGames',
                        value ? clampInt(value) : undefined,
                      )
                    }
                  />
                </YStack>

                <YStack flex={1} minWidth={120}>
                  <Label htmlFor="max-games">Max Games</Label>
                  <Input
                    id="max-games"
                    placeholder="∞"
                    keyboardType="numeric"
                    value={localFilters.maxGames?.toString() || ''}
                    onChangeText={(value: string) =>
                      updateFilter(
                        'maxGames',
                        value ? clampInt(value) : undefined,
                      )
                    }
                  />
                </YStack>
              </XStack>

              <XStack gap="$3" flexWrap="wrap">
                <YStack flex={1} minWidth={120}>
                  <Label htmlFor="min-hr">Min Home Runs</Label>
                  <Input
                    id="min-hr"
                    placeholder="0"
                    keyboardType="numeric"
                    value={localFilters.minHomeRuns?.toString() || ''}
                    onChangeText={(value: string) =>
                      updateFilter(
                        'minHomeRuns',
                        value ? clampInt(value) : undefined,
                      )
                    }
                  />
                </YStack>

                <YStack flex={1} minWidth={120}>
                  <Label htmlFor="min-rbi">Min RBI</Label>
                  <Input
                    id="min-rbi"
                    placeholder="0"
                    keyboardType="numeric"
                    value={localFilters.minRBI?.toString() || ''}
                    onChangeText={(value: string) =>
                      updateFilter(
                        'minRBI',
                        value ? clampInt(value) : undefined,
                      )
                    }
                  />
                </YStack>
              </XStack>

              <XStack gap="$3" flexWrap="wrap">
                <YStack flex={1} minWidth={120}>
                  <Label htmlFor="min-avg">Min Batting Avg</Label>
                  <Input
                    id="min-avg"
                    placeholder="0.000"
                    value={localFilters.minBattingAvg?.toString() || ''}
                    onChangeText={(value: string) =>
                      updateFilter(
                        'minBattingAvg',
                        value ? parseFloat(value) || undefined : undefined,
                      )
                    }
                  />
                </YStack>

                <YStack flex={1} minWidth={120}>
                  <Label htmlFor="max-avg">Max Batting Avg</Label>
                  <Input
                    id="max-avg"
                    placeholder="1.000"
                    value={localFilters.maxBattingAvg?.toString() || ''}
                    onChangeText={(value: string) =>
                      updateFilter(
                        'maxBattingAvg',
                        value ? parseFloat(value) || undefined : undefined,
                      )
                    }
                  />
                </YStack>
              </XStack>
            </YStack>

            <Separator />

            {/* Career Pitching Filters */}
            <YStack gap="$3">
              <Text fontSize="$4" fontWeight="bold" color="$gray11">
                Career Pitching Statistics
              </Text>

              <XStack gap="$3" flexWrap="wrap">
                <YStack flex={1} minWidth={120}>
                  <Label htmlFor="min-wins">Min Wins</Label>
                  <Input
                    id="min-wins"
                    placeholder="0"
                    keyboardType="numeric"
                    value={localFilters.minWins?.toString() || ''}
                    onChangeText={(value: string) =>
                      updateFilter(
                        'minWins',
                        value ? clampInt(value) : undefined,
                      )
                    }
                  />
                </YStack>

                <YStack flex={1} minWidth={120}>
                  <Label htmlFor="max-wins">Max Wins</Label>
                  <Input
                    id="max-wins"
                    placeholder="∞"
                    keyboardType="numeric"
                    value={localFilters.maxWins?.toString() || ''}
                    onChangeText={(value: string) =>
                      updateFilter(
                        'maxWins',
                        value ? clampInt(value) : undefined,
                      )
                    }
                  />
                </YStack>
              </XStack>

              <XStack gap="$3" flexWrap="wrap">
                <YStack flex={1} minWidth={120}>
                  <Label htmlFor="min-era">Min ERA</Label>
                  <Input
                    id="min-era"
                    placeholder="0.00"
                    value={localFilters.minERA?.toString() || ''}
                    onChangeText={(value: string) =>
                      updateFilter(
                        'minERA',
                        value ? parseFloat(value) || undefined : undefined,
                      )
                    }
                  />
                </YStack>

                <YStack flex={1} minWidth={120}>
                  <Label htmlFor="max-era">Max ERA</Label>
                  <Input
                    id="max-era"
                    placeholder="∞"
                    value={localFilters.maxERA?.toString() || ''}
                    onChangeText={(value: string) =>
                      updateFilter(
                        'maxERA',
                        value ? parseFloat(value) || undefined : undefined,
                      )
                    }
                  />
                </YStack>
              </XStack>

              <XStack gap="$3" flexWrap="wrap">
                <YStack flex={1} minWidth={120}>
                  <Label htmlFor="min-strikeouts">Min Strikeouts</Label>
                  <Input
                    id="min-strikeouts"
                    placeholder="0"
                    keyboardType="numeric"
                    value={localFilters.minStrikeouts?.toString() || ''}
                    onChangeText={(value: string) =>
                      updateFilter(
                        'minStrikeouts',
                        value ? clampInt(value) : undefined,
                      )
                    }
                  />
                </YStack>

                <YStack flex={1} minWidth={120}>
                  <Label htmlFor="max-strikeouts">Max Strikeouts</Label>
                  <Input
                    id="max-strikeouts"
                    placeholder="∞"
                    keyboardType="numeric"
                    value={localFilters.maxStrikeouts?.toString() || ''}
                    onChangeText={(value: string) =>
                      updateFilter(
                        'maxStrikeouts',
                        value ? clampInt(value) : undefined,
                      )
                    }
                  />
                </YStack>
              </XStack>
            </YStack>

            <Separator />

            {/* Season Range Filters */}
            <YStack gap="$3">
              <Text fontSize="$4" fontWeight="bold" color="$gray11">
                Career Span
              </Text>

              <XStack gap="$3" flexWrap="wrap">
                <YStack flex={1} minWidth={120}>
                  <Label htmlFor="active-since">Active Since</Label>
                  <Input
                    id="active-since"
                    placeholder="1995"
                    keyboardType="numeric"
                    value={localFilters.activeSince || ''}
                    onChangeText={(value: string) =>
                      updateFilter('activeSince', value)
                    }
                  />
                </YStack>

                <YStack flex={1} minWidth={120}>
                  <Label htmlFor="active-until">Active Until</Label>
                  <Input
                    id="active-until"
                    placeholder="2024"
                    keyboardType="numeric"
                    value={localFilters.activeUntil || ''}
                    onChangeText={(value: string) =>
                      updateFilter('activeUntil', value)
                    }
                  />
                </YStack>
              </XStack>
            </YStack>
          </YStack>

          <Separator />

          {/* Action Buttons */}
          <XStack gap="$3" jc="flex-end">
            <Button variant="outlined" onPress={handleReset} icon={RotateCcw}>
              Reset All
            </Button>
            <Button variant="outlined" onPress={handleCancel}>
              Cancel
            </Button>
            <Button onPress={handleApply} icon={Filter} theme="blue">
              Apply Filters
            </Button>
          </XStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}

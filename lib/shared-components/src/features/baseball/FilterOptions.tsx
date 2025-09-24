import React, { useState } from 'react';
import { Select, Text, YStack } from 'tamagui';

// Position options for baseball
export const BASEBALL_POSITIONS = [
  { label: 'All Positions', value: '' },
  { label: 'Pitcher', value: 'P' },
  { label: 'Catcher', value: 'C' },
  { label: 'First Base', value: '1B' },
  { label: 'Second Base', value: '2B' },
  { label: 'Third Base', value: '3B' },
  { label: 'Shortstop', value: 'SS' },
  { label: 'Left Field', value: 'LF' },
  { label: 'Center Field', value: 'CF' },
  { label: 'Right Field', value: 'RF' },
  { label: 'Outfield', value: 'OF' },
  { label: 'Designated Hitter', value: 'DH' },
];

export interface FilterOptionsProps {
  position?: string;
  onPositionChange?: (position: string) => void;
  team?: string;
  onTeamChange?: (team: string) => void;
  league?: string;
  onLeagueChange?: (league: string) => void;
  disabled?: boolean;
  positions?: { label: string; value: string }[];
}

function FilterOptions({
  position = '',
  onPositionChange,
  team = '',
  onTeamChange,
  league = '',
  onLeagueChange,
  disabled = false,
  positions = BASEBALL_POSITIONS,
}: FilterOptionsProps) {
  const [localPosition, setLocalPosition] = useState(position);
  const [localTeam, setLocalTeam] = useState(team);
  const [localLeague, setLocalLeague] = useState(league);

  const handlePositionChange = (value: string) => {
    setLocalPosition(value);
    onPositionChange?.(value);
  };

  const handleTeamChange = (value: string) => {
    setLocalTeam(value);
    onTeamChange?.(value);
  };

  const handleLeagueChange = (value: string) => {
    setLocalLeague(value);
    onLeagueChange?.(value);
  };

  return (
    <YStack
      backgroundColor="$gray10"
      padding="$4"
      borderRadius="$3"
      marginBottom="$5"
      gap="$4"
    >
      {/* Position Filter */}
      {onPositionChange && (
        <YStack gap="$2">
          <Text color="$yellow10" fontSize="$4" fontWeight="bold">
            Position:
          </Text>
          <Select value={localPosition} onValueChange={handlePositionChange}>
            <Select.Trigger
              backgroundColor={disabled ? '$gray9' : '$gray8'}
              borderColor="$gray7"
              borderRadius="$3"
              padding="$2.5"
            >
              <Select.Value
                placeholder="Select Position"
                color={disabled ? '$gray6' : '$white'}
                fontSize="$4"
              />
            </Select.Trigger>

            <Select.Content>
              <Select.ScrollUpButton />
              <Select.Viewport>
                {positions.map((pos, idx) => (
                  <Select.Item key={pos.value} index={idx} value={pos.value}>
                    <Select.ItemText>{pos.label}</Select.ItemText>
                    <Select.ItemIndicator marginLeft="auto">
                      <Text>✓</Text>
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>
              <Select.ScrollDownButton />
            </Select.Content>
          </Select>
        </YStack>
      )}

      {/* Team Filter */}
      {onTeamChange && (
        <YStack gap="$2">
          <Text color="$yellow10" fontSize="$4" fontWeight="bold">
            Team:
          </Text>
          <Select value={localTeam} onValueChange={handleTeamChange}>
            <Select.Trigger
              backgroundColor={disabled ? '$gray9' : '$gray8'}
              borderColor="$gray7"
              borderRadius="$3"
              padding="$2.5"
            >
              <Select.Value
                placeholder="Select Team"
                color={disabled ? '$gray6' : '$white'}
                fontSize="$4"
              />
            </Select.Trigger>

            <Select.Content>
              <Select.ScrollUpButton />
              <Select.Viewport>
                <Select.Item index={0} value="">
                  <Select.ItemText>All Teams</Select.ItemText>
                  <Select.ItemIndicator marginLeft="auto">
                    <Text>✓</Text>
                  </Select.ItemIndicator>
                </Select.Item>
                <Select.Item index={1} value="NYY">
                  <Select.ItemText>New York Yankees</Select.ItemText>
                  <Select.ItemIndicator marginLeft="auto">
                    <Text>✓</Text>
                  </Select.ItemIndicator>
                </Select.Item>
                <Select.Item index={2} value="LAD">
                  <Select.ItemText>Los Angeles Dodgers</Select.ItemText>
                  <Select.ItemIndicator marginLeft="auto">
                    <Text>✓</Text>
                  </Select.ItemIndicator>
                </Select.Item>
                <Select.Item index={3} value="BOS">
                  <Select.ItemText>Boston Red Sox</Select.ItemText>
                  <Select.ItemIndicator marginLeft="auto">
                    <Text>✓</Text>
                  </Select.ItemIndicator>
                </Select.Item>
                <Select.Item index={4} value="SF">
                  <Select.ItemText>San Francisco Giants</Select.ItemText>
                  <Select.ItemIndicator marginLeft="auto">
                    <Text>✓</Text>
                  </Select.ItemIndicator>
                </Select.Item>
              </Select.Viewport>
              <Select.ScrollDownButton />
            </Select.Content>
          </Select>
        </YStack>
      )}

      {/* League Filter */}
      {onLeagueChange && (
        <YStack gap="$2">
          <Text color="$yellow10" fontSize="$4" fontWeight="bold">
            League:
          </Text>
          <Select value={localLeague} onValueChange={handleLeagueChange}>
            <Select.Trigger
              backgroundColor={disabled ? '$gray9' : '$gray8'}
              borderColor="$gray7"
              borderRadius="$3"
              padding="$2.5"
            >
              <Select.Value
                placeholder="Select League"
                color={disabled ? '$gray6' : '$white'}
                fontSize="$4"
              />
            </Select.Trigger>

            <Select.Content>
              <Select.ScrollUpButton />
              <Select.Viewport>
                <Select.Item index={0} value="">
                  <Select.ItemText>All Leagues</Select.ItemText>
                  <Select.ItemIndicator marginLeft="auto">
                    <Text>✓</Text>
                  </Select.ItemIndicator>
                </Select.Item>
                <Select.Item index={1} value="AL">
                  <Select.ItemText>American League</Select.ItemText>
                  <Select.ItemIndicator marginLeft="auto">
                    <Text>✓</Text>
                  </Select.ItemIndicator>
                </Select.Item>
                <Select.Item index={2} value="NL">
                  <Select.ItemText>National League</Select.ItemText>
                  <Select.ItemIndicator marginLeft="auto">
                    <Text>✓</Text>
                  </Select.ItemIndicator>
                </Select.Item>
              </Select.Viewport>
              <Select.ScrollDownButton />
            </Select.Content>
          </Select>
        </YStack>
      )}
    </YStack>
  );
}

export { FilterOptions };

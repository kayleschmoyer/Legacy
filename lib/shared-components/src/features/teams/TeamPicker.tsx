import React from 'react';
import { Picker } from '@react-native-picker/picker';
import { Select, Text, YStack } from 'tamagui';
import { Platform } from '../../platform-components';

// Generic team interface
export interface TeamData {
  id: number;
  name: string;
  abbreviation?: string;
  city?: string;
  league?: string;
  division?: string;
  color?: string;
}

export interface TeamPickerProps {
  selectedTeam: number;
  teams: TeamData[];
  onSelect: (teamId: number) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

// Cross-platform team picker component
function TeamPicker({
  selectedTeam,
  teams,
  onSelect,
  placeholder = 'Select a team',
  style,
}: TeamPickerProps) {
  if ((Platform.OS as string) === 'web') {
    // Web implementation using Tamagui Select
    return (
      <YStack minHeight={50} justifyContent="center" style={style}>
        <Select
          value={selectedTeam.toString()}
          onValueChange={(value) => onSelect(Number(value))}
        >
          <Select.Trigger
            backgroundColor="$gray8"
            borderColor="$gray6"
            borderRadius="$3"
            padding="$3"
          >
            <Select.Value placeholder={placeholder} />
          </Select.Trigger>

          <Select.Content>
            <Select.Viewport>
              <Select.Item value="0" disabled index={0}>
                <Select.ItemText>{placeholder}</Select.ItemText>
              </Select.Item>
              {teams.map((team, index) => (
                <Select.Item
                  key={team.id}
                  value={team.id.toString()}
                  index={index + 1}
                >
                  <Select.ItemText>{team.name}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select>
      </YStack>
    );
  }

  // Native implementation using Picker (if available) or fallback
  try {
    // Only try to load picker in React Native environment
    if ((Platform.OS as string) !== 'web' && typeof require !== 'undefined') {
      return (
        <YStack minHeight={50} justifyContent="center" style={style}>
          <Picker
            selectedValue={selectedTeam}
            onValueChange={(itemValue: number) => onSelect(itemValue)}
            style={{
              backgroundColor: '#333',
              color: '#fff',
            }}
            dropdownIconColor="#FFD700"
          >
            <Picker.Item label={placeholder} value={0} color="#999" />
            {teams.map((team) => (
              <Picker.Item
                key={team.id}
                label={team.name}
                value={team.id}
                color="#fff"
              />
            ))}
          </Picker>
        </YStack>
      );
    }
  } catch {
    // Fallback if picker is not available
  }

  // Fallback: Simple text display for selected team
  const selectedTeamData = teams.find((team) => team.id === selectedTeam);

  return (
    <YStack
      minHeight={50}
      justifyContent="center"
      backgroundColor="$gray8"
      borderRadius="$3"
      padding="$4"
      borderWidth={1}
      borderColor="$gray6"
      style={style}
    >
      <Text color="white" fontSize="$4" textAlign="center">
        {selectedTeamData ? selectedTeamData.name : placeholder}
      </Text>
      <Text color="$gray9" fontSize="$2" textAlign="center" marginTop="$1">
        (Picker component not available)
      </Text>
    </YStack>
  );
}

// Team picker with advanced features
export interface AdvancedTeamPickerProps extends TeamPickerProps {
  showDivisions?: boolean;
  showLeagues?: boolean;
  groupByDivision?: boolean;
  disabled?: boolean;
}

function AdvancedTeamPicker({
  selectedTeam,
  teams,
  onSelect,
  placeholder = 'Select a team',
  showDivisions = false,
  showLeagues = false,
  groupByDivision = false,
  disabled = false,
  style,
}: AdvancedTeamPickerProps) {
  // Group teams by division if requested
  const organizedTeams = groupByDivision
    ? teams.reduce(
        (acc, team) => {
          const division = team.division || 'Unknown Division';
          if (!acc[division]) {
            acc[division] = [];
          }
          acc[division].push(team);
          return acc;
        },
        {} as Record<string, TeamData[]>,
      )
    : { 'All Teams': teams };

  const formatTeamLabel = (team: TeamData): string => {
    let label = team.name;

    if (showLeagues && team.league) {
      label += ` (${team.league})`;
    }

    if (showDivisions && team.division) {
      label += ` - ${team.division}`;
    }

    return label;
  };

  if ((Platform.OS as string) === 'web') {
    return (
      <YStack minHeight={50} justifyContent="center" style={style}>
        <Select
          value={selectedTeam.toString()}
          onValueChange={(value) => onSelect(Number(value))}
          {...(!disabled && {})}
        >
          <Select.Trigger
            backgroundColor={disabled ? '$gray7' : '$gray8'}
            borderColor="$gray6"
            borderRadius="$3"
            padding="$3"
            opacity={disabled ? 0.6 : 1}
          >
            <Select.Value placeholder={placeholder} />
          </Select.Trigger>

          <Select.Content>
            <Select.Viewport>
              <Select.Item value="0" disabled index={0}>
                <Select.ItemText>{placeholder}</Select.ItemText>
              </Select.Item>

              {Object.entries(organizedTeams).map(
                ([division, divisionTeams], divisionIndex) => (
                  <Select.Group key={division}>
                    {groupByDivision && <Select.Label>{division}</Select.Label>}
                    {divisionTeams.map((team, teamIndex) => (
                      <Select.Item
                        key={team.id}
                        value={team.id.toString()}
                        index={divisionIndex * 10 + teamIndex + 1}
                      >
                        <Select.ItemText>
                          {formatTeamLabel(team)}
                        </Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Group>
                ),
              )}
            </Select.Viewport>
          </Select.Content>
        </Select>
      </YStack>
    );
  }

  // Native implementation
  try {
    // Only try to load picker in React Native environment
    if ((Platform.OS as string) !== 'web' && typeof require !== 'undefined') {
      return (
        <YStack minHeight={50} justifyContent="center" style={style}>
          <Picker
            selectedValue={selectedTeam}
            onValueChange={(itemValue: number) =>
              !disabled && onSelect(itemValue)
            }
            style={{
              backgroundColor: disabled ? '#222' : '#333',
              color: disabled ? '#666' : '#fff',
              opacity: disabled ? 0.6 : 1,
            }}
            dropdownIconColor="#FFD700"
            enabled={!disabled}
          >
            <Picker.Item label={placeholder} value={0} color="#999" />
            {teams.map((team) => (
              <Picker.Item
                key={team.id}
                label={formatTeamLabel(team)}
                value={team.id}
                color={disabled ? '#666' : '#fff'}
              />
            ))}
          </Picker>
        </YStack>
      );
    }
  } catch {
    // Fallback if picker is not available
  }

  // Fallback
  const selectedTeamData = teams.find((team) => team.id === selectedTeam);

  return (
    <YStack
      minHeight={50}
      justifyContent="center"
      backgroundColor="$gray8"
      borderRadius="$3"
      padding="$4"
      borderWidth={1}
      borderColor="$gray6"
      opacity={disabled ? 0.6 : 1}
      style={style}
    >
      <Text
        color={disabled ? '$gray10' : 'white'}
        fontSize="$4"
        textAlign="center"
      >
        {selectedTeamData ? formatTeamLabel(selectedTeamData) : placeholder}
      </Text>
      <Text color="$gray9" fontSize="$2" textAlign="center" marginTop="$1">
        (Picker component not available)
      </Text>
    </YStack>
  );
}

export { TeamPicker };
export { AdvancedTeamPicker };

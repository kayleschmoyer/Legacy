import React from 'react';
import { Picker } from '@react-native-picker/picker';
import type { StyleProp, ViewStyle } from 'react-native';
import { Platform, StyleSheet, Text, View } from '../../platform-components';
import { safeStyle } from '../../utils/styles';

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
    // Web implementation using HTML select
    return (
      <View style={safeStyle([styles.container, style])}>
        <select
          value={selectedTeam}
          onChange={(e) => onSelect(Number(e.target.value))}
          style={{
            ...styles.webSelect,
            backgroundColor: '#333',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '8px',
            padding: '10px',
            fontSize: '16px',
          }}
        >
          <option value={0} disabled>
            {placeholder}
          </option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </View>
    );
  }

  // Native implementation using Picker (if available) or fallback
  try {
    // Only try to load picker in React Native environment
    if ((Platform.OS as string) !== 'web' && typeof require !== 'undefined') {
      return (
        <View style={safeStyle([styles.container, style])}>
          <Picker
            selectedValue={selectedTeam}
            onValueChange={(itemValue: number) => onSelect(itemValue)}
            style={styles.picker}
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
        </View>
      );
    }
  } catch {
    // Fallback if picker is not available
  }

  // Fallback: Simple text display for selected team
  const selectedTeamData = teams.find((team) => team.id === selectedTeam);

  return (
    <View
      style={safeStyle([styles.container, styles.fallbackContainer, style])}
    >
      <Text style={styles.fallbackText}>
        {selectedTeamData ? selectedTeamData.name : placeholder}
      </Text>
      <Text style={styles.fallbackHint}>(Picker component not available)</Text>
    </View>
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
      <View style={safeStyle([styles.container, style])}>
        <select
          value={selectedTeam}
          onChange={(e) => onSelect(Number(e.target.value))}
          disabled={disabled}
          style={{
            ...styles.webSelect,
            backgroundColor: disabled ? '#222' : '#333',
            color: disabled ? '#666' : '#fff',
            border: '1px solid #555',
            borderRadius: '8px',
            padding: '10px',
            fontSize: '16px',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          <option value={0} disabled>
            {placeholder}
          </option>
          {Object.entries(organizedTeams).map(
            ([divisionName, divisionTeams]) => {
              if (groupByDivision && divisionTeams.length > 0) {
                return (
                  <optgroup key={divisionName} label={divisionName}>
                    {divisionTeams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {formatTeamLabel(team)}
                      </option>
                    ))}
                  </optgroup>
                );
              } else {
                return divisionTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {formatTeamLabel(team)}
                  </option>
                ));
              }
            },
          )}
        </select>
      </View>
    );
  }

  // Native implementation
  try {
    // Only try to load picker in React Native environment
    if ((Platform.OS as string) !== 'web' && typeof require !== 'undefined') {
      return (
        <View style={safeStyle([styles.container, style])}>
          <Picker
            selectedValue={selectedTeam}
            onValueChange={(itemValue: number) => !disabled && onSelect(itemValue)}
            style={[
              styles.picker,
              disabled && styles.pickerDisabled,
            ] as StyleProp<ViewStyle>}
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
        </View>
      );
    }
  } catch {
    // Fallback if picker is not available
  }

  // Fallback
  const selectedTeamData = teams.find((team) => team.id === selectedTeam);

  return (
    <View
      style={safeStyle([styles.container, styles.fallbackContainer, style])}
    >
      <Text
        style={safeStyle([
          styles.fallbackText,
          disabled && styles.fallbackTextDisabled,
        ])}
      >
        {selectedTeamData ? formatTeamLabel(selectedTeamData) : placeholder}
      </Text>
      <Text style={styles.fallbackHint}>(Picker component not available)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 50,
    justifyContent: 'center',
  },
  picker: {
    backgroundColor: '#333',
    color: '#fff',
  },
  pickerDisabled: {
    backgroundColor: '#222',
    opacity: 0.6,
  },
  webSelect: {
    width: '100%',
    outline: 'none',
  },
  fallbackContainer: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 15,
    borderWidth: 1,
    borderColor: '#555',
  },
  fallbackText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  fallbackTextDisabled: {
    color: '#666',
  },
  fallbackHint: {
    color: '#999',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 5,
  },
});

export { TeamPicker };
export { AdvancedTeamPicker };

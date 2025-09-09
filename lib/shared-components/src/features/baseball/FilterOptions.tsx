import React, { useState } from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';

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

export function FilterOptions({
  position = '',
  onPositionChange,
  team = '',
  onTeamChange,
  league = '',
  onLeagueChange,
  disabled = false,
  positions = BASEBALL_POSITIONS,
}: FilterOptionsProps): JSX.Element {
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

  // Web implementation
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        {/* Position Filter */}
        {onPositionChange && (
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Position:</Text>
            <select
              value={localPosition}
              onChange={(e) => handlePositionChange(e.target.value)}
              disabled={disabled}
              style={{
                ...styles.webSelect,
                backgroundColor: disabled ? '#222' : '#333',
                color: disabled ? '#666' : '#fff',
              }}
            >
              {positions.map((pos) => (
                <option key={pos.value} value={pos.value}>
                  {pos.label}
                </option>
              ))}
            </select>
          </View>
        )}

        {/* Team Filter */}
        {onTeamChange && (
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>Team:</Text>
            <select
              value={localTeam}
              onChange={(e) => handleTeamChange(e.target.value)}
              disabled={disabled}
              style={{
                ...styles.webSelect,
                backgroundColor: disabled ? '#222' : '#333',
                color: disabled ? '#666' : '#fff',
              }}
            >
              <option value="">All Teams</option>
              <option value="NYY">New York Yankees</option>
              <option value="LAD">Los Angeles Dodgers</option>
              <option value="BOS">Boston Red Sox</option>
              <option value="SF">San Francisco Giants</option>
              {/* Add more teams as needed */}
            </select>
          </View>
        )}

        {/* League Filter */}
        {onLeagueChange && (
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>League:</Text>
            <select
              value={localLeague}
              onChange={(e) => handleLeagueChange(e.target.value)}
              disabled={disabled}
              style={{
                ...styles.webSelect,
                backgroundColor: disabled ? '#222' : '#333',
                color: disabled ? '#666' : '#fff',
              }}
            >
              <option value="">All Leagues</option>
              <option value="AL">American League</option>
              <option value="NL">National League</option>
            </select>
          </View>
        )}
      </View>
    );
  }

  // Native implementation
  try {
    // Only try to load picker in React Native environment
    if (Platform.OS !== 'web') {
      return (
        <View style={styles.container}>
          {/* Position Filter */}
          {onPositionChange && (
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Position:</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={localPosition}
                  onValueChange={handlePositionChange}
                  style={[styles.picker, disabled && styles.pickerDisabled]}
                  enabled={!disabled}
                  dropdownIconColor="#FFD700"
                >
                  {positions.map((pos) => (
                    <Picker.Item
                      key={pos.value}
                      label={pos.label}
                      value={pos.value}
                      color={disabled ? '#666' : '#fff'}
                    />
                  ))}
                </Picker>
              </View>
            </View>
          )}

          {/* Team Filter */}
          {onTeamChange && (
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Team:</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={localTeam}
                  onValueChange={handleTeamChange}
                  style={[styles.picker, disabled && styles.pickerDisabled]}
                  enabled={!disabled}
                  dropdownIconColor="#FFD700"
                >
                  <Picker.Item
                    label="All Teams"
                    value=""
                    color={disabled ? '#666' : '#fff'}
                  />
                  <Picker.Item
                    label="New York Yankees"
                    value="NYY"
                    color={disabled ? '#666' : '#fff'}
                  />
                  <Picker.Item
                    label="Los Angeles Dodgers"
                    value="LAD"
                    color={disabled ? '#666' : '#fff'}
                  />
                  <Picker.Item
                    label="Boston Red Sox"
                    value="BOS"
                    color={disabled ? '#666' : '#fff'}
                  />
                  <Picker.Item
                    label="San Francisco Giants"
                    value="SF"
                    color={disabled ? '#666' : '#fff'}
                  />
                </Picker>
              </View>
            </View>
          )}

          {/* League Filter */}
          {onLeagueChange && (
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>League:</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={localLeague}
                  onValueChange={handleLeagueChange}
                  style={[styles.picker, disabled && styles.pickerDisabled]}
                  enabled={!disabled}
                  dropdownIconColor="#FFD700"
                >
                  <Picker.Item
                    label="All Leagues"
                    value=""
                    color={disabled ? '#666' : '#fff'}
                  />
                  <Picker.Item
                    label="American League"
                    value="AL"
                    color={disabled ? '#666' : '#fff'}
                  />
                  <Picker.Item
                    label="National League"
                    value="NL"
                    color={disabled ? '#666' : '#fff'}
                  />
                </Picker>
              </View>
            </View>
          )}
        </View>
      );
    }
  } catch {
    // Fallback if picker is not available
  }

  // Fallback without picker
  return (
    <View style={styles.container}>
      <Text style={styles.fallbackText}>
        Filter Options (Picker not available)
      </Text>
      {onPositionChange && (
        <Text style={styles.filterStatus}>
          Position:{' '}
          {positions.find((p) => p.value === localPosition)?.label || 'All'}
        </Text>
      )}
      {onTeamChange && (
        <Text style={styles.filterStatus}>
          Team: {localTeam || 'All Teams'}
        </Text>
      )}
      {onLeagueChange && (
        <Text style={styles.filterStatus}>
          League: {localLeague || 'All Leagues'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E1E1E',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  filterGroup: {
    marginBottom: 15,
  },
  filterLabel: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  pickerContainer: {
    backgroundColor: '#333',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#555',
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
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #555',
    fontSize: '16px',
    outline: 'none',
    width: '100%',
  },
  fallbackText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  filterStatus: {
    color: '#CCCCCC',
    fontSize: 14,
    marginBottom: 5,
  },
});

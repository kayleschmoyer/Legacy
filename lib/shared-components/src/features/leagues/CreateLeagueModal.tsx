import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from '../../platform-components';
import { safeStyle } from '../../utils/styles';
import {
  DRAFT_TYPES,
  DROPDOWN_TEAM_COUNT_ITEMS,
  SPORT_CONFIGS,
} from '../../config/sports';
import { DraftType, League } from '../../types';

export interface CreateLeagueFormData {
  leagueName: string;
  sport: 'baseball' | 'football' | 'basketball' | 'hockey';
  numberOfTeams: number;
  draftType: DraftType;
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
    draftType: DraftType.NORMAL,
  });

  const [showSportDropdown, setShowSportDropdown] = useState(false);
  const [showTeamCountDropdown, setShowTeamCountDropdown] = useState(false);
  const [showDraftTypeDropdown, setShowDraftTypeDropdown] = useState(false);

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
        draftType: DraftType.NORMAL,
      });
    } catch (err) {
      // Error handling is done via the error prop
    }
  };

  const renderDropdown = (
    value: string,
    options: Array<{ label: string; value: string }>,
    onSelect: (value: string) => void,
    isVisible: boolean,
    onToggle: () => void,
  ) => (
    <View style={styles.dropdownContainer}>
      <TouchableOpacity
        style={styles.dropdownButton}
        onPress={onToggle}
        disabled={loading}
      >
        <Text style={styles.dropdownButtonText}>{value}</Text>
        <Text style={styles.dropdownArrow}>▼</Text>
      </TouchableOpacity>

      {isVisible && (
        <View style={styles.dropdownMenu}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={styles.dropdownMenuItem}
              onPress={() => {
                onSelect(option.value);
                onToggle();
              }}
            >
              <Text style={styles.dropdownMenuText}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Create New League</Text>

          {/* League Name Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>League Name</Text>
            <TextInput
              style={styles.textInput}
              value={formData.leagueName}
              onChangeText={(text) =>
                setFormData((prev) => ({ ...prev, leagueName: text }))
              }
              placeholder="Enter league name"
              placeholderTextColor="#888"
              editable={!loading}
            />
          </View>

          {/* Sport Selection */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Sport</Text>
            {renderDropdown(
              SPORT_CONFIGS[formData.sport].name,
              sportOptions.map((sport) => ({
                label: SPORT_CONFIGS[sport].name,
                value: sport,
              })),
              (value) =>
                setFormData((prev) => ({ ...prev, sport: value as any })),
              showSportDropdown,
              () => setShowSportDropdown(!showSportDropdown),
            )}
          </View>

          {/* Number of Teams */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Number of Teams</Text>
            {renderDropdown(
              formData.numberOfTeams.toString(),
              DROPDOWN_TEAM_COUNT_ITEMS.map((item) => ({
                label: item.text,
                value: item.value,
              })),
              (value) =>
                setFormData((prev) => ({
                  ...prev,
                  numberOfTeams: parseInt(value, 10),
                })),
              showTeamCountDropdown,
              () => setShowTeamCountDropdown(!showTeamCountDropdown),
            )}
          </View>

          {/* Draft Type */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Draft Type</Text>
            {renderDropdown(
              DRAFT_TYPES.find((type) => type.value === formData.draftType)
                ?.label || 'Normal',
              [...DRAFT_TYPES],
              (value) =>
                setFormData((prev) => ({
                  ...prev,
                  draftType: value as DraftType,
                })),
              showDraftTypeDropdown,
              () => setShowDraftTypeDropdown(!showDraftTypeDropdown),
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={safeStyle([styles.button, styles.cancelButton])}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={safeStyle([
                styles.button,
                styles.submitButton,
                loading && styles.disabledButton,
              ])}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.submitButtonText}>
                {loading ? 'Creating...' : 'Create League'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: Platform.OS === 'web' ? 400 : '90%',
    backgroundColor: '#1E1E1E',
    borderRadius: 15,
    padding: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
      },
    }),
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF8C00',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#555',
  },
  dropdownContainer: {
    position: 'relative',
    zIndex: 1000,
  },
  dropdownButton: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#555',
  },
  dropdownButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#888',
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#555',
    zIndex: 1001,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
      },
    }),
  },
  dropdownMenuItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  dropdownMenuText: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#555',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  submitButton: {
    backgroundColor: '#FF8C00',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  disabledButton: {
    backgroundColor: '#666',
    opacity: 0.6,
  },
});

export { CreateLeagueModal };

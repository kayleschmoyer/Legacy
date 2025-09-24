import React, { useEffect, useState } from 'react';
import { Button, Input, ScrollView, Text, XStack, YStack } from 'tamagui';
import {
  Alert,
  Modal,
  Platform,
  TouchableOpacity,
} from '../../platform-components';
import { safeStyle } from '../../utils/styles';
import {
  DRAFT_TYPES,
  DROPDOWN_TEAM_COUNT_ITEMS,
  SPORT_CONFIGS,
} from '../../config/sports';
import { DraftType } from '../../types';

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
    } catch {
      // Error handling is done via the error prop
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <YStack
        flex={1}
        backgroundColor="rgba(0, 0, 0, 0.7)"
        justifyContent="center"
        alignItems="center"
      >
        <YStack
          backgroundColor="white"
          borderRadius="$4"
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
              <TouchableOpacity
                style={safeStyle([
                  {
                    backgroundColor: '$gray1',
                    borderRadius: 8,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: '$gray6',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  },
                ])}
                onPress={() => setShowSportDropdown(!showSportDropdown)}
                disabled={loading}
              >
                <Text fontSize="$4" color="$gray12">
                  {SPORT_CONFIGS[formData.sport].name}
                </Text>
                <Text fontSize="$3" color="$gray10">
                  ▼
                </Text>
              </TouchableOpacity>

              {showSportDropdown && (
                <YStack
                  backgroundColor="white"
                  borderRadius="$2"
                  borderWidth={1}
                  borderColor="$gray6"
                  marginTop="$1"
                >
                  {sportOptions.map((sport) => (
                    <TouchableOpacity
                      key={sport}
                      style={safeStyle([
                        {
                          padding: 12,
                          borderBottomWidth: 1,
                          borderBottomColor: '$gray4',
                        },
                      ])}
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
                    >
                      <Text fontSize="$4" color="$gray12">
                        {SPORT_CONFIGS[sport].name}
                      </Text>
                    </TouchableOpacity>
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
              <TouchableOpacity
                style={safeStyle([
                  {
                    backgroundColor: '$gray1',
                    borderRadius: 8,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: '$gray6',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  },
                ])}
                onPress={() => setShowTeamCountDropdown(!showTeamCountDropdown)}
                disabled={loading}
              >
                <Text fontSize="$4" color="$gray12">
                  {formData.numberOfTeams} Teams
                </Text>
                <Text fontSize="$3" color="$gray10">
                  ▼
                </Text>
              </TouchableOpacity>

              {showTeamCountDropdown && (
                <YStack
                  backgroundColor="white"
                  borderRadius="$2"
                  borderWidth={1}
                  borderColor="$gray6"
                  marginTop="$1"
                >
                  {DROPDOWN_TEAM_COUNT_ITEMS.map((item) => (
                    <TouchableOpacity
                      key={item.value}
                      style={safeStyle([
                        {
                          padding: 12,
                          borderBottomWidth: 1,
                          borderBottomColor: '$gray4',
                        },
                      ])}
                      onPress={() => {
                        setFormData((prev) => ({
                          ...prev,
                          numberOfTeams: parseInt(item.value, 10),
                        }));
                        setShowTeamCountDropdown(false);
                      }}
                    >
                      <Text fontSize="$4" color="$gray12">
                        {item.text}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </YStack>
              )}
            </YStack>

            {/* Draft Type */}
            <YStack marginBottom="$4">
              <Text
                fontSize="$3"
                fontWeight="600"
                color="$gray12"
                marginBottom="$2"
              >
                Draft Type
              </Text>
              <TouchableOpacity
                style={safeStyle([
                  {
                    backgroundColor: '$gray1',
                    borderRadius: 8,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: '$gray6',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  },
                ])}
                onPress={() => setShowDraftTypeDropdown(!showDraftTypeDropdown)}
                disabled={loading}
              >
                <Text fontSize="$4" color="$gray12">
                  {DRAFT_TYPES.find(
                    (type) => type.value === (formData.draftType as string),
                  )?.label || 'Normal'}
                </Text>
                <Text fontSize="$3" color="$gray10">
                  ▼
                </Text>
              </TouchableOpacity>

              {showDraftTypeDropdown && (
                <YStack
                  backgroundColor="white"
                  borderRadius="$2"
                  borderWidth={1}
                  borderColor="$gray6"
                  marginTop="$1"
                >
                  {DRAFT_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type.value}
                      style={safeStyle([
                        {
                          padding: 12,
                          borderBottomWidth: 1,
                          borderBottomColor: '$gray4',
                        },
                      ])}
                      onPress={() => {
                        setFormData((prev) => ({
                          ...prev,
                          draftType: type.value as DraftType,
                        }));
                        setShowDraftTypeDropdown(false);
                      }}
                    >
                      <Text fontSize="$4" color="$gray12">
                        {type.label}
                      </Text>
                    </TouchableOpacity>
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
        </YStack>
      </YStack>
    </Modal>
  );
}

export { CreateLeagueModal };

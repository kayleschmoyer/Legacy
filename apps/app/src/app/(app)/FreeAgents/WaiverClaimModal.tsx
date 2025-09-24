import React, { useState } from 'react';
import { Modal, TouchableOpacity, View } from 'react-native';
import { Button, Input, Text, XStack, YStack } from '@tamagui/core';

// Types
interface Player {
  id: string;
  name: string;
  position: string;
  team: string;
  rank: number;
  ownership: number;
  trending: 'up' | 'down' | 'stable';
  injury: 'healthy' | 'questionable' | 'doubtful' | 'out';
  stats: Record<string, number>;
  projections: Record<string, number>;
  isWatched: boolean;
  faabValue: number;
}

interface WaiverClaim {
  playerId: string;
  priority: number;
  faabBid: number;
  dropPlayerId?: string;
}

interface SportConfig {
  colors: {
    accent: string;
    primary: string;
    secondary: string;
  };
  positions: string[];
  sortOptions: string[];
  stats: string[];
}

const SPORT_CONFIGS: Record<string, SportConfig> = {
  baseball: {
    colors: { accent: '#ff6b35', primary: '#1a1a1a', secondary: '#2d2d2d' },
    positions: ['C', '1B', '2B', '3B', 'SS', 'OF', 'P'],
    sortOptions: ['Rank', 'AVG', 'HR', 'RBI', 'ERA', 'WHIP', 'Ownership%'],
    stats: ['AVG', 'HR', 'RBI', 'R', 'SB', 'ERA', 'W', 'K', 'SV', 'OBP'],
  },
  football: {
    colors: { accent: '#f97316', primary: '#7c2d12', secondary: '#ea580c' },
    positions: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'],
    sortOptions: [
      'Rank',
      'PassYds',
      'PassTDs',
      'RushYds',
      'RushTDs',
      'RecYds',
      'RecTDs',
      'Ownership%',
    ],
    stats: ['PassYds', 'PassTDs', 'RushYds', 'RushTDs', 'RecYds', 'RecTDs'],
  },
};

export const WaiverClaimModal: React.FC<{
  player: Player | null;
  visible: boolean;
  onClose: () => void;
  onSubmit: (claim: WaiverClaim) => void;
  sport: string;
}> = ({ player, visible, onClose, onSubmit, sport }) => {
  const [faabBid, setFaabBid] = useState('');
  const [priority, setPriority] = useState(1);
  const sportConfig = SPORT_CONFIGS[sport];

  const handleSubmit = () => {
    if (player) {
      onSubmit({
        faabBid: parseInt(faabBid) || 0,
        playerId: player.id,
        priority,
      });
      onClose();
      setFaabBid('');
      setPriority(1);
    }
  };

  if (!player) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View
        style={{
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.7)',
          flex: 1,
          justifyContent: 'center',
        }}
      >
        <YStack
          backgroundColor="#2d2d2d"
          borderRadius="$4"
          maxWidth={400}
          padding="$6"
          width="90%"
        >
          <Text
            color="#ffffff"
            fontSize="$7"
            fontWeight="700"
            marginBottom="$4"
            textAlign="center"
          >
            Add Waiver Claim
          </Text>

          <YStack alignItems="center" marginBottom="$6">
            <Text color="#ffffff" fontSize="$6" fontWeight="600">
              {player.name}
            </Text>
            <Text color="rgba(255,255,255,0.7)" fontSize="$4">
              {player.team} - {player.position}
            </Text>
          </YStack>

          <YStack marginBottom="$6">
            <Text
              color="#ffffff"
              fontSize="$4"
              fontWeight="600"
              marginBottom="$2"
            >
              FAAB Bid ($)
            </Text>
            <Input
              backgroundColor="rgba(255,255,255,0.1)"
              borderRadius="$2"
              color="#ffffff"
              fontSize="$5"
              keyboardType="numeric"
              marginBottom="$4"
              onChangeText={setFaabBid}
              padding="$3"
              placeholder="Enter bid amount"
              placeholderTextColor="#666"
              value={faabBid}
            />

            <Text
              color="#ffffff"
              fontSize="$4"
              fontWeight="600"
              marginBottom="$2"
            >
              Waiver Priority
            </Text>
            <XStack gap="$2">
              {[1, 2, 3, 4, 5].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={{
                    alignItems: 'center',
                    backgroundColor:
                      priority === p
                        ? sportConfig.colors.accent
                        : 'rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    flex: 1,
                    paddingVertical: 12,
                  }}
                  onPress={() => setPriority(p)}
                >
                  <Text color="#ffffff" fontSize="$5" fontWeight="600">
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </XStack>
          </YStack>

          <XStack gap="$3">
            <Button
              backgroundColor="rgba(255,255,255,0.1)"
              borderRadius="$2"
              flex={1}
              onPress={onClose}
              pressStyle={{ opacity: 0.8 }}
            >
              <Text color="#ffffff" fontSize="$5" fontWeight="600">
                Cancel
              </Text>
            </Button>
            <Button
              backgroundColor={sportConfig.colors.accent}
              borderRadius="$2"
              flex={1}
              onPress={handleSubmit}
              pressStyle={{ opacity: 0.8 }}
            >
              <Text color="#ffffff" fontSize="$5" fontWeight="600">
                Submit Claim
              </Text>
            </Button>
          </XStack>
        </YStack>
      </View>
    </Modal>
  );
};

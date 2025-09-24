import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, XStack, YStack } from '@tamagui/core';
import { Filter } from '../DraftBoardPage';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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

export const FilterPanel: React.FC<{
  sport: string;
  filters: Filter;
  onFiltersChange: (filters: Filter) => void;
  visible: boolean;
  onClose: () => void;
}> = ({ sport, filters, onFiltersChange, visible, onClose }) => {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const sportConfig = SPORT_CONFIGS[sport];

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : SCREEN_HEIGHT,
      useNativeDriver: true,
    }).start();
  }, [visible, slideAnim]);

  return (
    <Modal visible={visible} transparent>
      <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', flex: 1 }}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} />
        <Animated.View
          style={{
            backgroundColor: 'rgba(30,41,59,0.95)',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: SCREEN_HEIGHT * 0.8,
            transform: [{ translateY: slideAnim }],
          }}
        >
          <XStack
            alignItems="center"
            borderBottomColor="rgba(255,255,255,0.2)"
            borderBottomWidth={1}
            justifyContent="space-between"
            padding="$5"
          >
            <Text color="#ffffff" fontSize="$7" fontWeight="700">
              Advanced Filters
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text color="#ffffff" fontSize="$8">
                ✕
              </Text>
            </TouchableOpacity>
          </XStack>

          <ScrollView style={{ padding: 20 }}>
            {/* Position Filter */}
            <Text
              color="#ffffff"
              fontSize="$5"
              fontWeight="600"
              marginBottom="$3"
              marginTop="$4"
            >
              Position
            </Text>
            <XStack flexWrap="wrap" gap="$2">
              {['ALL', ...sportConfig.positions].map((pos) => (
                <TouchableOpacity
                  key={pos}
                  style={{
                    backgroundColor:
                      filters.position === pos
                        ? sportConfig.colors.accent
                        : 'rgba(255,255,255,0.1)',
                    borderColor: 'rgba(255,255,255,0.2)',
                    borderRadius: 20,
                    borderWidth: 1,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                  }}
                  onPress={() => onFiltersChange({ ...filters, position: pos })}
                >
                  <Text color="#ffffff" fontSize="$4" fontWeight="600">
                    {pos}
                  </Text>
                </TouchableOpacity>
              ))}
            </XStack>

            {/* Availability Filter */}
            <Text
              color="#ffffff"
              fontSize="$5"
              fontWeight="600"
              marginBottom="$3"
              marginTop="$4"
            >
              Availability
            </Text>
            <XStack flexWrap="wrap" gap="$2">
              {['All', 'Available', 'Waivers', 'Free Agents'].map((avail) => (
                <TouchableOpacity
                  key={avail}
                  style={{
                    backgroundColor:
                      filters.availability === avail
                        ? sportConfig.colors.accent
                        : 'rgba(255,255,255,0.1)',
                    borderColor: 'rgba(255,255,255,0.2)',
                    borderRadius: 20,
                    borderWidth: 1,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                  }}
                  onPress={() =>
                    onFiltersChange({ ...filters, availability: avail })
                  }
                >
                  <Text color="#ffffff" fontSize="$4" fontWeight="600">
                    {avail}
                  </Text>
                </TouchableOpacity>
              ))}
            </XStack>

            {/* Trending Filter */}
            <Text
              color="#ffffff"
              fontSize="$5"
              fontWeight="600"
              marginBottom="$3"
              marginTop="$4"
            >
              Trending
            </Text>
            <XStack flexWrap="wrap" gap="$2">
              {['All', 'Rising', 'Falling', 'Hot Adds'].map((trend) => (
                <TouchableOpacity
                  key={trend}
                  style={{
                    backgroundColor:
                      filters.trending === trend
                        ? sportConfig.colors.accent
                        : 'rgba(255,255,255,0.1)',
                    borderColor: 'rgba(255,255,255,0.2)',
                    borderRadius: 20,
                    borderWidth: 1,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                  }}
                  onPress={() =>
                    onFiltersChange({ ...filters, trending: trend })
                  }
                >
                  <Text color="#ffffff" fontSize="$4" fontWeight="600">
                    {trend}
                  </Text>
                </TouchableOpacity>
              ))}
            </XStack>

            {/* Ownership Range */}
            <Text
              color="#ffffff"
              fontSize="$5"
              fontWeight="600"
              marginBottom="$3"
              marginTop="$4"
            >
              Ownership %
            </Text>
            <YStack
              backgroundColor="rgba(255,255,255,0.1)"
              borderRadius="$3"
              padding="$4"
            >
              <Text color="#ffffff" fontSize="$4">
                0% - 100%
              </Text>
            </YStack>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

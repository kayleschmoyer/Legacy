import React from 'react';
import {
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from '../../platform-components';
import { safeStyle } from '../../utils/styles';
import { DEFAULT_COLORS, SPORT_CONFIGS } from '../../config/sports';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_TABLET = SCREEN_WIDTH > 768;

export interface SportOption {
  key: string;
  name: string;
  icon?: string;
  enabled?: boolean;
}

export interface HomeScreenProps {
  title?: string;
  subtitle?: string;
  sports?: SportOption[];
  onSportPress: (sportKey: string) => void;
  customActions?: Array<{
    title: string;
    icon?: string;
    onPress: () => void;
    color?: string;
  }>;
  showAllSports?: boolean;
}

function HomeScreen({
  title = 'Fantasy Sports Hub',
  subtitle = 'Choose your sport',
  sports,
  onSportPress,
  customActions = [],
  showAllSports = true,
}: HomeScreenProps) {
  // Default to all configured sports if none provided
  const defaultSports: SportOption[] = Object.keys(SPORT_CONFIGS).map(
    (key) => ({
      key,
      name: SPORT_CONFIGS[key].name,
      enabled: true,
    }),
  );

  const allSports = sports || defaultSports;
  const availableSports = showAllSports
    ? allSports
    : allSports.filter((sport) => sport.enabled !== false);

  const getSportIcon = (sportKey: string): string => {
    const icons: Record<string, string> = {
      baseball: '⚾',
      football: '🏈',
      basketball: '🏀',
      hockey: '🏒',
    };
    return icons[sportKey] || '🏆';
  };

  const renderSportCard = (sport: SportOption) => {
    const sportConfig = SPORT_CONFIGS[sport.key];
    const isEnabled = sport.enabled !== false;

    return (
      <TouchableOpacity
        key={sport.key}
        style={safeStyle([
          styles.sportCard,
          {
            backgroundColor: isEnabled
              ? sportConfig?.colors.secondary || DEFAULT_COLORS.secondary
              : DEFAULT_COLORS.border,
          },
          !isEnabled && styles.disabledCard,
        ])}
        onPress={() => isEnabled && onSportPress(sport.key)}
        disabled={!isEnabled}
      >
        <View style={styles.sportCardContent}>
          <Text style={styles.sportIcon}>
            {sport.icon || getSportIcon(sport.key)}
          </Text>
          <Text
            style={safeStyle([
              styles.sportName,
              !isEnabled && styles.disabledText,
            ])}
          >
            {sport.name}
          </Text>
          {sportConfig && (
            <View
              style={safeStyle([
                styles.sportAccent,
                { backgroundColor: sportConfig.colors.accent },
              ])}
            />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderCustomAction = (
    action: (typeof customActions)[0],
    index: number,
  ) => (
    <TouchableOpacity
      key={`action-${index}`}
      style={safeStyle([
        styles.actionCard,
        { backgroundColor: action.color || DEFAULT_COLORS.accent },
      ])}
      onPress={action.onPress}
    >
      <View style={styles.actionCardContent}>
        {action.icon && <Text style={styles.actionIcon}>{action.icon}</Text>}
        <Text style={styles.actionText}>{action.title}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.heading}>{title}</Text>
        <Text style={styles.subHeading}>{subtitle}</Text>
      </View>

      {/* Custom Actions */}
      {customActions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsContainer}>
            {customActions.map(renderCustomAction)}
          </View>
        </View>
      )}

      {/* Sports Grid */}
      {availableSports.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sports</Text>
          <View style={styles.sportsContainer}>
            {availableSports.map(renderSportCard)}
          </View>
        </View>
      )}

      {/* Empty State */}
      {availableSports.length === 0 && customActions.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateIcon}>
            {Platform.OS === 'web' ? (
              <span role="img" aria-label="Trophy">
                🏆
              </span>
            ) : (
              '🏆'
            )}
          </Text>
          <Text style={styles.emptyStateTitle}>No Sports Available</Text>
          <Text style={styles.emptyStateText}>
            Check back later for available fantasy sports.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: DEFAULT_COLORS.primary,
    paddingBottom: 20,
  },
  header: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  heading: {
    fontSize: Platform.OS === 'web' ? 36 : 32,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subHeading: {
    fontSize: 18,
    color: DEFAULT_COLORS.textSecondary,
    textAlign: 'center',
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
    marginBottom: 16,
  },
  sportsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  sportCard: {
    width: IS_TABLET ? '23%' : '48%',
    minWidth: 140,
    borderRadius: 16,
    overflow: 'hidden',
    ...(Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      },
    }) as {
      shadowColor?: string;
      shadowOffset?: { width: number; height: number };
      shadowOpacity?: number;
      shadowRadius?: number;
      elevation?: number;
      boxShadow?: string;
    }),
  },
  disabledCard: {
    opacity: 0.5,
  },
  sportCardContent: {
    padding: 20,
    alignItems: 'center',
    position: 'relative',
  },
  sportIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  sportName: {
    fontSize: 18,
    fontWeight: '600',
    color: DEFAULT_COLORS.text,
    textAlign: 'center',
  },
  disabledText: {
    color: DEFAULT_COLORS.textSecondary,
  },
  sportAccent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  actionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    flex: 1,
    minWidth: 120,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    ...(Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      },
    }) as {
      shadowColor?: string;
      shadowOffset?: { width: number; height: number };
      shadowOpacity?: number;
      shadowRadius?: number;
      elevation?: number;
      boxShadow?: string;
    }),
  },
  actionCardContent: {
    alignItems: 'center',
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: DEFAULT_COLORS.text,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: DEFAULT_COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
});

export { HomeScreen };

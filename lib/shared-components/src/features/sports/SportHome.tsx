import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  Platform,
  Alert,
  Modal,
  TextInput,
} from '../../platform-components';
import { League, User } from '../../types';
import { SPORT_CONFIGS, DEFAULT_COLORS } from '../../config/sports';
import {
  CreateLeagueModal,
  CreateLeagueFormData,
} from '../leagues/CreateLeagueModal';

export interface QuickAction {
  title: string;
  icon?: string;
  onPress: () => void;
  color?: string;
}

export interface SportHomeProps {
  sport: 'baseball' | 'football' | 'basketball' | 'hockey';
  user: User;
  leagues: League[];
  onCreateLeague: (data: CreateLeagueFormData) => Promise<void>;
  onJoinLeague?: (inviteCode: string) => Promise<void>;
  onLeaguePress: (league: League) => void;
  onInviteFriends?: () => void;
  quickActions?: QuickAction[];
  loading?: boolean;
  error?: string | null;
}

export function SportHome({
  sport,
  user,
  leagues,
  onCreateLeague,
  onJoinLeague,
  onLeaguePress,
  onInviteFriends,
  quickActions = [],
  loading = false,
  error,
}: SportHomeProps): JSX.Element {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');

  const sportConfig = SPORT_CONFIGS[sport];

  const defaultQuickActions: QuickAction[] = [
    {
      title: 'Create League',
      icon: '➕',
      onPress: () => setShowCreateModal(true),
      color: sportConfig.colors.accent,
    },
    ...(onJoinLeague
      ? [
          {
            title: 'Join League',
            icon: '🚪',
            onPress: () => setShowJoinModal(true),
            color: sportConfig.colors.secondary,
          },
        ]
      : []),
    ...(onInviteFriends
      ? [
          {
            title: 'Invite Friends',
            icon: '👥',
            onPress: onInviteFriends,
            color: DEFAULT_COLORS.info,
          },
        ]
      : []),
    ...quickActions,
  ];

  const handleJoinLeague = () => {
    if (!inviteCode.trim()) {
      const message = 'Please enter an invite code';
      Platform.OS === 'web' ? alert(message) : Alert.alert('Error', message);
      return;
    }

    if (onJoinLeague) {
      onJoinLeague(inviteCode)
        .then(() => {
          setShowJoinModal(false);
          setInviteCode('');
        })
        .catch(() => {
          // Error handling is managed by parent component
        });
    }
  };

  const renderLeague = ({ item }: { item: League }) => (
    <TouchableOpacity
      style={[
        styles.leagueCard,
        { borderLeftColor: sportConfig.colors.accent },
      ]}
      onPress={() => onLeaguePress(item)}
    >
      <View style={styles.leagueHeader}>
        <Text style={styles.leagueName}>{item.name}</Text>
        <Text style={styles.sportName}>{sportConfig.name}</Text>
      </View>

      <View style={styles.leagueDetails}>
        <Text style={styles.leagueInfo}>{item.numberOfTeams} Teams</Text>
        <Text style={styles.leagueInfo}>
          Draft: {new Date(item.draftDate).toLocaleDateString()}
        </Text>
        <Text style={[styles.draftType, { color: sportConfig.colors.accent }]}>
          {item.draftType} Draft
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderQuickAction = ({ item }: { item: QuickAction }) => (
    <TouchableOpacity
      style={[
        styles.actionButton,
        { backgroundColor: item.color || DEFAULT_COLORS.accent },
      ]}
      onPress={item.onPress}
      disabled={loading}
    >
      {item.icon && <Text style={styles.actionIcon}>{item.icon}</Text>}
      <Text style={styles.actionText}>{item.title}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View
        style={[styles.header, { backgroundColor: sportConfig.colors.primary }]}
      >
        <Text style={styles.title}>{sportConfig.name} Fantasy</Text>
        <Text style={styles.subtitle}>Welcome back, {user.name}!</Text>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <FlatList
          data={defaultQuickActions}
          renderItem={renderQuickAction}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.actionsContainer}
        />
      </View>

      {/* My Leagues */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Leagues</Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading leagues...</Text>
          </View>
        ) : leagues.length > 0 ? (
          <FlatList
            data={leagues}
            renderItem={renderLeague}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.leaguesContainer}
          />
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🏆</Text>
            <Text style={styles.emptyStateTitle}>No Leagues Yet</Text>
            <Text style={styles.emptyStateText}>
              Create your first league or join an existing one to get started!
            </Text>
          </View>
        )}
      </View>

      {/* Create League Modal */}
      <CreateLeagueModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={onCreateLeague}
        loading={loading}
        error={error}
      />

      {/* Join League Modal */}
      {onJoinLeague && (
        <Modal
          visible={showJoinModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowJoinModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Join League</Text>

              <Text style={styles.inputLabel}>Enter Invite Code</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.textInput}
                  value={inviteCode}
                  onChangeText={setInviteCode}
                  placeholder="ABC123XYZ"
                  placeholderTextColor="#888"
                  autoCapitalize="characters"
                  editable={!loading}
                />
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowJoinModal(false)}
                  disabled={loading}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    { backgroundColor: sportConfig.colors.accent },
                  ]}
                  onPress={handleJoinLeague}
                  disabled={loading}
                >
                  <Text style={styles.submitButtonText}>
                    {loading ? 'Joining...' : 'Join League'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DEFAULT_COLORS.primary,
  },
  header: {
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 24,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: DEFAULT_COLORS.text,
    opacity: 0.8,
  },
  section: {
    margin: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
    marginBottom: 16,
  },
  actionsContainer: {
    gap: 12,
  },
  actionButton: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 120,
    ...Platform.select({
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
    }),
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  actionText: {
    color: DEFAULT_COLORS.text,
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: DEFAULT_COLORS.textSecondary,
    fontSize: 16,
  },
  leaguesContainer: {
    gap: 12,
  },
  leagueCard: {
    backgroundColor: DEFAULT_COLORS.secondary,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      },
    }),
  },
  leagueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  leagueName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
    flex: 1,
  },
  sportName: {
    fontSize: 12,
    color: DEFAULT_COLORS.textSecondary,
    backgroundColor: DEFAULT_COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  leagueDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leagueInfo: {
    fontSize: 14,
    color: DEFAULT_COLORS.textSecondary,
  },
  draftType: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 16,
    color: DEFAULT_COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: DEFAULT_COLORS.secondary,
    borderRadius: 16,
    padding: 24,
    width: Platform.OS === 'web' ? 350 : '85%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: DEFAULT_COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: DEFAULT_COLORS.text,
    marginBottom: 8,
  },
  inputContainer: {
    marginBottom: 24,
  },
  textInput: {
    backgroundColor: DEFAULT_COLORS.primary,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: DEFAULT_COLORS.text,
    borderWidth: 1,
    borderColor: DEFAULT_COLORS.border,
    textAlign: 'center',
    letterSpacing: 2,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: DEFAULT_COLORS.border,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: DEFAULT_COLORS.text,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    color: DEFAULT_COLORS.text,
    fontWeight: '600',
  },
});

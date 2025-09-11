import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, Badge, Button, Checkbox, Dialog, Input, RadioGroup, ScrollView, Select, Separator, Spinner, Switch, Tabs, Text, useTheme, XStack, YStack } from 'tamagui';
import { AccessibilitySettings } from './AccessibilitySettings';
import { AISuggestions } from './AISuggestions';
import { ChatPanel } from './ChatPanel';
import { DraftOrder } from './DraftOrder';
import { DraftTimer } from './DraftTimer';
import { LiveStream } from './LiveStream';
import { NotificationBell } from './NotificationBell';
import { Player, PlayerCard } from './PlayerCard';
import { StatsOverlay } from './StatsOverlay';
import { TradeProposal } from './TradeProposal';
import { VRMode } from './VRMode';
import { sportsConfig } from '../../config/sports';
import { useAISuggestions, useDraftData, useDragAndDrop, useRealTimeUpdates, useVoiceCommands } from '../../hooks';

interface DraftBoardProps {
  sport: string;
  leagueId: string;
  teamId: string;
  userId: string;
}

export const DraftBoard: React.FC<DraftBoardProps> = ({ sport, leagueId, teamId, userId }) => {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPosition, setFilterPosition] = useState('All');
  const [sortBy, setSortBy] = useState('rank');
  const [autoPickEnabled, setAutoPickEnabled] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showTrade, setShowTrade] = useState(false);
  const [vrMode, setVrMode] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [accessibilityMode, setAccessibilityMode] = useState(false);
  const [themeMode, setThemeMode] = useState('light');
  const [notificationSettings, setNotificationSettings] = useState({ sound: true, vibration: true });
  const [draftSpeed, setDraftSpeed] = useState(30);
  const [multiSelect, setMultiSelect] = useState<string[]>([]);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [liveStreamEnabled, setLiveStreamEnabled] = useState(false);
  const [integrationSettings, setIntegrationSettings] = useState({ espn: false, yahoo: false });

  const { players, draftOrder, currentPick, isLoading, error } = useDraftData(sport, leagueId, teamId);
  const { updates } = useRealTimeUpdates(leagueId);
  const { suggestions } = useAISuggestions(players, sport);
  const { voiceCommand, isListening } = useVoiceCommands(voiceEnabled);
  useDragAndDrop();

interface SportConfig {
  name: string;
  positions: string[];
}

const defaultSportConfig: SportConfig = { name: 'Unknown', positions: [] };

  const sportConfig = (sportsConfig as Record<string, SportConfig>)[sport] || defaultSportConfig;
  const scrollRef = useRef(null);

  const filteredPlayers = useMemo(() => {
    return players
      .filter(player => 
        player.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        (filterPosition === 'All' || player.position === filterPosition)
      )
      .sort((a, b) => {
        if (sortBy === 'rank') return a.rank - b.rank;
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'value') return b.value - a.value;
        return 0;
      });
  }, [players, searchQuery, filterPosition, sortBy]);

  const handlePick = useCallback((playerId: string) => {
    fetch('/api/draft/pick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, leagueId, teamId, userId, multiSelect }),
    })
      .then(response => {
        if (response.ok) {
          setSelectedPlayer(null);
          setMultiSelect([]);
          console.log('Pick successful!');
        } else {
          console.error('Pick failed');
        }
      })
      .catch(err => console.error('Pick failed:', err));
  }, [leagueId, teamId, userId, multiSelect]);

  const handleAutoPick = useCallback(() => {
    if (autoPickEnabled && filteredPlayers.length > 0) {
      void handlePick(filteredPlayers[0].id);
    }
  }, [autoPickEnabled, filteredPlayers, handlePick]);

  const handleVoiceCommand = useCallback((command: string) => {
    if (command.includes('pick')) {
      const playerName = command.replace('pick', '').trim();
      const player = filteredPlayers.find(p => p.name.toLowerCase().includes(playerName.toLowerCase()));
      if (player) void handlePick(player.id);
    }
  }, [filteredPlayers, handlePick]);

  useEffect(() => {
    if (voiceCommand) handleVoiceCommand(voiceCommand);
  }, [voiceCommand, handleVoiceCommand]);

  useEffect(() => {
    if (updates.length > 0) {
      console.log('Draft updated!');
    }
  }, [updates]);

  if (isLoading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center">
        <Spinner size="large" />
        <Text>Loading {sportConfig.name} Draft...</Text>
      </YStack>
    );
  }

  if (error) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center">
        <Text color="red">Error: {error.message}</Text>
        <Button onPress={() => window.location.reload()}>Retry</Button>
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor={theme.background} padding="$4" space="$4">
      <XStack justifyContent="space-between" alignItems="center">
        <Text fontSize="$8" fontWeight="bold" color={theme.color}>
          {sportConfig.name} Draft Board
        </Text>
        <XStack space="$2">
          <NotificationBell updates={updates} settings={notificationSettings} />
          <Button onPress={() => setShowChat(true)}>Chat</Button>
          <Button onPress={() => setVrMode(true)}>VR Mode</Button>
          <AccessibilitySettings mode={accessibilityMode} onChange={setAccessibilityMode} />
        </XStack>
      </XStack>

      <DraftTimer sport={sport} currentPick={currentPick} speed={draftSpeed} onSpeedChange={setDraftSpeed} />

      <Tabs defaultValue="players" orientation="horizontal">
        <Tabs.List>
          <Tabs.Tab value="players">Players</Tabs.Tab>
          <Tabs.Tab value="order">Order</Tabs.Tab>
          <Tabs.Tab value="ai">AI</Tabs.Tab>
          <Tabs.Tab value="settings">Settings</Tabs.Tab>
          <Tabs.Tab value="demo">Home Football Baseball Players Demo</Tabs.Tab>
        </Tabs.List>

        <Tabs.Content value="players">
          <XStack space="$2" alignItems="center">
            <Input
              placeholder="Search players..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              flex={1}
            />
            <Select value={filterPosition} onValueChange={setFilterPosition}>
              <Select.Trigger>
                <Text>{filterPosition}</Text>
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="All">All Positions</Select.Item>
                {sportConfig.positions.map(pos => (
                  <Select.Item key={pos} value={pos}>{pos}</Select.Item>
                ))}
              </Select.Content>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <Select.Trigger>
                <Text>Sort by {sortBy}</Text>
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="rank">Rank</Select.Item>
                <Select.Item value="name">Name</Select.Item>
                <Select.Item value="value">Value</Select.Item>
              </Select.Content>
            </Select>
          </XStack>

          <XStack space="$2" alignItems="center">
            <Text>Auto-Pick</Text>
            <Switch checked={autoPickEnabled} onCheckedChange={setAutoPickEnabled} />
            <Button onPress={handleAutoPick} disabled={!autoPickEnabled}>
              Auto Pick
            </Button>
            <Text>Voice</Text>
            <Switch checked={voiceEnabled} onCheckedChange={setVoiceEnabled} />
            {isListening && <Badge>Listening...</Badge>}
          </XStack>

          <XStack space="$2" alignItems="center">
            <Checkbox checked={multiSelect.length > 0} onCheckedChange={() => setMultiSelect([])} />
            <Text>Multi-Select</Text>
            <Checkbox checked={comparisonMode} onCheckedChange={setComparisonMode} />
            <Text>Compare</Text>
            <Checkbox checked={liveStreamEnabled} onCheckedChange={setLiveStreamEnabled} />
            <Text>Live Stream</Text>
          </XStack>

          <ScrollView ref={scrollRef}>
            <AnimatePresence>
              {filteredPlayers.map(player => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  onSelect={setSelectedPlayer}
                  isSelected={selectedPlayer?.id === player.id}
                  onMultiSelect={(id) => setMultiSelect(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])}
                  multiSelected={multiSelect.includes(player.id)}
                  comparisonMode={comparisonMode}
                  onShowStats={() => setShowStats(true)}
                />
              ))}
            </AnimatePresence>
          </ScrollView>
        </Tabs.Content>

        <Tabs.Content value="order">
          <DraftOrder order={draftOrder} currentPick={currentPick} />
        </Tabs.Content>

        <Tabs.Content value="ai">
          <AISuggestions suggestions={suggestions} onPick={handlePick} />
        </Tabs.Content>

        <Tabs.Content value="settings">
          <YStack space="$4">
            <Text fontSize="$6">Preferences</Text>
            <RadioGroup value={themeMode} onValueChange={setThemeMode}>
              <RadioGroup.Item value="light" label="Light" />
              <RadioGroup.Item value="dark" label="Dark" />
              <RadioGroup.Item value="auto" label="Auto" />
            </RadioGroup>
            <Separator />
            <XStack space="$2">
              <Text>Sound</Text>
              <Switch checked={notificationSettings.sound} onCheckedChange={(checked) => setNotificationSettings(prev => ({ ...prev, sound: checked }))} />
            </XStack>
            <XStack space="$2">
              <Text>Vibration</Text>
              <Switch checked={notificationSettings.vibration} onCheckedChange={(checked) => setNotificationSettings(prev => ({ ...prev, vibration: checked }))} />
            </XStack>
            <Separator />
            <Text>Integrations</Text>
            <Checkbox checked={integrationSettings.espn} onCheckedChange={(checked) => setIntegrationSettings(prev => ({ ...prev, espn: checked }))} label="ESPN" />
            <Checkbox checked={integrationSettings.yahoo} onCheckedChange={(checked) => setIntegrationSettings(prev => ({ ...prev, yahoo: checked }))} label="Yahoo" />
          </YStack>
        </Tabs.Content>

        <Tabs.Content value="demo">
          <YStack space="$4">
            <Text fontSize="$6">Home Football Baseball Players Demo</Text>
            <Text>This tab demonstrates players from different sports.</Text>
            
            <YStack space="$2">
              <Text fontSize="$5" fontWeight="bold">Football Players</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <XStack space="$2">
                  {[
                    { id: 'fb1', name: 'Patrick Mahomes', position: 'QB', team: 'KC', rank: 1, value: 95 },
                    { id: 'fb2', name: 'Christian McCaffrey', position: 'RB', team: 'SF', rank: 2, value: 92 },
                    { id: 'fb3', name: 'Cooper Kupp', position: 'WR', team: 'LAR', rank: 3, value: 88 },
                  ].map(player => (
                    <PlayerCard
                      key={player.id}
                      player={player as Player}
                      onSelect={() => {}} // eslint-disable-line @typescript-eslint/no-empty-function
                      isSelected={false}
                      onMultiSelect={() => {}} // eslint-disable-line @typescript-eslint/no-empty-function
                      multiSelected={false}
                      comparisonMode={false}
                      onShowStats={() => {}} // eslint-disable-line @typescript-eslint/no-empty-function
                    />
                  ))}
                </XStack>
              </ScrollView>
            </YStack>

            <YStack space="$2">
              <Text fontSize="$5" fontWeight="bold">Baseball Players</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <XStack space="$2">
                  {[
                    { id: 'bb1', name: 'Shohei Ohtani', position: 'P/DH', team: 'LAD', rank: 1, value: 98 },
                    { id: 'bb2', name: 'Juan Soto', position: 'OF', team: 'NYY', rank: 2, value: 94 },
                    { id: 'bb3', name: 'Mookie Betts', position: 'OF', team: 'LAD', rank: 3, value: 91 },
                  ].map(player => (
                    <PlayerCard
                      key={player.id}
                      player={player as Player}
                      onSelect={() => {}} // eslint-disable-line @typescript-eslint/no-empty-function
                      isSelected={false}
                      onMultiSelect={() => {}} // eslint-disable-line @typescript-eslint/no-empty-function
                      multiSelected={false}
                      comparisonMode={false}
                      onShowStats={() => {}} // eslint-disable-line @typescript-eslint/no-empty-function
                    />
                  ))}
                </XStack>
              </ScrollView>
            </YStack>

            <YStack space="$2">
              <Text fontSize="$5" fontWeight="bold">Basketball Players</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <XStack space="$2">
                  {[
                    { id: 'bk1', name: 'Nikola Jokic', position: 'C', team: 'DEN', rank: 1, value: 97 },
                    { id: 'bk2', name: 'Luka Doncic', position: 'PG', team: 'DAL', rank: 2, value: 95 },
                    { id: 'bk3', name: 'Giannis Antetokounmpo', position: 'PF', team: 'MIL', rank: 3, value: 93 },
                  ].map(player => (
                    <PlayerCard
                      key={player.id}
                      player={player as Player}
                      onSelect={() => {}} // eslint-disable-line @typescript-eslint/no-empty-function
                      isSelected={false}
                      onMultiSelect={() => {}} // eslint-disable-line @typescript-eslint/no-empty-function
                      multiSelected={false}
                      comparisonMode={false}
                      onShowStats={() => {}} // eslint-disable-line @typescript-eslint/no-empty-function
                    />
                  ))}
                </XStack>
              </ScrollView>
            </YStack>
          </YStack>
        </Tabs.Content>
      </Tabs>

      {selectedPlayer && (
        <Dialog open={!!selectedPlayer} onOpenChange={() => setSelectedPlayer(null)}>
          <Dialog.Content>
            <Dialog.Title>Confirm Pick</Dialog.Title>
            <Text>{selectedPlayer.name}</Text>
            <XStack space="$2" marginTop="$2">
              <Button onPress={() => handlePick(selectedPlayer.id)}>Pick</Button>
              <Button variant="outline" onPress={() => setSelectedPlayer(null)}>Cancel</Button>
            </XStack>
          </Dialog.Content>
        </Dialog>
      )}

      {showStats && <StatsOverlay onClose={() => setShowStats(false)} player={selectedPlayer} />}
      {showChat && <ChatPanel onClose={() => setShowChat(false)} leagueId={leagueId} />}
      {showTrade && <TradeProposal onClose={() => setShowTrade(false)} leagueId={leagueId} teamId={teamId} />}
      {liveStreamEnabled && <LiveStream leagueId={leagueId} />}
      {vrMode && <VRMode onClose={() => setVrMode(false)} sport={sport} />}
    </YStack>
  );
};

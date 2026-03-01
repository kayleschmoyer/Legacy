import React, { useCallback, useState } from 'react';
import {
  Button,
  Card,
  H4,
  H5,
  Input,
  Separator,
  Spinner,
  Text,
  TextArea,
  XStack,
  YStack,
} from 'tamagui';
import {
  AlertTriangle,
  Check,
  ClipboardList,
  FileText,
  Lock,
  RefreshCw,
  Trash2,
  Unlock,
  UserMinus,
  UserPlus,
} from '@tamagui/lucide-icons';
import {
  GetLeagueTeamsQuery,
  useBulkDropTeamPlayersMutation,
  useEditMatchupScoreMutation,
  useForceAddPlayerMutation,
  useForceDropPlayerMutation,
  useGetCommissionerAuditLogsQuery,
  useGetLeagueTeamsQuery,
  useGetMatchupsForLeagueQuery,
  useGetTeamMembersQuery,
  useSetTeamLockMutation,
  useSwapMatchupTeamsMutation,
  useUpdateCommissionerNoteMutation,
} from '../../api/db/graphql.generated';
import { BRAND_NAVY_LIGHT, withAlpha } from '../../constants/colors';

export interface CommissionerToolsControlProps {
  leagueId: number;
  currentLmNotes?: string | null;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}

type LeagueTeam = NonNullable<
  NonNullable<GetLeagueTeamsQuery['leagueTeams']>[number]
>;

const selectStyle: React.CSSProperties = {
  backgroundColor: 'transparent',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 6,
  padding: '6px 8px',
  color: 'inherit',
  fontSize: 14,
  width: '100%',
};

// ── Sub-section: Section Header ─────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <YStack gap="$1">
      <XStack alignItems="center" gap="$2">
        {icon}
        <H5 color="$color" fontWeight="700">
          {title}
        </H5>
      </XStack>
      <Text fontSize="$2" color="$textMuted">
        {description}
      </Text>
    </YStack>
  );
}

// ── Sub-section: LM Note ────────────────────────────────────────────────────

function LmNoteSection({
  leagueId,
  currentNote,
  onSuccess,
  onError,
}: {
  leagueId: number;
  currentNote?: string | null;
  onSuccess?: (msg: string) => void;
  onError?: (err: Error) => void;
}) {
  const [note, setNote] = useState(currentNote ?? '');
  const [saved, setSaved] = useState(false);

  const [updateNote, { loading }] = useUpdateCommissionerNoteMutation({
    refetchQueries: ['GetLeagueById'],
  });

  const handleSave = useCallback(async () => {
    try {
      const result = await updateNote({
        variables: { input: { leagueId, note: note || undefined } },
      });
      const msg = result.data?.updateCommissionerNote?.message ?? 'Note saved';
      onSuccess?.(msg);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [leagueId, note, updateNote, onSuccess, onError]);

  return (
    <Card
      padding="$4"
      gap="$3"
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
    >
      <SectionHeader
        icon={<FileText size={16} color="#60A5FA" />}
        title="Commissioner Note"
        description="A persistent note displayed to all league members. Use it for announcements, rule updates, or season info."
      />
      <TextArea
        value={note}
        onChangeText={setNote}
        placeholder="Write a commissioner note for your league…"
        minHeight={100}
        maxLength={2000}
        borderColor="$borderColor"
        backgroundColor="$background"
        color="$color"
        aria-label="Commissioner note text"
      />
      <XStack justifyContent="space-between" alignItems="center">
        <Text fontSize="$1" color="$textMuted">
          {note.length} / 2000
        </Text>
        <Button
          size="$3"
          onPress={() => void handleSave()}
          disabled={loading}
          icon={
            loading ? (
              <Spinner size="small" />
            ) : saved ? (
              <Check size={14} color="rgb(34, 197, 94)" />
            ) : undefined
          }
          backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.85)}
          borderColor={withAlpha(BRAND_NAVY_LIGHT, 1)}
          color="white"
        >
          {saved ? 'Saved!' : 'Save Note'}
        </Button>
      </XStack>
    </Card>
  );
}

// ── Sub-section: Force Roster Moves ────────────────────────────────────────

function ForceRosterMovesSection({
  leagueId,
  teams,
  onSuccess,
  onError,
}: {
  leagueId: number;
  teams: LeagueTeam[];
  onSuccess?: (msg: string) => void;
  onError?: (err: Error) => void;
}) {
  const [addTeamId, setAddTeamId] = useState('');
  const [addPlayerId, setAddPlayerId] = useState('');
  const [addReason, setAddReason] = useState('');

  const [dropTeamId, setDropTeamId] = useState('');
  const [dropPlayerId, setDropPlayerId] = useState('');
  const [dropReason, setDropReason] = useState('');

  const [forceAdd, { loading: addLoading }] = useForceAddPlayerMutation({
    refetchQueries: ['GetTeamMembers'],
  });

  const [forceDrop, { loading: dropLoading }] = useForceDropPlayerMutation({
    refetchQueries: ['GetTeamMembers'],
  });

  const dropTeamIdNum = parseInt(dropTeamId, 10);
  const { data: dropTeamMembersData } = useGetTeamMembersQuery({
    variables: { teamId: dropTeamIdNum },
    skip: !dropTeamId || isNaN(dropTeamIdNum),
  });

  const handleForceAdd = async () => {
    const teamId = parseInt(addTeamId, 10);
    const playerId = parseInt(addPlayerId, 10);
    if (!teamId || !playerId) {
      onError?.(new Error('Team and player are required'));
      return;
    }
    try {
      const result = await forceAdd({
        variables: {
          input: { leagueId, teamId, playerId, reason: addReason || undefined },
        },
      });
      onSuccess?.(result.data?.forceAddPlayer?.message ?? 'Player added');
      setAddTeamId('');
      setAddPlayerId('');
      setAddReason('');
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const handleForceDrop = async () => {
    const teamId = parseInt(dropTeamId, 10);
    const playerId = parseInt(dropPlayerId, 10);
    if (!teamId || !playerId) {
      onError?.(new Error('Team and player are required'));
      return;
    }
    try {
      const result = await forceDrop({
        variables: {
          input: {
            leagueId,
            teamId,
            playerId,
            reason: dropReason || undefined,
          },
        },
      });
      onSuccess?.(result.data?.forceDropPlayer?.message ?? 'Player dropped');
      setDropTeamId('');
      setDropPlayerId('');
      setDropReason('');
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const dropTeamMembers = dropTeamMembersData?.teamMembers ?? [];

  return (
    <Card
      padding="$4"
      gap="$4"
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
    >
      <SectionHeader
        icon={<UserPlus size={16} color="#60A5FA" />}
        title="Force Roster Moves"
        description="Add or drop players from any team, bypassing normal waiver and lock rules. All moves are audit-logged."
      />

      {/* Force Add */}
      <YStack gap="$2">
        <Text fontWeight="600" fontSize="$3">
          Force-Add Player
        </Text>
        <XStack gap="$2" flexWrap="wrap">
          <YStack flex={1} minWidth={120} gap="$1">
            <Text fontSize="$1" color="$textMuted">
              Team
            </Text>
            <select
              value={addTeamId}
              onChange={(e) => setAddTeamId(e.target.value)}
              style={selectStyle}
              aria-label="Select team to add player"
            >
              <option value="">Select team…</option>
              {teams.map((t) => (
                <option key={t.id ?? ''} value={String(t.id ?? '')}>
                  {t.name}
                </option>
              ))}
            </select>
          </YStack>
          <YStack flex={1} minWidth={120} gap="$1">
            <Text fontSize="$1" color="$textMuted">
              Player ID
            </Text>
            <Input
              value={addPlayerId}
              onChangeText={setAddPlayerId}
              placeholder="Enter player ID"
              keyboardType="numeric"
              accessible
              accessibilityLabel="Player ID to force add"
            />
          </YStack>
        </XStack>
        <Input
          value={addReason}
          onChangeText={setAddReason}
          placeholder="Reason (optional)"
          accessible
          accessibilityLabel="Reason for force-add"
        />
        <Button
          size="$3"
          onPress={() => void handleForceAdd()}
          disabled={addLoading || !addTeamId || !addPlayerId}
          icon={addLoading ? <Spinner size="small" /> : <UserPlus size={14} />}
          backgroundColor="$blue9"
          color="white"
          alignSelf="flex-start"
        >
          Force Add
        </Button>
      </YStack>

      <Separator />

      {/* Force Drop */}
      <YStack gap="$2">
        <Text fontWeight="600" fontSize="$3">
          Force-Drop Player
        </Text>
        <XStack gap="$2" flexWrap="wrap">
          <YStack flex={1} minWidth={120} gap="$1">
            <Text fontSize="$1" color="$textMuted">
              Team
            </Text>
            <select
              value={dropTeamId}
              onChange={(e) => setDropTeamId(e.target.value)}
              style={selectStyle}
              aria-label="Select team to drop player from"
            >
              <option value="">Select team…</option>
              {teams.map((t) => (
                <option key={t.id ?? ''} value={String(t.id ?? '')}>
                  {t.name}
                </option>
              ))}
            </select>
          </YStack>
          <YStack flex={1} minWidth={120} gap="$1">
            <Text fontSize="$1" color="$textMuted">
              Player
            </Text>
            <select
              value={dropPlayerId}
              onChange={(e) => setDropPlayerId(e.target.value)}
              style={selectStyle}
              aria-label="Select player to force drop"
              disabled={!dropTeamId}
            >
              <option value="">Select player…</option>
              {dropTeamMembers.map((tm) => (
                <option key={tm.id ?? ''} value={String(tm.playerId ?? '')}>
                  {tm.player?.firstName} {tm.player?.lastName} (ID:{' '}
                  {tm.playerId})
                </option>
              ))}
            </select>
          </YStack>
        </XStack>
        <Input
          value={dropReason}
          onChangeText={setDropReason}
          placeholder="Reason (optional)"
          accessible
          accessibilityLabel="Reason for force-drop"
        />
        <Button
          size="$3"
          onPress={() => void handleForceDrop()}
          disabled={dropLoading || !dropTeamId || !dropPlayerId}
          icon={
            dropLoading ? <Spinner size="small" /> : <UserMinus size={14} />
          }
          backgroundColor="$orange9"
          color="white"
          alignSelf="flex-start"
        >
          Force Drop
        </Button>
      </YStack>
    </Card>
  );
}

// ── Sub-section: Edit Matchup Scores ───────────────────────────────────────

function EditMatchupScoresSection({
  leagueId,
  teams,
  onSuccess,
  onError,
}: {
  leagueId: number;
  teams: LeagueTeam[];
  onSuccess?: (msg: string) => void;
  onError?: (err: Error) => void;
}) {
  const [matchupId, setMatchupId] = useState('');
  const [team1Score, setTeam1Score] = useState('');
  const [team2Score, setTeam2Score] = useState('');
  const [reason, setReason] = useState('');

  const { data: matchupsData, loading: matchupsLoading } =
    useGetMatchupsForLeagueQuery({ variables: { leagueId } });

  const [editScore, { loading }] = useEditMatchupScoreMutation({
    refetchQueries: ['GetMatchupsForLeague', 'GetLeagueStandings'],
  });

  const matchups = matchupsData?.getMatchupsForLeague ?? [];

  const teamNameById = (id: number | null | undefined) =>
    teams.find((t) => t.id === id)?.name ?? `Team ${id ?? '?'}`;

  const handleMatchupChange = (val: string) => {
    setMatchupId(val);
    const m = matchups.find((mx) => mx.id === val);
    if (m) {
      setTeam1Score(m.team1Score != null ? String(m.team1Score) : '');
      setTeam2Score(m.team2Score != null ? String(m.team2Score) : '');
    }
  };

  const handleEdit = async () => {
    const mid = parseInt(matchupId, 10);
    const t1 = parseFloat(team1Score);
    const t2 = parseFloat(team2Score);
    if (!mid || isNaN(t1) || isNaN(t2)) {
      onError?.(new Error('Valid matchup and scores are required'));
      return;
    }
    try {
      const result = await editScore({
        variables: {
          input: {
            matchupId: mid,
            team1Score: t1,
            team2Score: t2,
            reason: reason || undefined,
          },
        },
      });
      onSuccess?.(result.data?.editMatchupScore?.message ?? 'Scores updated');
      setMatchupId('');
      setTeam1Score('');
      setTeam2Score('');
      setReason('');
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const selectedMatchup = matchups.find((m) => m.id === matchupId);

  return (
    <Card
      padding="$4"
      gap="$3"
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
    >
      <SectionHeader
        icon={<RefreshCw size={16} color="#60A5FA" />}
        title="Edit Matchup Scores"
        description="Correct scoring errors for any past or current matchup. All edits are logged in the audit trail."
      />
      {matchupsLoading ? (
        <Spinner />
      ) : (
        <YStack gap="$2">
          <YStack gap="$1">
            <Text fontSize="$1" color="$textMuted">
              Matchup
            </Text>
            <select
              value={matchupId}
              onChange={(e) => handleMatchupChange(e.target.value)}
              style={selectStyle}
              aria-label="Select matchup to edit"
            >
              <option value="">Select matchup…</option>
              {matchups.map((m) => (
                <option key={m.id ?? ''} value={m.id ?? ''}>
                  Week {m.weekNumber} — {teamNameById(m.team1Id)} vs{' '}
                  {teamNameById(m.team2Id)} ({m.status})
                </option>
              ))}
            </select>
          </YStack>

          {selectedMatchup ? (
            <XStack gap="$2" flexWrap="wrap">
              <YStack flex={1} minWidth={120} gap="$1">
                <Text fontSize="$1" color="$textMuted">
                  {teamNameById(selectedMatchup.team1Id)} Score
                </Text>
                <Input
                  value={team1Score}
                  onChangeText={setTeam1Score}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  accessible
                  accessibilityLabel="Team 1 score"
                />
              </YStack>
              <YStack flex={1} minWidth={120} gap="$1">
                <Text fontSize="$1" color="$textMuted">
                  {teamNameById(selectedMatchup.team2Id)} Score
                </Text>
                <Input
                  value={team2Score}
                  onChangeText={setTeam2Score}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  accessible
                  accessibilityLabel="Team 2 score"
                />
              </YStack>
            </XStack>
          ) : null}

          <Input
            value={reason}
            onChangeText={setReason}
            placeholder="Reason for score correction (required for audit)"
            accessible
            accessibilityLabel="Reason for editing score"
          />
          <Button
            size="$3"
            onPress={() => void handleEdit()}
            disabled={loading || !matchupId || !team1Score || !team2Score}
            icon={loading ? <Spinner size="small" /> : <Check size={14} />}
            backgroundColor="$blue9"
            color="white"
            alignSelf="flex-start"
          >
            Save Scores
          </Button>
        </YStack>
      )}
    </Card>
  );
}

// ── Sub-section: Swap Matchup Teams ────────────────────────────────────────

function SwapMatchupTeamsSection({
  leagueId,
  teams,
  onSuccess,
  onError,
}: {
  leagueId: number;
  teams: LeagueTeam[];
  onSuccess?: (msg: string) => void;
  onError?: (err: Error) => void;
}) {
  const [matchupId1, setMatchupId1] = useState('');
  const [matchupId2, setMatchupId2] = useState('');
  const [reason, setReason] = useState('');

  const { data: matchupsData, loading: matchupsLoading } =
    useGetMatchupsForLeagueQuery({ variables: { leagueId } });

  const [swapTeams, { loading }] = useSwapMatchupTeamsMutation({
    refetchQueries: ['GetMatchupsForLeague'],
  });

  const matchups = matchupsData?.getMatchupsForLeague ?? [];
  const teamNameById = (id: number | null | undefined) =>
    teams.find((t) => t.id === id)?.name ?? `Team ${id ?? '?'}`;

  const handleSwap = async () => {
    const m1 = parseInt(matchupId1, 10);
    const m2 = parseInt(matchupId2, 10);
    if (!m1 || !m2 || m1 === m2) {
      onError?.(new Error('Please select two different matchups'));
      return;
    }
    try {
      const result = await swapTeams({
        variables: {
          input: {
            matchupId1: m1,
            matchupId2: m2,
            reason: reason || undefined,
          },
        },
      });
      onSuccess?.(result.data?.swapMatchupTeams?.message ?? 'Teams swapped');
      setMatchupId1('');
      setMatchupId2('');
      setReason('');
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  return (
    <Card
      padding="$4"
      gap="$3"
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
    >
      <SectionHeader
        icon={<RefreshCw size={16} color="#60A5FA" />}
        title="Swap Matchup Teams"
        description="Swap the team assignments between two matchups (e.g., to fix scheduling errors)."
      />
      {matchupsLoading ? (
        <Spinner />
      ) : (
        <YStack gap="$2">
          <XStack gap="$2" flexWrap="wrap">
            <YStack flex={1} minWidth={140} gap="$1">
              <Text fontSize="$1" color="$textMuted">
                Matchup A
              </Text>
              <select
                value={matchupId1}
                onChange={(e) => setMatchupId1(e.target.value)}
                style={selectStyle}
                aria-label="Matchup A"
              >
                <option value="">Select matchup…</option>
                {matchups.map((m) => (
                  <option key={m.id ?? ''} value={m.id ?? ''}>
                    Wk {m.weekNumber}: {teamNameById(m.team1Id)} vs{' '}
                    {teamNameById(m.team2Id)}
                  </option>
                ))}
              </select>
            </YStack>
            <YStack flex={1} minWidth={140} gap="$1">
              <Text fontSize="$1" color="$textMuted">
                Matchup B
              </Text>
              <select
                value={matchupId2}
                onChange={(e) => setMatchupId2(e.target.value)}
                style={selectStyle}
                aria-label="Matchup B"
              >
                <option value="">Select matchup…</option>
                {matchups.map((m) => (
                  <option key={m.id ?? ''} value={m.id ?? ''}>
                    Wk {m.weekNumber}: {teamNameById(m.team1Id)} vs{' '}
                    {teamNameById(m.team2Id)}
                  </option>
                ))}
              </select>
            </YStack>
          </XStack>
          <Input
            value={reason}
            onChangeText={setReason}
            placeholder="Reason (optional)"
            accessible
            accessibilityLabel="Reason for swap"
          />
          <Button
            size="$3"
            onPress={() => void handleSwap()}
            disabled={loading || !matchupId1 || !matchupId2}
            icon={loading ? <Spinner size="small" /> : <RefreshCw size={14} />}
            backgroundColor="$blue9"
            color="white"
            alignSelf="flex-start"
          >
            Swap Teams
          </Button>
        </YStack>
      )}
    </Card>
  );
}

// ── Sub-section: Team Lock / Bulk Drop ─────────────────────────────────────

function TeamManagementSection({
  leagueId,
  teams,
  onSuccess,
  onError,
}: {
  leagueId: number;
  teams: LeagueTeam[];
  onSuccess?: (msg: string) => void;
  onError?: (err: Error) => void;
}) {
  const [lockTeamId, setLockTeamId] = useState('');
  const [lockReason, setLockReason] = useState('');
  const [bulkDropTeamId, setBulkDropTeamId] = useState('');
  const [bulkDropReason, setBulkDropReason] = useState('');
  const [bulkDropConfirm, setBulkDropConfirm] = useState(false);

  const [setTeamLock, { loading: lockLoading }] = useSetTeamLockMutation({
    refetchQueries: ['GetLeagueTeams'],
  });

  const [bulkDrop, { loading: bulkLoading }] = useBulkDropTeamPlayersMutation({
    refetchQueries: ['GetTeamMembers', 'GetLeagueTeams'],
  });

  const selectedTeam = teams.find((t) => String(t.id ?? '') === lockTeamId);

  const handleLock = async (locked: boolean) => {
    const teamId = parseInt(lockTeamId, 10);
    if (!teamId) {
      onError?.(new Error('Please select a team'));
      return;
    }
    try {
      const result = await setTeamLock({
        variables: {
          input: { leagueId, teamId, locked, reason: lockReason || undefined },
        },
      });
      onSuccess?.(
        result.data?.setTeamLock?.message ??
          `Team ${locked ? 'locked' : 'unlocked'}`,
      );
      setLockTeamId('');
      setLockReason('');
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const handleBulkDrop = async () => {
    const teamId = parseInt(bulkDropTeamId, 10);
    if (!teamId) {
      onError?.(new Error('Please select a team'));
      return;
    }
    try {
      const result = await bulkDrop({
        variables: {
          input: { leagueId, teamId, reason: bulkDropReason || undefined },
        },
      });
      onSuccess?.(
        result.data?.bulkDropTeamPlayers?.message ?? 'Players dropped',
      );
      setBulkDropTeamId('');
      setBulkDropReason('');
      setBulkDropConfirm(false);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };

  return (
    <Card
      padding="$4"
      gap="$4"
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
    >
      <SectionHeader
        icon={<Lock size={16} color="#60A5FA" />}
        title="Team Management"
        description="Lock individual teams to prevent roster moves, or bulk-drop all players from inactive teams."
      />

      {/* Lock / Unlock */}
      <YStack gap="$2">
        <Text fontWeight="600" fontSize="$3">
          Lock / Unlock Team
        </Text>
        <YStack gap="$1">
          <Text fontSize="$1" color="$textMuted">
            Team
          </Text>
          <select
            value={lockTeamId}
            onChange={(e) => setLockTeamId(e.target.value)}
            style={selectStyle}
            aria-label="Select team to lock or unlock"
          >
            <option value="">Select team…</option>
            {teams.map((t) => (
              <option key={t.id ?? ''} value={String(t.id ?? '')}>
                {t.name}
                {(t as { isLocked?: boolean | null }).isLocked === true
                  ? ' 🔒'
                  : ''}
              </option>
            ))}
          </select>
        </YStack>
        <Input
          value={lockReason}
          onChangeText={setLockReason}
          placeholder="Reason (optional)"
          accessible
          accessibilityLabel="Reason for lock/unlock"
        />
        <XStack gap="$2">
          <Button
            size="$3"
            onPress={() => void handleLock(true)}
            disabled={
              lockLoading ||
              !lockTeamId ||
              (selectedTeam as { isLocked?: boolean | null } | undefined)
                ?.isLocked === true
            }
            icon={lockLoading ? <Spinner size="small" /> : <Lock size={14} />}
            backgroundColor="$orange9"
            color="white"
          >
            Lock Team
          </Button>
          <Button
            size="$3"
            onPress={() => void handleLock(false)}
            disabled={
              lockLoading ||
              !lockTeamId ||
              (selectedTeam as { isLocked?: boolean | null } | undefined)
                ?.isLocked === false
            }
            icon={lockLoading ? <Spinner size="small" /> : <Unlock size={14} />}
            backgroundColor="$green9"
            color="white"
          >
            Unlock Team
          </Button>
        </XStack>
      </YStack>

      <Separator />

      {/* Bulk Drop */}
      <YStack gap="$2">
        <XStack alignItems="center" gap="$2">
          <AlertTriangle size={14} color="#f97316" />
          <Text fontWeight="600" fontSize="$3" color="$orange11">
            Bulk Drop All Players
          </Text>
        </XStack>
        <Text fontSize="$2" color="$textMuted">
          Drops every rostered player from the selected team. This cannot be
          undone.
        </Text>
        <YStack gap="$1">
          <Text fontSize="$1" color="$textMuted">
            Team
          </Text>
          <select
            value={bulkDropTeamId}
            onChange={(e) => {
              setBulkDropTeamId(e.target.value);
              setBulkDropConfirm(false);
            }}
            style={selectStyle}
            aria-label="Select team to bulk drop"
          >
            <option value="">Select team…</option>
            {teams.map((t) => (
              <option key={t.id ?? ''} value={String(t.id ?? '')}>
                {t.name}
              </option>
            ))}
          </select>
        </YStack>
        <Input
          value={bulkDropReason}
          onChangeText={setBulkDropReason}
          placeholder="Reason (e.g., inactive team)"
          accessible
          accessibilityLabel="Reason for bulk drop"
        />
        {!bulkDropConfirm ? (
          <Button
            size="$3"
            onPress={() => setBulkDropConfirm(true)}
            disabled={!bulkDropTeamId}
            icon={<AlertTriangle size={14} />}
            backgroundColor="$red9"
            color="white"
            alignSelf="flex-start"
          >
            Bulk Drop Players
          </Button>
        ) : (
          <XStack gap="$2" alignItems="center" flexWrap="wrap">
            <Text fontSize="$2" color="$red11" fontWeight="600">
              Are you sure? This cannot be undone.
            </Text>
            <Button
              size="$3"
              onPress={() => void handleBulkDrop()}
              disabled={bulkLoading}
              icon={
                bulkLoading ? <Spinner size="small" /> : <Trash2 size={14} />
              }
              backgroundColor="$red10"
              color="white"
            >
              Confirm Drop
            </Button>
            <Button
              size="$3"
              onPress={() => setBulkDropConfirm(false)}
              backgroundColor="$gray6"
              color="$color"
            >
              Cancel
            </Button>
          </XStack>
        )}
      </YStack>
    </Card>
  );
}

// ── Sub-section: Audit Log ──────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  force_add: 'Force Add',
  force_drop: 'Force Drop',
  edit_score: 'Edit Score',
  swap_matchup_teams: 'Swap Matchup',
  update_lm_note: 'Update Note',
  lock_team: 'Lock Team',
  unlock_team: 'Unlock Team',
  bulk_drop_players: 'Bulk Drop',
};

function AuditLogSection({ leagueId }: { leagueId: number }) {
  const { data, loading, refetch } = useGetCommissionerAuditLogsQuery({
    variables: { leagueId, limit: 50 },
    fetchPolicy: 'network-only',
  });

  const logs = data?.commissionerAuditLogs ?? [];

  return (
    <Card
      padding="$4"
      gap="$3"
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
    >
      <XStack justifyContent="space-between" alignItems="flex-start">
        <SectionHeader
          icon={<ClipboardList size={16} color="#60A5FA" />}
          title="Commissioner Audit Log"
          description="All commissioner actions are recorded here for transparency."
        />
        <Button
          size="$2"
          onPress={() => void refetch()}
          icon={<RefreshCw size={12} />}
          backgroundColor="$gray6"
          color="$color"
          circular
          aria-label="Refresh audit log"
        />
      </XStack>

      {loading ? (
        <Spinner />
      ) : logs.length === 0 ? (
        <Text color="$textMuted" fontSize="$3" textAlign="center" padding="$4">
          No commissioner actions recorded yet.
        </Text>
      ) : (
        <YStack gap="$1">
          {logs.map((log) => {
            const dateStr = log.createdAt
              ? new Date(log.createdAt).toLocaleDateString()
              : '';
            const timeStr = log.createdAt
              ? new Date(log.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '';
            return (
              <XStack
                key={log.id}
                gap="$2"
                padding="$2"
                borderRadius="$3"
                backgroundColor="$background"
                borderWidth={1}
                borderColor="$borderColor"
                flexWrap="wrap"
                alignItems="center"
              >
                <Text fontSize="$1" color="$textMuted" minWidth={90}>
                  {dateStr} {timeStr}
                </Text>
                <Text
                  fontSize="$2"
                  fontWeight="600"
                  color="$blue10"
                  minWidth={80}
                >
                  {log.action != null
                    ? (ACTION_LABELS[log.action] ?? log.action)
                    : '—'}
                </Text>
                {log.targetType && (
                  <Text fontSize="$1" color="$textMuted">
                    {log.targetType}
                    {log.targetId != null ? ` #${log.targetId}` : ''}
                  </Text>
                )}
                {log.reason && (
                  <Text fontSize="$1" color="$textMuted" flex={1}>
                    — {log.reason}
                  </Text>
                )}
              </XStack>
            );
          })}
        </YStack>
      )}
    </Card>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function CommissionerToolsControl({
  leagueId,
  currentLmNotes,
  onSuccess,
  onError,
}: CommissionerToolsControlProps) {
  const { data: teamsData, loading: teamsLoading } = useGetLeagueTeamsQuery({
    variables: { leagueId },
    fetchPolicy: 'network-only',
  });

  const teams = teamsData?.leagueTeams ?? [];

  return (
    <YStack gap="$4">
      <Card
        padding="$3"
        backgroundColor="$blue2"
        borderColor="$blue6"
        borderWidth={1}
        borderRadius="$4"
      >
        <XStack alignItems="center" gap="$2">
          <AlertTriangle size={14} color="#60A5FA" />
          <Text fontSize="$2" color="$blue11">
            <Text fontWeight="700">Advanced Commissioner Tools</Text> — All
            actions are audit-logged and visible to other commissioners.
          </Text>
        </XStack>
      </Card>

      <H4>Advanced Tools</H4>

      <LmNoteSection
        leagueId={leagueId}
        currentNote={currentLmNotes}
        onSuccess={onSuccess}
        onError={onError}
      />

      {teamsLoading ? (
        <Spinner />
      ) : (
        <>
          <ForceRosterMovesSection
            leagueId={leagueId}
            teams={teams}
            onSuccess={onSuccess}
            onError={onError}
          />

          <EditMatchupScoresSection
            leagueId={leagueId}
            teams={teams}
            onSuccess={onSuccess}
            onError={onError}
          />

          <SwapMatchupTeamsSection
            leagueId={leagueId}
            teams={teams}
            onSuccess={onSuccess}
            onError={onError}
          />

          <TeamManagementSection
            leagueId={leagueId}
            teams={teams}
            onSuccess={onSuccess}
            onError={onError}
          />
        </>
      )}

      <AuditLogSection leagueId={leagueId} />
    </YStack>
  );
}

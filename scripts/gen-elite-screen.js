'use strict';
const fs = require('fs');
const path = require('path');

const src = path.resolve(
  __dirname,
  '../../../legacy-sports/apps/web/src/components/EliteDraftBoard.tsx',
);
const dst = path.resolve(
  __dirname,
  '../apps/web/src/components/EliteDraftBoard/EliteDraftBoardScreen.tsx',
);

const text = fs.readFileSync(src, 'utf8');
const lines = text.split('\n');
console.log('Total source lines:', lines.length);

// Find the main component section header (// === Main Component ===)
const mainSectionIdx = lines.findIndex(
  (l, i) => i > 1000 && l.includes('// Main Component'),
);
const mainHeaderIdx = mainSectionIdx > 0 ? mainSectionIdx - 1 : mainSectionIdx; // include the opening === line
const body = lines
  .slice(mainHeaderIdx, lines.length - 1) // exclude trailing blank line
  .join('\n');

const imports = [
  'import React, {',
  '  useCallback,',
  '  useEffect,',
  '  useMemo,',
  '  useRef,',
  '  useState,',
  "} from 'react';",
  "import { useMutation, useQuery } from '@apollo/client/react';",
  "import { useNavigate, useParams } from 'react-router-dom';",
  'import {',
  '  type DraftCompletedNotification,',
  '  type DraftPausedNotification,',
  '  type DraftPickNotification,',
  '  type DraftResumedNotification,',
  '  type DraftStartedNotification,',
  '  useWebSocket,',
  "} from '@legacy-sports/shared-components';",
  "import { env } from '../../config/environment';",
  'import {',
  '  CommissionerPick as COMMISSIONER_PICK,',
  '  GetAvailableDraftPlayers as GET_AVAILABLE_DRAFT_PLAYERS,',
  '  GetCurrentDraftPick as GET_CURRENT_DRAFT_PICK,',
  '  GetDraftPicks as GET_DRAFT_PICKS,',
  '  GetDraftPlayerStats as GET_DRAFT_PLAYER_STATS,',
  '  GetLeagueById as GET_LEAGUE_BY_ID,',
  '  GetLiveDraftLeagueDraft as GET_LEAGUE_DRAFT,',
  '  GetLeagueTeams as GET_LEAGUE_TEAMS,',
  '  type GetAvailableDraftPlayersQuery,',
  '  type GetAvailableDraftPlayersQueryVariables,',
  '  type GetCurrentDraftPickQuery,',
  '  type GetCurrentDraftPickQueryVariables,',
  '  type GetDraftPicksQuery,',
  '  type GetDraftPicksQueryVariables,',
  '  InitializeLiveDraft as INITIALIZE_LIVE_DRAFT,',
  '  MakeDraftPick as MAKE_DRAFT_PICK,',
  '  NudgeExpiredDraftPick as NUDGE_EXPIRED_DRAFT_PICK,',
  '  PauseDraft as PAUSE_DRAFT,',
  '  ResumeDraft as RESUME_DRAFT,',
  "} from '../../api/db/graphql.generated';",
  'import {',
  '  type AvailableDraftPlayer,',
  '  type CurrentDraftPickInfo,',
  '  type DraftPickRecord,',
  '  type DraftPlayer,',
  '  type LeagueTeam,',
  '  type PlayerStatsEntry,',
  "} from './types';",
  "import { DEFAULT_PICK_TIME } from './constants';",
  "import { getPositionColor, normalizeTeamId } from './utils';",
  "import { CSS } from './styles';",
  "import { CircularTimer } from './CircularTimer';",
  "import { PickAnnouncement } from './PickAnnouncement';",
  "import { PlayerCard } from './PlayerCard';",
  "import { SkeletonCard } from './SkeletonCard';",
  "import { DraftGrid } from './DraftGrid';",
  '',
].join('\n');

fs.writeFileSync(dst, imports + '\n' + body, 'utf8');
console.log('Written successfully:', dst);
console.log('Output lines:', (imports + '\n' + body).split('\n').length);

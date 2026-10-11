/**
 * Football League Detail — Chat Tab E2E Tests (LS-5415)
 *
 * Covers the Chat sub-tab of /football/league/:id/overview: reachability,
 * message list rendering, sending a message, @mention autocomplete, and
 * system-message rendering (trade / waiver). Mirrors the baseball chat
 * coverage in league-detail-tabs.spec.ts, scoped to the football route,
 * since LeagueChatTab / useLeagueChat are sport-agnostic (LS-9097).
 *
 * Per Epic LS-5268's QA-coverage goal, this proves the Chat Tab user
 * journey end to end via mocked GraphQL — no live backend/WebSocket
 * dependency (offline queueing and Android push notifications are native/
 * mobile-only behavior and are out of scope for this Playwright suite; see
 * LS-5415's Out of Scope notes).
 *
 * All GraphQL queries are mocked so these tests run without a live backend.
 */

import { expect, test } from '../fixtures/pages';
import {
  extractOperationName,
  unmockedGraphQLFallback,
} from '../fixtures/shared-mocks';
import { agoIso } from '../mocks/time';
import { isGraphQLEndpoint } from '../mocks/graphql/router';

// ── Mock Data ─────────────────────────────────────────────────────────────────

const FOOTBALL_LEAGUE_URL = '/football/league/1/overview';

const MOCK_LEAGUE = {
  __typename: 'League',
  id: 1,
  name: 'Gridiron Playoff Push',
  description: 'E2E football-league-chat test league',
  owner: 1,
  maxRosterSize: 25,
  draftStatus: 'completed',
  currentMatchup: 1,
  numberOfTeams: 2,
  playerPool: 'all',
  draftMode: 'live',
  selectionMethod: 'standard',
  draftOrder: 'snake',
  isPublic: false,
  maxBatters: 14,
  maxPitchers: 9,
  tradingEnabled: true,
  waiverEnabled: true,
  startDate: null,
  logoUrl: null,
  bannerUrl: null,
  primaryColor: null,
  secondaryColor: null,
  inviteCode: 'ABCD1234',
  userMembership: { teamId: 1 },
  minCareerGames: 50,
  minCareerSeasons: 3,
  waiverType: 'standard',
  currentWeekNumber: 1,
  leaguePhase: null,
  weekAdvanceStatus: null,
  faabBudgetDefault: null,
  pitcherStartsPerMatchup: 1,
  gamesPerMatchup: 5,
  totalMatchups: 10,
  playoffEnabled: true,
  playoffFormat: '4-team',
  playoffMultiWeek: false,
  lmNotes: null,
  previousLeagueId: null,
  frozenAt: null,
  seasonNumber: 1,
  salaryCapEnabled: false,
  salaryCap: null,
  salaryFloor: null,
  luxuryTaxThreshold: null,
  minSalary: null,
  salaryEscalationPct: null,
  salaryDecayPct: null,
  auctionBudget: null,
  auctionMinBid: null,
  eraFilter: null,
  baseballHofOnly: false,
  customEraStartYear: null,
  customEraEndYear: null,
};

const MOCK_TEAMS = [
  {
    __typename: 'Team',
    id: 1,
    name: 'Alpha Squad',
    owner: 1,
    leagueId: 1,
    waiverOrder: 1,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
  {
    __typename: 'Team',
    id: 2,
    name: 'Beta Force',
    owner: 2,
    leagueId: 1,
    waiverOrder: 2,
    faabBudget: 100,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  },
];

interface MockChatMessage {
  __typename: string;
  id: string;
  userId: number | null;
  messageText: string;
  timestamp: string;
  messageType: string;
  gifUrl: string | null;
  metadata: string | null;
  sender: { username: string; avatarUrl: string | null } | null;
}

const MOCK_CHAT_MESSAGES: MockChatMessage[] = [
  {
    __typename: 'LeagueChatMessage',
    id: '1',
    userId: 1,
    messageText: 'Good luck this week everyone!',
    timestamp: agoIso(1_800_000),
    messageType: 'text',
    gifUrl: null,
    metadata: null,
    sender: { username: 'manager1', avatarUrl: null },
  },
  {
    __typename: 'LeagueChatMessage',
    id: '2',
    userId: 2,
    messageText: 'May the best roster win!',
    timestamp: agoIso(900_000),
    messageType: 'text',
    gifUrl: null,
    metadata: null,
    sender: { username: 'manager2', avatarUrl: null },
  },
];

const MOCK_CHAT_MESSAGES_WITH_TRADE: MockChatMessage[] = [
  ...MOCK_CHAT_MESSAGES,
  {
    __typename: 'LeagueChatMessage',
    id: '3',
    userId: null,
    messageText: 'Alpha Squad and Beta Force completed a trade.',
    timestamp: agoIso(300_000),
    messageType: 'trade',
    gifUrl: null,
    metadata: JSON.stringify({
      action: 'accepted',
      proposingTeamName: 'Alpha Squad',
      receivingTeamName: 'Beta Force',
    }),
    sender: null,
  },
];

const MOCK_CHAT_MESSAGES_WITH_WAIVER: MockChatMessage[] = [
  ...MOCK_CHAT_MESSAGES,
  {
    __typename: 'LeagueChatMessage',
    id: '4',
    userId: null,
    messageText: 'Beta Force claimed a player off waivers.',
    timestamp: agoIso(150_000),
    messageType: 'waiver',
    gifUrl: null,
    metadata: JSON.stringify({
      teamName: 'Beta Force',
      playerName: 'Waiver Target',
    }),
    sender: null,
  },
];

const SENT_MESSAGE_TEXT = 'Good luck in the playoffs!';

// ── GraphQL Mock Setup ────────────────────────────────────────────────────────

interface MockOptions {
  /** Override chat messages returned by getleaguechatmessages */
  chatMessages?: MockChatMessage[];
  /** Capture sendLeagueChatMessage mutation calls */
  onSendMessage?: (variables: {
    leagueId: number;
    messageText: string;
  }) => void;
}

async function mockFootballLeagueChatGraphQL(
  page: import('@playwright/test').Page,
  opts: MockOptions = {},
) {
  const { chatMessages = MOCK_CHAT_MESSAGES, onSendMessage } = opts;

  await page.route(isGraphQLEndpoint, async (route) => {
    const opName = extractOperationName(route).toLowerCase();

    if (opName === 'getleaguebyid' || opName === 'getleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { league: MOCK_LEAGUE } }),
      });
    } else if (opName === 'getleagueteams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueTeams: MOCK_TEAMS } }),
      });
    } else if (opName === 'getuserteamid') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userTeamId: 1 } }),
      });
    } else if (opName === 'sendleaguechatmessage') {
      const rawBody = route.request().postData() ?? '';
      try {
        const parsed = JSON.parse(rawBody) as {
          variables?: { leagueId?: number; messageText?: string };
        };
        if (parsed.variables && onSendMessage) {
          onSendMessage({
            leagueId: Number(parsed.variables.leagueId ?? 0),
            messageText: String(parsed.variables.messageText ?? ''),
          });
        }
      } catch {
        /* malformed body — let the test see no callback */
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            sendLeagueMessage: {
              __typename: 'LeagueChatMessage',
              id: '99',
              userId: 1,
              messageText: SENT_MESSAGE_TEXT,
              timestamp: agoIso(0),
              messageType: 'text',
              gifUrl: null,
              sender: { username: 'manager1', avatarUrl: null },
            },
          },
        }),
      });
    } else if (
      opName === 'getleaguechatmessages' ||
      opName === 'getleaguemessages'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueMessages: chatMessages } }),
      });
    } else if (
      opName === 'getteamtradeoffers' ||
      opName === 'getleaguetradeoffers'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { teamTradeOffers: [], leagueTradeOffers: [] },
        }),
      });
    } else if (opName === 'getteammembers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamMembers: [] } }),
      });
    } else if (opName === 'getleagueactivity') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueActivity: [] } }),
      });
    } else if (opName === 'getleagueannouncements') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueAnnouncements: [] } }),
      });
    } else if (opName === 'getteamwaiverclaims') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { teamWaiverClaims: [] } }),
      });
    } else if (opName === 'getleaguestandings') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueStandings: [] } }),
      });
    } else if (opName === 'getleaguehistory') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getLeagueHistory: [] } }),
      });
    } else if (opName === 'getalltimerecords') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { getAllTimeRecords: [] } }),
      });
    } else if (opName === 'getuserleagues' || opName === 'getusers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { userLeagues: [MOCK_LEAGUE] } }),
      });
    } else if (
      opName === 'getcurrentmatchup' ||
      opName === 'getmatchupbyid' ||
      opName === 'getmatchupsforleague' ||
      opName === 'getmatchupplayers'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      });
    } else if (
      opName === 'getleaguescoring' ||
      opName === 'getleaguescoringprofile'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leagueScoringProfile: null } }),
      });
    } else if (opName === 'getpendingtradeoffers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { pendingTradeOffers: [] } }),
      });
    } else if (opName === 'getpositionsforleague') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { leaguePositions: [] } }),
      });
    } else {
      await unmockedGraphQLFallback(route);
    }
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Football League Detail — Chat Tab @regression', () => {
  test('Chat sub-tab is reachable and renders the message list + input (AC1, AC2)', async ({
    page,
    leaguePage,
  }) => {
    await mockFootballLeagueChatGraphQL(page);
    await page.goto(FOOTBALL_LEAGUE_URL);

    await expect(page).toHaveURL(FOOTBALL_LEAGUE_URL);
    await leaguePage.expectNoAppError();

    await leaguePage.openTab('Chat', { exact: true });

    await expect(
      page.getByText(MOCK_CHAT_MESSAGES[0].messageText),
    ).toBeVisible();
    await expect(
      page.getByText(MOCK_CHAT_MESSAGES[1].messageText),
    ).toBeVisible();
    await leaguePage.chatInput.expectVisible();
  });

  test('sending a message posts it and appends it to the message list (AC3)', async ({
    page,
    leaguePage,
  }) => {
    let sentVariables: { leagueId: number; messageText: string } | undefined;
    await mockFootballLeagueChatGraphQL(page, {
      onSendMessage: (vars) => {
        sentVariables = vars;
      },
    });
    await page.goto(FOOTBALL_LEAGUE_URL);
    await leaguePage.openTab('Chat', { exact: true });
    await leaguePage.chatInput.expectVisible();

    await leaguePage.chatInput.fill(SENT_MESSAGE_TEXT);
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect.poll(() => sentVariables?.messageText).toBe(SENT_MESSAGE_TEXT);
    expect(sentVariables?.leagueId).toBe(1);
    await expect(page.getByText(SENT_MESSAGE_TEXT)).toBeVisible();
  });

  test('typing "@" opens the mention suggestion list and selecting a team inserts the mention (AC4)', async ({
    page,
    leaguePage,
  }) => {
    await mockFootballLeagueChatGraphQL(page);
    await page.goto(FOOTBALL_LEAGUE_URL);
    await leaguePage.openTab('Chat', { exact: true });
    await leaguePage.chatInput.expectVisible();

    await leaguePage.chatInput.fill('@Alpha');

    const mentionList = page.getByRole('listbox', { name: 'Team mentions' });
    await expect(mentionList).toBeVisible();
    const mentionOption = mentionList.getByRole('option', {
      name: `@${MOCK_TEAMS[0].name}`,
    });
    await expect(mentionOption).toBeVisible();

    await mentionOption.click();

    await leaguePage.chatInput.expectValue(`@${MOCK_TEAMS[0].name} `);
  });

  test('a trade system message renders as a distinct card, not a chat bubble (AC5)', async ({
    page,
    leaguePage,
  }) => {
    await mockFootballLeagueChatGraphQL(page, {
      chatMessages: MOCK_CHAT_MESSAGES_WITH_TRADE,
    });
    await page.goto(FOOTBALL_LEAGUE_URL);
    await leaguePage.openTab('Chat', { exact: true });

    await expect(page.getByText('Alpha Squad ↔ Beta Force')).toBeVisible();
    await expect(page.getByText('Accepted')).toBeVisible();
  });

  test('a waiver system message renders as a distinct card, not a chat bubble (AC6)', async ({
    page,
    leaguePage,
  }) => {
    await mockFootballLeagueChatGraphQL(page, {
      chatMessages: MOCK_CHAT_MESSAGES_WITH_WAIVER,
    });
    await page.goto(FOOTBALL_LEAGUE_URL);
    await leaguePage.openTab('Chat', { exact: true });

    const chatLog = page.getByLabel('Chat messages');
    await expect(chatLog.getByText('Waiver Wire')).toBeVisible();
    await expect(chatLog.getByText('Beta Force')).toBeVisible();
    await expect(chatLog.getByText('Waiver Target')).toBeVisible();
  });
});

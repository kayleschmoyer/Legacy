describe('draft-slot-trades helpers', () => {
  let mockDb: any;
  let helpers: typeof import('./helpers');

  beforeEach(() => {
    jest.resetModules();

    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      // Seats (LS-10074): reseatLeagueDraft clears before inserting, and the
      // slot swap is a single UPDATE ... FROM (VALUES ...) statement.
      delete: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ rows: [] }),
      then: jest.fn((resolve: (v: unknown[]) => unknown) => resolve([])),
    };

    jest.doMock('@legacy-sports/logging', () => ({
      LOGGER: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
    }));

    jest.doMock('@legacy-sports/db-client', () => ({
      PublicSchema: {
        leagues: {
          id: 'id',
          allowDraftSlotTrading: 'allowDraftSlotTrading',
          draftStatus: 'draftStatus',
        },
        leagueMembers: {
          leagueId: 'leagueId',
          userId: 'userId',
          teamId: 'teamId',
          permissionLevel: 'permissionLevel',
        },
        teams: {
          id: 'id',
          leagueId: 'leagueId',
          isLocked: 'isLocked',
          name: 'name',
        },
        drafts: { id: 'id', leagueId: 'leagueId', createdAt: 'createdAt' },
        draftParticipants: {
          id: 'id',
          draftId: 'draftId',
          slot: 'slot',
          teamId: 'teamId',
          leagueId: 'leagueId',
          userId: 'userId',
          controller: 'controller',
          seatName: 'seatName',
          autoPick: 'autoPick',
        },
        draftSlotTrades: {
          id: 'id',
          leagueId: 'leagueId',
          proposerTeamId: 'proposerTeamId',
          counterpartTeamId: 'counterpartTeamId',
          status: 'status',
          createdAt: 'createdAt',
          updatedAt: 'updatedAt',
        },
        leagueMessages: {
          id: 'id',
          leagueId: 'leagueId',
          userId: 'userId',
          messageText: 'messageText',
          messageType: 'messageType',
          metadata: 'metadata',
          timestamp: 'timestamp',
        },
      },
    }));

    helpers = require('./helpers') as typeof import('./helpers');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── assertDraftSlotTradingOpen ─────────────────────────────────────────────

  describe('assertDraftSlotTradingOpen', () => {
    it('throws when the league does not exist', async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      await expect(
        helpers.assertDraftSlotTradingOpen(mockDb, 1),
      ).rejects.toThrow('League not found');
    });

    it('throws when allowDraftSlotTrading is false', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { id: 1, allowDraftSlotTrading: false, draftStatus: 'not-started' },
      ]);
      await expect(
        helpers.assertDraftSlotTradingOpen(mockDb, 1),
      ).rejects.toThrow('not enabled for this league');
    });

    it('throws once the draft has started', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { id: 1, allowDraftSlotTrading: true, draftStatus: 'in-progress' },
      ]);
      await expect(
        helpers.assertDraftSlotTradingOpen(mockDb, 1),
      ).rejects.toThrow('only be proposed before the draft starts');
    });

    it('returns the league row when trading is open', async () => {
      const league = {
        id: 1,
        allowDraftSlotTrading: true,
        draftStatus: 'not-started',
      };
      mockDb.limit.mockResolvedValueOnce([league]);
      await expect(
        helpers.assertDraftSlotTradingOpen(mockDb, 1),
      ).resolves.toEqual(league);
    });
  });

  // ── resolveOwnTeamForDraftSlotTrade ────────────────────────────────────────

  describe('resolveOwnTeamForDraftSlotTrade', () => {
    it('throws when the user has no team in the league', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { teamId: null, permissionLevel: null },
      ]);
      await expect(
        helpers.resolveOwnTeamForDraftSlotTrade(1, 1, mockDb),
      ).rejects.toThrow('do not have a team');
    });

    it('throws for an assistant manager (only GM/commissioner may act)', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 5, permissionLevel: 'assistant_manager' },
      ]);
      await expect(
        helpers.resolveOwnTeamForDraftSlotTrade(1, 1, mockDb),
      ).rejects.toThrow('general manager');
    });

    it('throws when the team is locked', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 5, permissionLevel: 'general_manager' },
      ]);
      mockDb.limit.mockResolvedValueOnce([{ isLocked: true }]);
      await expect(
        helpers.resolveOwnTeamForDraftSlotTrade(1, 1, mockDb),
      ).rejects.toThrow('locked by the commissioner');
    });

    it('returns the team id for an unlocked commissioner-owned team', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { teamId: 5, permissionLevel: 'commissioner' },
      ]);
      mockDb.limit.mockResolvedValueOnce([{ isLocked: false }]);
      await expect(
        helpers.resolveOwnTeamForDraftSlotTrade(1, 1, mockDb),
      ).resolves.toBe(5);
    });
  });

  // ── ensureDraftTeamsSeeded ──────────────────────────────────────────────────

  // Seats live in draft_participants since LS-10074; these assert the same
  // seeding rule against the seat rows that replaced draft_teams.
  describe('ensureDraftTeamsSeeded', () => {
    it('is a no-op when the draft already has seats', async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 1 }]);
      await helpers.ensureDraftTeamsSeeded(mockDb, 10, 1);
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it('seats one row per team, slot 1-indexed by team id ascending, when none exist', async () => {
      mockDb.limit.mockResolvedValueOnce([]); // existing check: empty
      mockDb.orderBy.mockResolvedValueOnce([
        { id: 30 },
        { id: 10 },
        { id: 20 },
      ]);

      await helpers.ensureDraftTeamsSeeded(mockDb, 10, 1);

      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      // No team-name rows and no league members in this stub, so every seat
      // falls back to its "Team <id>" name and to the 'user' controller.
      expect(mockDb.values).toHaveBeenCalledWith([
        {
          draftId: 10,
          slot: 1,
          teamId: 30,
          leagueId: 1,
          controller: 'user',
          seatName: 'Team 30',
          autoPick: false,
        },
        {
          draftId: 10,
          slot: 2,
          teamId: 10,
          leagueId: 1,
          controller: 'user',
          seatName: 'Team 10',
          autoPick: false,
        },
        {
          draftId: 10,
          slot: 3,
          teamId: 20,
          leagueId: 1,
          controller: 'user',
          seatName: 'Team 20',
          autoPick: false,
        },
      ]);
    });

    it('throws when the league has no teams to seed', async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      mockDb.orderBy.mockResolvedValueOnce([]);
      await expect(
        helpers.ensureDraftTeamsSeeded(mockDb, 10, 1),
      ).rejects.toThrow('no teams to seed');
    });
  });

  // ── swapDraftOrder (atomic swap) ────────────────────────────────────────────

  describe('swapDraftOrder', () => {
    it('swaps two seats in a single statement (no sentinel needed — the slot constraint is deferrable)', async () => {
      mockDb.where.mockResolvedValueOnce([
        { teamId: 1, slot: 3 },
        { teamId: 2, slot: 7 },
      ]);

      const result = await helpers.swapDraftOrder(mockDb, 10, 1, 2);

      expect(result).toEqual({ teamAOrder: 7, teamBOrder: 3 });

      // draft_participants_uk_draft_slot is DEFERRABLE INITIALLY IMMEDIATE, so
      // both rows are permuted by one UPDATE ... FROM (VALUES ...) — the old
      // 3-statement sentinel dance draft_teams needed is gone (LS-10074).
      expect(mockDb.execute).toHaveBeenCalledTimes(1);
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('is a no-op when the two teams already hold the same slot (defensive)', async () => {
      mockDb.where.mockResolvedValueOnce([
        { teamId: 1, slot: 4 },
        { teamId: 2, slot: 4 },
      ]);
      const result = await helpers.swapDraftOrder(mockDb, 10, 1, 2);
      expect(result).toEqual({ teamAOrder: 4, teamBOrder: 4 });
      expect(mockDb.execute).not.toHaveBeenCalled();
    });

    it('throws when one of the teams is not part of this draft', async () => {
      mockDb.where.mockResolvedValueOnce([{ teamId: 1, slot: 3 }]);
      await expect(helpers.swapDraftOrder(mockDb, 10, 1, 2)).rejects.toThrow(
        'not part of this draft order',
      );
    });
  });

  // ── cancelPendingDraftSlotTradesForLeague (auto-cancel on draft start) ─────

  describe('cancelPendingDraftSlotTradesForLeague', () => {
    it('cancels every proposed/accepted/approved trade for the league', async () => {
      mockDb.where.mockResolvedValueOnce({ rowCount: 2 });

      const cancelled = await helpers.cancelPendingDraftSlotTradesForLeague(
        mockDb,
        1,
      );

      expect(cancelled).toBe(2);
      expect(mockDb.update).toHaveBeenCalledTimes(1);
      expect(mockDb.set).toHaveBeenCalledWith({ status: 'cancelled' });
    });

    it('returns 0 when there is nothing pending', async () => {
      mockDb.where.mockResolvedValueOnce({ rowCount: 0 });
      await expect(
        helpers.cancelPendingDraftSlotTradesForLeague(mockDb, 1),
      ).resolves.toBe(0);
    });
  });

  // ── postDraftSlotTradeSystemMessage (chat message per action) ───────────────

  describe('postDraftSlotTradeSystemMessage', () => {
    const opts = {
      leagueId: 1,
      tradeId: 42,
      proposerTeamId: 5,
      counterpartTeamId: 9,
    };

    function messageTextFor(
      action: 'proposed' | 'accepted' | 'declined' | 'executed',
    ) {
      mockDb.limit.mockResolvedValueOnce([{ name: 'Proposer FC' }]);
      mockDb.limit.mockResolvedValueOnce([{ name: 'Counterpart FC' }]);
      mockDb.returning.mockResolvedValueOnce([{ id: 1 }]);
      return helpers
        .postDraftSlotTradeSystemMessage(action, opts, {
          db: mockDb,
          notificationService: undefined,
        } as never)
        .then(() => mockDb.values.mock.calls.at(-1)[0].messageText as string);
    }

    it('attributes a proposed trade to the proposer, addressed to the counterpart', async () => {
      await expect(messageTextFor('proposed')).resolves.toBe(
        '🔀 Proposer FC proposed a draft slot trade to Counterpart FC',
      );
    });

    it('attributes an accepted trade to the counterpart, not the proposer (regression)', async () => {
      await expect(messageTextFor('accepted')).resolves.toBe(
        '🔀 Counterpart FC accepted a draft slot trade with Proposer FC',
      );
    });

    it('attributes a declined trade to the counterpart', async () => {
      await expect(messageTextFor('declined')).resolves.toBe(
        '🔀 Counterpart FC declined a draft slot trade from Proposer FC',
      );
    });

    it('describes an executed trade as between both teams', async () => {
      await expect(messageTextFor('executed')).resolves.toBe(
        '🔀 Draft slot trade executed between Proposer FC and Counterpart FC',
      );
    });
  });
});

export {};

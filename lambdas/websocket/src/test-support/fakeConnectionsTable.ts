/** DynamoDB attribute-value shape used by the connections table. */
export type AttrItem = Record<
  string,
  { S?: string; N?: string; BOOL?: boolean }
>;

/**
 * Mirrors the real `ConditionalCheckFailedException` DynamoDB throws when a
 * conditional write's condition isn't met — `sendMessageToConnection`'s
 * grace-period delete (index.ts) checks `error.name` for exactly this string.
 */
export class ConditionalCheckFailedError extends Error {
  readonly name = 'ConditionalCheckFailedException';
}

/**
 * Minimal in-memory stand-in for the DynamoDB connections table, supporting
 * only the operations `lambdas/websocket/src/index.ts` and
 * `WebSocketNotificationService` actually issue against it: Put/Get/Delete/
 * Update by `connectionId` key, Query against the `LeagueIdIndex` /
 * `DraftIdIndex` / `MatchupIdIndex` / `UserIdIndex` GSIs, and Scan.
 *
 * Unlike a one-shot `mockResolvedValue({})`, this fake carries real state
 * across calls — a broadcast triggered after two independent `$connect`
 * invocations can genuinely find both connections. That cross-call state is
 * exactly what a canned per-call mock can't model, and modeling it is the
 * point of this test harness (see fan-out.spec.ts).
 */
export class FakeConnectionsTable {
  private readonly rows = new Map<string, AttrItem>();

  putItem(item: AttrItem): void {
    const id = item['connectionId']?.S;
    if (!id) {
      throw new Error('FakeConnectionsTable.putItem: missing connectionId');
    }
    this.rows.set(id, item);
  }

  /**
   * DynamoDB excludes TTL-expired items from Scan/Query/GetItem responses
   * well before the background sweep physically deletes them — that's the
   * "silent" part of LS-8878's bug (the row is gone from reads, but nothing
   * ever told the client). Mirror that by filtering on `ttl` (epoch seconds)
   * against the real wall clock on every read.
   */
  private isExpired(row: AttrItem): boolean {
    const ttl = row['ttl']?.N;
    return ttl !== undefined && Number(ttl) <= Math.floor(Date.now() / 1000);
  }

  getItem(connectionId: string): AttrItem | undefined {
    const row = this.rows.get(connectionId);
    return row && !this.isExpired(row) ? row : undefined;
  }

  /**
   * `condition` mirrors the one conditional-delete shape the production code
   * issues: "delete only if `attr` is absent or below `lessThan`" (the
   * connect-grace-period check in `sendMessageToConnection` /
   * `WebSocketNotificationService.sendToConnection`). A freshly-inserted
   * connection's `connectedAt` is always recent, so without this check a
   * transient post-connect delivery race (this harness's self-push-before-
   * registration ordering — see `LocalWsBridge`'s docblock) would incorrectly
   * delete a connection the real conditional delete would have left alone.
   */
  deleteItem(
    connectionId: string,
    condition?: { attr: string; lessThan: number },
  ): void {
    if (condition) {
      const existing = this.rows.get(connectionId);
      const value = existing?.[condition.attr]?.N;
      if (value !== undefined && Number(value) >= condition.lessThan) {
        throw new ConditionalCheckFailedError('The conditional request failed');
      }
    }
    this.rows.delete(connectionId);
  }

  /**
   * Applies only the specific `SET`/`REMOVE` shapes
   * `lambdas/websocket/src/index.ts`'s `handleUpdateContext` emits — this is
   * a test double for one caller, not a general UpdateExpression parser.
   */
  updateItem(
    connectionId: string,
    updateExpression: string,
    values: Record<string, { S?: string; N?: string }>,
  ): void {
    const existing = this.rows.get(connectionId);
    if (!existing) return;
    const updated: AttrItem = { ...existing };

    const removeMatch = /REMOVE ([^]*?)(?: SET |$)/.exec(updateExpression);
    if (removeMatch) {
      for (const attr of removeMatch[1].split(',').map((s) => s.trim())) {
        if (attr) delete updated[attr];
      }
    }

    if (
      updateExpression.includes('leagueId = :leagueId') &&
      values[':leagueId']
    ) {
      updated['leagueId'] = values[':leagueId'];
    }
    if (
      updateExpression.includes('matchupId = :matchupId') &&
      values[':matchupId']
    ) {
      updated['matchupId'] = values[':matchupId'];
    }
    if (updateExpression.includes('draftId = :draftId') && values[':draftId']) {
      updated['draftId'] = values[':draftId'];
    }
    if (
      updateExpression.includes('draftLeagueId = :draftLeagueId') &&
      values[':draftLeagueId']
    ) {
      updated['draftLeagueId'] = values[':draftLeagueId'];
    }
    if (
      updateExpression.includes('viewContext = :viewContext') &&
      values[':viewContext']
    ) {
      updated['viewContext'] = values[':viewContext'];
    }
    if (values[':ttl']) updated['ttl'] = values[':ttl'];

    this.rows.set(connectionId, updated);
  }

  /**
   * @param excludeViewContext - When set, rows whose `viewContext` equals
   *   this value are excluded (mirrors the real table's FilterExpression —
   *   see `WebSocketNotificationService.getConnections` — LS-6355).
   */
  queryByLeagueId(leagueId: number, excludeViewContext?: string): AttrItem[] {
    return [...this.rows.values()].filter(
      (row) =>
        !this.isExpired(row) &&
        row['leagueId']?.N === String(leagueId) &&
        (!excludeViewContext || row['viewContext']?.S !== excludeViewContext),
    );
  }

  /**
   * `DraftIdIndex` (LS-10075). `excludeViewContext` mirrors the notification
   * service's lobby-preview FilterExpression, as for `queryByLeagueId`.
   */
  queryByDraftId(draftId: number, excludeViewContext?: string): AttrItem[] {
    return [...this.rows.values()].filter(
      (row) =>
        !this.isExpired(row) &&
        row['draftId']?.N === String(draftId) &&
        (!excludeViewContext || row['viewContext']?.S !== excludeViewContext),
    );
  }

  queryByMatchupId(matchupId: number, viewContext?: string): AttrItem[] {
    return [...this.rows.values()].filter(
      (row) =>
        !this.isExpired(row) &&
        row['matchupId']?.N === String(matchupId) &&
        (!viewContext || row['viewContext']?.S === viewContext),
    );
  }

  queryByUserId(userId: number): AttrItem[] {
    return [...this.rows.values()].filter(
      (row) => !this.isExpired(row) && row['userId']?.N === String(userId),
    );
  }

  scanAll(): AttrItem[] {
    return [...this.rows.values()].filter((row) => !this.isExpired(row));
  }

  clear(): void {
    this.rows.clear();
  }
}

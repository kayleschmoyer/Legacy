import {
  down,
  up,
} from '../../../migrations/20261002_120000_create_subscription_transactions';

/**
 * Migration test for LS-10396: subscription_transactions ledger.
 *
 * Statement-level assertions on the generated SQL. Constraint behaviour is
 * exercised against a real Postgres in
 * lambdas/db/src/schema/subscription-transactions.db.spec.ts.
 */
describe('Migration — create subscription_transactions (LS-10396)', () => {
  type MigrationArgs = Parameters<typeof up>[0];
  const capture = async (
    fn: (args: MigrationArgs) => Promise<void>,
  ): Promise<string[]> => {
    const statements: string[] = [];
    const mockDb = {
      execute: (stmt: unknown) => {
        statements.push(String(stmt));
        return Promise.resolve();
      },
    };
    await fn({ db: mockDb as unknown as MigrationArgs['db'] });
    return statements;
  };

  describe('up', () => {
    it('guards both enums against duplicate_object', async () => {
      const statements = await capture(up);
      const enums = statements.filter((s) => s.includes('CREATE TYPE'));

      expect(enums).toHaveLength(2);
      for (const stmt of enums) {
        expect(stmt).toContain('EXCEPTION');
        expect(stmt).toContain('WHEN duplicate_object THEN null');
      }
      const sql = enums.join('\n');
      expect(sql).toContain(
        "app_internal.subscription_transaction_provider AS ENUM (\n        'stripe',\n        'apple',\n        'google'",
      );
      for (const value of [
        'payment_succeeded',
        'payment_failed',
        'refund',
        'dispute_created',
      ]) {
        expect(sql).toContain(`'${value}'`);
      }
    });

    it('creates the table idempotently with the required columns and constraints', async () => {
      const sql = (await capture(up)).join('\n');

      expect(sql).toContain(
        'CREATE TABLE IF NOT EXISTS app_internal.subscription_transactions',
      );
      expect(sql).toContain(
        'subscription_id INTEGER NOT NULL REFERENCES app_internal.subscriptions(id) ON DELETE CASCADE',
      );
      expect(sql).toContain('user_id INTEGER NOT NULL');
      expect(sql).toContain('amount_cents INTEGER,');
      expect(sql).toContain('currency TEXT,');
      expect(sql).toContain('provider_event_id TEXT NOT NULL');
      expect(sql).toContain('occurred_at TIMESTAMP WITH TIME ZONE NOT NULL');
      expect(sql).toContain(
        'CONSTRAINT subscription_transactions_provider_event_id_uk UNIQUE (provider_event_id)',
      );
    });

    it('creates the subscription_id index idempotently', async () => {
      const sql = (await capture(up)).join('\n');
      expect(sql).toContain(
        'CREATE INDEX IF NOT EXISTS subscription_transactions_subscription_id_idx',
      );
    });

    it('creates enums before the table that uses them', async () => {
      const statements = await capture(up);
      const tableIdx = statements.findIndex((s) => s.includes('CREATE TABLE'));
      const lastEnumIdx = statements.reduce(
        (acc, s, i) => (s.includes('CREATE TYPE') ? i : acc),
        -1,
      );
      expect(lastEnumIdx).toBeLessThan(tableIdx);
    });
  });

  describe('down', () => {
    it('drops the table before the enums, all IF EXISTS', async () => {
      const sql = (await capture(down)).join('\n');
      expect(sql).toContain(
        'DROP TABLE IF EXISTS app_internal.subscription_transactions',
      );
      expect(sql).toContain(
        'DROP TYPE IF EXISTS app_internal.subscription_transaction_event_type',
      );
      expect(sql).toContain(
        'DROP TYPE IF EXISTS app_internal.subscription_transaction_provider',
      );
      expect(sql.indexOf('DROP TABLE')).toBeLessThan(sql.indexOf('DROP TYPE'));
    });
  });
});

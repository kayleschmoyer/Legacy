import type { DbOptions } from '@legacy-sports/utils/node';
import { UserService } from './UserService';
import * as InternalSchema from '../../drizzle/internal/schema';

jest.mock('../client/Helpers', () => ({
  runWithInternalClient: jest.fn(),
  runWithPublicClient: jest.fn(),
}));

const mockedHelpers = jest.mocked<typeof import('../client/Helpers')>(
  jest.requireMock('../client/Helpers'),
);

describe('UserService.updateUsername — history (LS-7242)', () => {
  const options = { type: 'pg-local' } as DbOptions;
  let service: UserService;
  let tx: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    for: jest.Mock;
    update: jest.Mock;
    set: jest.Mock;
    insert: jest.Mock;
    values: jest.Mock;
  };

  const arrange = (current: { username: string | null } | undefined) => {
    tx = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      for: jest.fn().mockResolvedValue(current ? [current] : []),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockResolvedValue(undefined),
    };
    // `update(...).set(...).where(...)` is awaited, so the final `where`
    // must resolve even though the select chain also uses it.
    tx.where.mockImplementation(() =>
      Object.assign(Promise.resolve(undefined), { for: tx.for }),
    );
    const db = {
      transaction: jest.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    mockedHelpers.runWithInternalClient.mockImplementation((_o, handler) =>
      handler(db as never),
    );
    jest.spyOn(service, 'getUserById').mockResolvedValue(null);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UserService(options);
  });

  it('records the previous and new username in the same transaction', async () => {
    arrange({ username: 'old_name' });

    await service.updateUsername(7, 'new_name');

    expect(tx.set).toHaveBeenCalledWith({ username: 'new_name' });
    expect(tx.insert).toHaveBeenCalledWith(InternalSchema.usernameHistory);
    expect(tx.values).toHaveBeenCalledWith({
      userId: 7,
      oldUsername: 'old_name',
      newUsername: 'new_name',
    });
  });

  it('does not write history when the username is unchanged', async () => {
    arrange({ username: 'same' });

    await service.updateUsername(7, 'same');

    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('writes nothing when the user does not exist', async () => {
    arrange(undefined);

    await service.updateUsername(404, 'whoever');

    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
});

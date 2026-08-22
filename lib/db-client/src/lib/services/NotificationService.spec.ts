import type { DbOptions } from '@legacy-sports/utils/node';
import { NotificationService } from './NotificationService';
import { PublicSchema } from '../client/PublicDbClient';

jest.mock('../client/Helpers', () => ({
  runWithPublicClient: jest.fn(),
}));

const mockedHelpers = jest.mocked<typeof import('../client/Helpers')>(
  jest.requireMock('../client/Helpers'),
);

const ROW = {
  id: 5,
  userId: 42,
  deviceToken: 'token-abc',
  platform: 'web',
  isActive: true,
  createdAt: new Date('2026-08-22T00:00:00Z'),
  updatedAt: new Date('2026-08-22T00:00:00Z'),
};

describe('NotificationService.registerDeviceToken', () => {
  const options = { type: 'pg-local' } as DbOptions;
  let service: NotificationService;

  const mockReturning = jest.fn();
  const mockOnConflictDoUpdate = jest.fn(() => ({ returning: mockReturning }));
  const mockValues = jest.fn(() => ({
    onConflictDoUpdate: mockOnConflictDoUpdate,
  }));
  const mockInsert = jest.fn(() => ({ values: mockValues }));
  const mockSelect = jest.fn();
  const mockDb = { insert: mockInsert, select: mockSelect };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationService(options);
    mockReturning.mockResolvedValue([ROW]);
    mockedHelpers.runWithPublicClient.mockImplementation((_opts, handler) =>
      handler(mockDb as never),
    );
  });

  it('reuses a caller-supplied connection instead of opening its own (LS-9541)', async () => {
    const result = await service.registerDeviceToken(
      42,
      'token-abc',
      'web',
      mockDb as never,
    );

    expect(mockedHelpers.runWithPublicClient).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledWith(PublicSchema.deviceTokens);
    expect(result).toMatchObject({
      id: 5,
      userId: 42,
      deviceToken: 'token-abc',
      platform: 'web',
      isActive: true,
    });
  });

  it('opens its own connection when no db is supplied', async () => {
    await service.registerDeviceToken(42, 'token-abc', 'web');

    expect(mockedHelpers.runWithPublicClient).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(PublicSchema.deviceTokens);
  });

  it('upserts in a single statement rather than SELECT-then-UPDATE (LS-9541)', async () => {
    await service.registerDeviceToken(42, 'token-abc', 'web', mockDb as never);

    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith({
      userId: 42,
      deviceToken: 'token-abc',
      platform: 'web',
      isActive: true,
    });
    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith({
      target: PublicSchema.deviceTokens.deviceToken,
      set: {
        userId: 42,
        platform: 'web',
        isActive: true,
        updatedAt: expect.any(Date) as Date,
      },
    });
  });

  it('reactivates a row registered to a different user by overwriting user_id', async () => {
    mockReturning.mockResolvedValue([{ ...ROW, userId: 99 }]);

    const result = await service.registerDeviceToken(
      99,
      'token-abc',
      'web',
      mockDb as never,
    );

    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith({
      target: PublicSchema.deviceTokens.deviceToken,
      set: {
        userId: 99,
        platform: 'web',
        isActive: true,
        updatedAt: expect.any(Date) as Date,
      },
    });
    expect(result.userId).toBe(99);
  });
});

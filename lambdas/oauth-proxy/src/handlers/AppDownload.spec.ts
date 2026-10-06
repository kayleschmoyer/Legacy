import { APIGatewayEvent } from 'aws-lambda';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  isEmailAllowlisted,
  recordDownloadAttempt,
} from '@legacy-sports/db-client';
import {
  DOWNLOAD_RETURN_STATE,
  handleAndroidDownload,
  resetS3ClientForTests,
} from './AppDownload';
import { getNavigationUser } from '../util/authenticated-request';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  GetObjectCommand: jest
    .fn()
    .mockImplementation((input: unknown) => ({ input })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('@legacy-sports/db-client', () =>
  mockDbClientModule({
    isEmailAllowlisted: jest.fn(),
    recordDownloadAttempt: jest.fn().mockResolvedValue(undefined),
  }),
);

jest.mock('../util/authenticated-request', () => ({
  getNavigationUser: jest.fn(),
}));

jest.mock('../util/db', () => ({
  withDbClient: jest.fn((cb: (db: unknown) => Promise<unknown>) => cb({})),
}));

const mockGetSignedUrl = getSignedUrl as jest.MockedFunction<
  typeof getSignedUrl
>;
const mockIsEmailAllowlisted = isEmailAllowlisted as jest.MockedFunction<
  typeof isEmailAllowlisted
>;
const mockRecordDownloadAttempt = recordDownloadAttempt as jest.MockedFunction<
  typeof recordDownloadAttempt
>;
const mockGetNavigationUser = getNavigationUser as jest.MockedFunction<
  typeof getNavigationUser
>;

const PRESIGNED = 'https://s3.example.com/legacy-sports-latest.apk?X-Amz-Sig=x';

function buildEvent(headers: Record<string, string> = {}): APIGatewayEvent {
  return {
    httpMethod: 'GET',
    path: '/oauth/download/android',
    headers: { 'User-Agent': 'Mozilla/5.0 (Android 14)', ...headers },
    queryStringParameters: null,
  } as unknown as APIGatewayEvent;
}

describe('handleAndroidDownload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetS3ClientForTests();
    process.env['APP_DOWNLOAD_BUCKET'] = 'legacy-sports-dev-app-downloads';
    process.env['APP_DOWNLOAD_ANDROID_CURRENT_KEY'] =
      'android/current/legacy-sports-latest.apk';
    mockGetSignedUrl.mockResolvedValue(PRESIGNED);
  });

  afterEach(() => {
    delete process.env['APP_DOWNLOAD_BUCKET'];
    delete process.env['APP_DOWNLOAD_ANDROID_CURRENT_KEY'];
  });

  describe('with no session', () => {
    beforeEach(() => mockGetNavigationUser.mockResolvedValue(null));

    it('redirects into the Google flow carrying the download return marker', async () => {
      const result = await handleAndroidDownload(buildEvent());

      expect(result.statusCode).toBe(302);
      expect(result.headers?.['Location']).toBe(
        `/oauth/google/authorize?state=${encodeURIComponent(DOWNLOAD_RETURN_STATE)}`,
      );
    });

    it('does not audit an attempt that never identified anyone', async () => {
      await handleAndroidDownload(buildEvent());

      expect(mockRecordDownloadAttempt).not.toHaveBeenCalled();
    });
  });

  describe('when the caller is an admin', () => {
    beforeEach(() =>
      mockGetNavigationUser.mockResolvedValue({
        id: 1,
        email: 'admin@example.com',
        isAdmin: true,
      }),
    );

    it('serves the APK with no allowlist row present at all', async () => {
      mockIsEmailAllowlisted.mockResolvedValue(false);

      const result = await handleAndroidDownload(buildEvent());

      expect(result.statusCode).toBe(302);
      expect(result.headers?.['Location']).toBe(PRESIGNED);
    });

    it('does not consult the allowlist — the bypass short-circuits it', async () => {
      await handleAndroidDownload(buildEvent());

      expect(mockIsEmailAllowlisted).not.toHaveBeenCalled();
    });

    it('records the grant as an admin bypass, not a listed grant', async () => {
      await handleAndroidDownload(buildEvent());

      expect(mockRecordDownloadAttempt).toHaveBeenCalledTimes(1);
      expect(mockRecordDownloadAttempt).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          email: 'admin@example.com',
          outcome: 'allowed_admin',
        }),
      );
    });
  });

  describe('when the caller is on the allowlist', () => {
    beforeEach(() => {
      mockGetNavigationUser.mockResolvedValue({
        id: 7,
        email: 'Tester@Example.com',
        isAdmin: false,
      });
      mockIsEmailAllowlisted.mockResolvedValue(true);
    });

    it('redirects to a presigned URL', async () => {
      const result = await handleAndroidDownload(buildEvent());

      expect(result.statusCode).toBe(302);
      expect(result.headers?.['Location']).toBe(PRESIGNED);
    });

    it('keeps the short-lived redirect target out of shared caches', async () => {
      const result = await handleAndroidDownload(buildEvent());

      expect(result.headers?.['Cache-Control']).toBe('no-store, private');
    });

    it('presigns with a TTL long enough to resume a stalled download but at most thirty minutes', async () => {
      await handleAndroidDownload(buildEvent());

      const [, , options] = mockGetSignedUrl.mock.calls[0];
      expect(options?.expiresIn).toBeGreaterThanOrEqual(900);
      expect(options?.expiresIn).toBeLessThanOrEqual(1800);
    });

    it('records exactly one listed-grant row, with the user agent', async () => {
      await handleAndroidDownload(buildEvent());

      expect(mockRecordDownloadAttempt).toHaveBeenCalledTimes(1);
      expect(mockRecordDownloadAttempt).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          email: 'Tester@Example.com',
          outcome: 'allowed_listed',
          userAgent: 'Mozilla/5.0 (Android 14)',
        }),
      );
    });

    it('passes the address through unchanged so the service can normalise it', async () => {
      // The handler must not lowercase before asking: isEmailAllowlisted
      // matches on lower(email) at the database, which is also how the unique
      // index is defined. Normalising in two places invites them to drift.
      await handleAndroidDownload(buildEvent());

      expect(mockIsEmailAllowlisted).toHaveBeenCalledWith(
        expect.anything(),
        'Tester@Example.com',
      );
    });

    it('still serves the download when the audit write fails', async () => {
      mockRecordDownloadAttempt.mockRejectedValueOnce(new Error('db down'));

      const result = await handleAndroidDownload(buildEvent());

      expect(result.statusCode).toBe(302);
      expect(result.headers?.['Location']).toBe(PRESIGNED);
    });
  });

  describe('when the caller is not on the allowlist', () => {
    beforeEach(() => {
      mockGetNavigationUser.mockResolvedValue({
        id: 9,
        email: 'stranger@example.com',
        isAdmin: false,
      });
      // Covers both an absent row and one with revoked_at set — the service
      // collapses them to the same answer by design, since a revoked tester
      // and an unknown one have identical access.
      mockIsEmailAllowlisted.mockResolvedValue(false);
    });

    it('refuses with a 403 rather than a redirect', async () => {
      const result = await handleAndroidDownload(buildEvent());

      expect(result.statusCode).toBe(403);
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });

    it('names the signed-in address so the tester knows what to send the team', async () => {
      const result = await handleAndroidDownload(buildEvent());

      expect(result.body).toContain('stranger@example.com');
    });

    it('escapes the address rather than reflecting it into the page', async () => {
      mockGetNavigationUser.mockResolvedValue({
        id: 9,
        email: '<script>alert(1)</script>@example.com',
        isAdmin: false,
      });

      const result = await handleAndroidDownload(buildEvent());

      expect(result.body).not.toContain('<script>');
      expect(result.body).toContain('&lt;script&gt;');
    });

    it('records exactly one denial', async () => {
      await handleAndroidDownload(buildEvent());

      expect(mockRecordDownloadAttempt).toHaveBeenCalledTimes(1);
      expect(mockRecordDownloadAttempt).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          email: 'stranger@example.com',
          outcome: 'denied',
        }),
      );
    });
  });

  describe('when the route is misconfigured', () => {
    it('fails closed with a 500 and never reaches the allowlist', async () => {
      delete process.env['APP_DOWNLOAD_BUCKET'];
      mockGetNavigationUser.mockResolvedValue({
        id: 1,
        email: 'admin@example.com',
        isAdmin: true,
      });

      const result = await handleAndroidDownload(buildEvent());

      expect(result.statusCode).toBe(500);
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
      expect(mockRecordDownloadAttempt).not.toHaveBeenCalled();
    });
  });

  describe('when presigning fails', () => {
    it('reports a 500 to an otherwise-authorised caller', async () => {
      mockGetNavigationUser.mockResolvedValue({
        id: 7,
        email: 'tester@example.com',
        isAdmin: false,
      });
      mockIsEmailAllowlisted.mockResolvedValue(true);
      mockGetSignedUrl.mockRejectedValue(new Error('s3 unavailable'));

      const result = await handleAndroidDownload(buildEvent());

      expect(result.statusCode).toBe(500);
    });
  });
});

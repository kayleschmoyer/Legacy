/**
 * Unit tests for the image-upload Lambda handler.
 *
 * Covers:
 *   - Auth parsing (Bearer token vs cookie + CSRF)
 *   - validateImageBuffer error → HTTP status-code mapping
 *   - Cloudflare moderation handling (safe / flagged / error)
 *   - Handler status-code mapping for each code path
 */

import type { APIGatewayEvent, Context } from 'aws-lambda';

// ── Module mocks (hoisted by jest before imports) ──────────────────────────

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@legacy-sports/utils/node', () => ({
  getDbOptions: jest.fn().mockReturnValue({}),
}));

jest.mock('@legacy-sports/db-client', () => ({
  runWithPublicClient: jest.fn(),
  PublicSchema: {
    leagueMembers: {
      teamId: 'teamId',
      permissionLevel: 'permissionLevel',
      userId: 'userId',
    },
    teams: { id: 'id' },
  },
  eq: jest.fn(),
  and: jest.fn(),
}));

jest.mock('./cloudflare', () => ({
  classifyImageForNsfw: jest.fn(),
}));

jest.mock('./storage', () => ({
  uploadImageToS3: jest.fn(),
}));

jest.mock('./auth', () => ({
  getAuthenticatedUserId: jest.fn(),
}));

jest.mock('@legacy-sports/aws-utils', () => ({
  retrieveSecretParameterValue: jest.fn(),
}));

// ── Import after mocks ─────────────────────────────────────────────────────

import { handler } from './index';
import { classifyImageForNsfw } from './cloudflare';
import { uploadImageToS3 } from './storage';
import { getAuthenticatedUserId } from './auth';
import { runWithPublicClient } from '@legacy-sports/db-client';

const mockClassify = classifyImageForNsfw as jest.MockedFunction<
  typeof classifyImageForNsfw
>;
const mockUpload = uploadImageToS3 as jest.MockedFunction<
  typeof uploadImageToS3
>;
const mockAuth = getAuthenticatedUserId as jest.MockedFunction<
  typeof getAuthenticatedUserId
>;
const mockRunWithPublicClient = runWithPublicClient as jest.MockedFunction<
  typeof runWithPublicClient
>;

// ── Constants ──────────────────────────────────────────────────────────────

/** Minimal PNG with valid magic bytes: 0x89 0x50 0x4E 0x47 */
const MINIMAL_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52,
]);

// ── Helpers ────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<APIGatewayEvent> = {}): APIGatewayEvent {
  return {
    httpMethod: 'POST',
    path: '/images/upload',
    headers: {
      Authorization: 'Bearer valid-token',
      'Content-Type': 'image/png',
    },
    multiValueHeaders: {},
    body: MINIMAL_PNG.toString('base64'),
    isBase64Encoded: true,
    queryStringParameters: { teamId: '1', imageType: 'avatar' },
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayEvent['requestContext'],
    resource: '',
    ...overrides,
  };
}

const MOCK_CONTEXT = {} as Context;

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  process.env['CORS_ALLOWED_ORIGINS'] = 'https://legacy-fantasy.com';

  // Default: authenticated as user 42
  mockAuth.mockResolvedValue(42);

  // Default: user is a GM of team 1
  mockRunWithPublicClient.mockImplementation(async (_opts, fn) => {
    const fakeDrizzle = {
      select: () => fakeDrizzle,
      from: () => fakeDrizzle,
      innerJoin: () => fakeDrizzle,
      where: () => fakeDrizzle,
      limit: () => [{ teamId: 1, permissionLevel: 'general_manager' }],
    };
    return fn(fakeDrizzle as never);
  });

  mockClassify.mockResolvedValue(false);
  mockUpload.mockResolvedValue(
    'https://cdn.example.com/logos/team-1-avatar.png',
  );
});

afterEach(() => {
  delete process.env['CORS_ALLOWED_ORIGINS'];
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('handler — basic routing', () => {
  it('returns 200 for OPTIONS preflight', async () => {
    const res = await handler(
      makeEvent({ httpMethod: 'OPTIONS' }),
      MOCK_CONTEXT,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('');
  });

  it('returns 200 for GET /images/health', async () => {
    const res = await handler(
      makeEvent({ httpMethod: 'GET', path: '/images/health' }),
      MOCK_CONTEXT,
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('returns 200 for GET /images/upload/health', async () => {
    const res = await handler(
      makeEvent({ httpMethod: 'GET', path: '/images/upload/health' }),
      MOCK_CONTEXT,
    );
    expect(res.statusCode).toBe(200);
  });

  it('returns 405 for unsupported HTTP method', async () => {
    const res = await handler(
      makeEvent({ httpMethod: 'DELETE' }),
      MOCK_CONTEXT,
    );
    expect(res.statusCode).toBe(405);
  });
});

describe('handler — authentication', () => {
  it('returns 401 when auth throws', async () => {
    mockAuth.mockRejectedValueOnce(
      new Error('No authentication token provided'),
    );
    const res = await handler(makeEvent(), MOCK_CONTEXT);
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when auth throws for invalid Bearer token', async () => {
    mockAuth.mockRejectedValueOnce(new Error('jwt malformed'));
    const res = await handler(
      makeEvent({
        headers: {
          Authorization: 'Bearer invalid.token.here',
          'Content-Type': 'image/png',
        },
      }),
      MOCK_CONTEXT,
    );
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when auth throws for expired token', async () => {
    mockAuth.mockRejectedValueOnce(new Error('jwt expired'));
    const res = await handler(makeEvent(), MOCK_CONTEXT);
    expect(res.statusCode).toBe(401);
  });

  it('proceeds to upload when auth returns a valid user ID', async () => {
    mockAuth.mockResolvedValueOnce(42);
    const res = await handler(makeEvent(), MOCK_CONTEXT);
    expect(res.statusCode).toBe(200);
  });

  it('returns 401 when auth throws for missing CSRF (cookie path)', async () => {
    mockAuth.mockRejectedValueOnce(new Error('CSRF validation failed'));
    const res = await handler(makeEvent(), MOCK_CONTEXT);
    expect(res.statusCode).toBe(401);
  });

  it('delegates auth decision to getAuthenticatedUserId (Bearer path)', async () => {
    const event = makeEvent({
      headers: { Authorization: 'Bearer token', 'Content-Type': 'image/png' },
    });
    await handler(event, MOCK_CONTEXT);
    expect(mockAuth).toHaveBeenCalledWith(event);
  });
});

describe('handler — query parameter validation', () => {
  it('returns 400 when teamId is missing', async () => {
    const res = await handler(
      makeEvent({ queryStringParameters: { imageType: 'avatar' } }),
      MOCK_CONTEXT,
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when teamId is non-numeric', async () => {
    const res = await handler(
      makeEvent({
        queryStringParameters: { teamId: 'abc', imageType: 'avatar' },
      }),
      MOCK_CONTEXT,
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when imageType is invalid', async () => {
    const res = await handler(
      makeEvent({ queryStringParameters: { teamId: '1', imageType: 'logo' } }),
      MOCK_CONTEXT,
    );
    expect(res.statusCode).toBe(400);
  });

  it('accepts imageType "banner"', async () => {
    const res = await handler(
      makeEvent({
        queryStringParameters: { teamId: '1', imageType: 'banner' },
      }),
      MOCK_CONTEXT,
    );
    expect(res.statusCode).toBe(200);
  });
});

describe('handler — image validation status codes', () => {
  it('returns 400 for empty body', async () => {
    const res = await handler(makeEvent({ body: null }), MOCK_CONTEXT);
    expect(res.statusCode).toBe(400);
  });

  it('returns 413 when image exceeds 2 MB', async () => {
    // 3 MB buffer with valid PNG magic bytes — only the size check fails
    const oversized = Buffer.alloc(3 * 1024 * 1024, 0x00);
    oversized[0] = 0x89;
    oversized[1] = 0x50;
    oversized[2] = 0x4e;
    oversized[3] = 0x47;
    const res = await handler(
      makeEvent({ body: oversized.toString('base64'), isBase64Encoded: true }),
      MOCK_CONTEXT,
    );
    expect(res.statusCode).toBe(413);
  });

  it('returns 400 when magic bytes do not match Content-Type', async () => {
    // JPEG magic bytes declared as image/png
    const jpegMagic = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const res = await handler(
      makeEvent({
        headers: { Authorization: 'Bearer valid', 'Content-Type': 'image/png' },
        body: jpegMagic.toString('base64'),
        isBase64Encoded: true,
      }),
      MOCK_CONTEXT,
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 415 for unsupported Content-Type', async () => {
    const res = await handler(
      makeEvent({
        headers: { Authorization: 'Bearer valid', 'Content-Type': 'image/gif' },
      }),
      MOCK_CONTEXT,
    );
    expect(res.statusCode).toBe(415);
  });
});

describe('handler — Cloudflare NSFW moderation', () => {
  it('returns 200 with URL when image is classified as safe', async () => {
    mockClassify.mockResolvedValueOnce(false);
    const res = await handler(makeEvent(), MOCK_CONTEXT);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { url: string };
    expect(body.url).toContain('cdn.example.com');
  });

  it('returns 422 when image is flagged as NSFW', async () => {
    mockClassify.mockResolvedValueOnce(true);
    const res = await handler(makeEvent(), MOCK_CONTEXT);
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toContain('inappropriate');
  });

  it('returns 502 when Cloudflare classification throws', async () => {
    mockClassify.mockRejectedValueOnce(new Error('Cloudflare timeout'));
    const res = await handler(makeEvent(), MOCK_CONTEXT);
    expect(res.statusCode).toBe(502);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toContain('moderation service');
  });
});

describe('handler — S3 upload', () => {
  it('returns 500 when S3 upload fails', async () => {
    mockUpload.mockRejectedValueOnce(new Error('S3 access denied'));
    const res = await handler(makeEvent(), MOCK_CONTEXT);
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toContain('Failed to store image');
  });

  it('returns the S3 URL on success', async () => {
    mockUpload.mockResolvedValueOnce(
      'https://cdn.example.com/logos/1-avatar.png',
    );
    const res = await handler(makeEvent(), MOCK_CONTEXT);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { url: string };
    expect(body.url).toBe('https://cdn.example.com/logos/1-avatar.png');
  });
});

describe('handler — CORS headers', () => {
  it('reflects an allowed origin in the response', async () => {
    const res = await handler(
      makeEvent({
        headers: {
          Authorization: 'Bearer valid',
          'Content-Type': 'image/png',
          Origin: 'https://legacy-fantasy.com',
        },
      }),
      MOCK_CONTEXT,
    );
    expect(res.headers?.['Access-Control-Allow-Origin']).toBe(
      'https://legacy-fantasy.com',
    );
    expect(res.headers?.['Access-Control-Allow-Credentials']).toBe('true');
  });

  it('omits ACAO header for disallowed origins', async () => {
    const res = await handler(
      makeEvent({
        headers: {
          Authorization: 'Bearer valid',
          'Content-Type': 'image/png',
          Origin: 'https://evil.com',
        },
      }),
      MOCK_CONTEXT,
    );
    expect(res.headers?.['Access-Control-Allow-Origin']).toBeUndefined();
  });
});

describe('handler — team ownership authorization', () => {
  it('returns 403 when user is not a member of the team', async () => {
    mockRunWithPublicClient.mockImplementation(async (_opts, fn) => {
      const fakeDrizzle = {
        select: () => fakeDrizzle,
        from: () => fakeDrizzle,
        innerJoin: () => fakeDrizzle,
        where: () => fakeDrizzle,
        limit: () => [], // empty → not a member
      };
      return fn(fakeDrizzle as never);
    });

    const res = await handler(makeEvent(), MOCK_CONTEXT);
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when user has viewer permission', async () => {
    mockRunWithPublicClient.mockImplementation(async (_opts, fn) => {
      const fakeDrizzle = {
        select: () => fakeDrizzle,
        from: () => fakeDrizzle,
        innerJoin: () => fakeDrizzle,
        where: () => fakeDrizzle,
        limit: () => [{ teamId: 1, permissionLevel: 'viewer' }],
      };
      return fn(fakeDrizzle as never);
    });

    const res = await handler(makeEvent(), MOCK_CONTEXT);
    expect(res.statusCode).toBe(403);
  });

  it('allows upload for commissioner permission', async () => {
    mockRunWithPublicClient.mockImplementation(async (_opts, fn) => {
      const fakeDrizzle = {
        select: () => fakeDrizzle,
        from: () => fakeDrizzle,
        innerJoin: () => fakeDrizzle,
        where: () => fakeDrizzle,
        limit: () => [{ teamId: 1, permissionLevel: 'commissioner' }],
      };
      return fn(fakeDrizzle as never);
    });

    const res = await handler(makeEvent(), MOCK_CONTEXT);
    expect(res.statusCode).toBe(200);
  });

  it('allows upload for assistant_manager permission', async () => {
    mockRunWithPublicClient.mockImplementation(async (_opts, fn) => {
      const fakeDrizzle = {
        select: () => fakeDrizzle,
        from: () => fakeDrizzle,
        innerJoin: () => fakeDrizzle,
        where: () => fakeDrizzle,
        limit: () => [{ teamId: 1, permissionLevel: 'assistant_manager' }],
      };
      return fn(fakeDrizzle as never);
    });

    const res = await handler(makeEvent(), MOCK_CONTEXT);
    expect(res.statusCode).toBe(200);
  });
});

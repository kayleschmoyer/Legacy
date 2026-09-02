import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Stub github-api (import.meta not compatible with ts-jest CommonJS target).
// resolveRunSha is not exercised in this spec — only listPlaywrightS3Artifacts.
jest.mock('./github-api.js', () => ({
  buildHeaders: jest.fn(),
  getToken: jest.fn(),
  githubGet: jest.fn(),
}));

const mockSend = jest.fn<() => Promise<unknown>>();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  ListObjectsV2Command: jest.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest
    .fn<() => Promise<string>>()
    .mockResolvedValue('https://s3.example.com/signed-url'),
}));

import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { listPlaywrightS3Artifacts } from './s3-artifacts.js';

const SHA = 'abc123def456';

beforeEach(() => {
  jest.clearAllMocks();
  mockSend.mockResolvedValue({ Contents: [], IsTruncated: false });
});

describe('listPlaywrightS3Artifacts', () => {
  it('defaults to the playwright-blobs/ prefix', async () => {
    const result = await listPlaywrightS3Artifacts(SHA);

    expect(result.s3Prefix).toBe(
      `s3://legacy-sports-dev-ci-artifacts/ci-artifacts/${SHA}/playwright-blobs/`,
    );
    expect(ListObjectsV2Command).toHaveBeenCalledWith(
      expect.objectContaining({
        Prefix: `ci-artifacts/${SHA}/playwright-blobs/`,
      }),
    );
  });

  it.each([
    ['coverage', 'playwright-coverage'],
    ['output', 'playwright-output'],
    ['blobs', 'playwright-blobs'],
  ] as const)(
    'lists the %s prefix (%s/) for artifactType=%s',
    async (artifactType, expectedSegment) => {
      const result = await listPlaywrightS3Artifacts(SHA, artifactType);

      expect(result.s3Prefix).toBe(
        `s3://legacy-sports-dev-ci-artifacts/ci-artifacts/${SHA}/${expectedSegment}/`,
      );
      expect(ListObjectsV2Command).toHaveBeenCalledWith(
        expect.objectContaining({
          Prefix: `ci-artifacts/${SHA}/${expectedSegment}/`,
        }),
      );
    },
  );

  it('returns presigned URLs for listed objects', async () => {
    mockSend.mockResolvedValue({
      Contents: [
        {
          Key: `ci-artifacts/${SHA}/playwright-coverage/fragment-1.json`,
          Size: 512,
          LastModified: new Date('2026-06-28T00:00:00.000Z'),
        },
      ],
      IsTruncated: false,
    });

    const result = await listPlaywrightS3Artifacts(SHA, 'coverage');

    expect(result.empty).toBe(false);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].presignedUrl).toBe(
      'https://s3.example.com/signed-url',
    );
  });

  it('returns empty: true when no objects are found', async () => {
    const result = await listPlaywrightS3Artifacts(SHA, 'output');

    expect(result.empty).toBe(true);
    expect(result.artifacts).toHaveLength(0);
  });
});

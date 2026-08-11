import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { githubGet } from './github-api.js';

const BUCKET =
  process.env['CI_ARTIFACTS_BUCKET'] ?? 'legacy-sports-dev-ci-artifacts';
const REGION = process.env['AWS_REGION'] ?? 'us-east-1';

/** Presigned URL expiry (1 hour). */
const PRESIGN_EXPIRY_SECONDS = 3600;

let s3: S3Client | undefined;

function getS3(): S3Client {
  if (!s3) s3 = new S3Client({ region: REGION });
  return s3;
}

interface GitHubRun {
  head_sha: string;
  head_branch: string;
  event: string;
  run_number: number;
}

/** Resolve a workflow run ID to its HEAD commit SHA. */
export async function resolveRunSha(runId: number): Promise<string> {
  const run = await githubGet<GitHubRun>(`/actions/runs/${runId}`);
  return run.head_sha;
}

export interface S3ArtifactItem {
  key: string;
  /** 1-hour presigned GET URL. */
  presignedUrl: string;
  sizeBytes: number | undefined;
  lastModified: string | undefined;
}

export interface S3ArtifactsResult {
  sha: string;
  s3Prefix: string;
  /** Direct presigned URLs for the blob zip files found under the prefix. */
  artifacts: S3ArtifactItem[];
  /** True when the prefix returned 0 objects (run artifacts may have expired — objects expire after 3 days). */
  empty: boolean;
}

/**
 * List Playwright blob artifacts for a CI run and return presigned S3 URLs.
 *
 * Artifacts live at:
 *   s3://{bucket}/ci-artifacts/{sha}/playwright-blobs/{shard-index}/report-{hash}.zip
 *
 * Objects expire after 3 days (lifecycle policy on the bucket), so older runs
 * will return empty: true.
 *
 * The Lambda's execution role must have s3:ListBucket (with prefix
 * ci-artifacts/*) and s3:GetObject on the bucket for this to work.
 */
export async function listPlaywrightS3Artifacts(
  sha: string,
): Promise<S3ArtifactsResult> {
  const client = getS3();
  const prefix = `ci-artifacts/${sha}/playwright-blobs/`;

  const objects: Array<{ Key?: string; Size?: number; LastModified?: Date }> =
    [];
  let continuationToken: string | undefined;
  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    objects.push(...(response.Contents ?? []));
    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken !== undefined);

  const artifacts = await Promise.all(
    objects.map(async (obj): Promise<S3ArtifactItem> => {
      if (!obj.Key) {
        throw new Error('S3 ListObjectsV2 returned an object with no Key');
      }
      const key = obj.Key;
      const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
      // @aws-sdk/s3-request-presigner ships its own nested copy of
      // @smithy/types, structurally identical to but nominally distinct from
      // the one @aws-sdk/client-s3 uses — a package-manager dual-package
      // hazard, not a real type mismatch. Assert through the presigner's own
      // parameter types (not `any`) to bridge the two copies.
      const presignedUrl = await getSignedUrl(
        client as unknown as Parameters<typeof getSignedUrl>[0],
        cmd as unknown as Parameters<typeof getSignedUrl>[1],
        { expiresIn: PRESIGN_EXPIRY_SECONDS },
      );
      return {
        key,
        presignedUrl,
        sizeBytes: obj.Size,
        lastModified: obj.LastModified?.toISOString(),
      };
    }),
  );

  return {
    sha,
    s3Prefix: `s3://${BUCKET}/${prefix}`,
    artifacts,
    empty: artifacts.length === 0,
  };
}

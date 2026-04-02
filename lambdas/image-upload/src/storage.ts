import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const LOGOS_BUCKET_NAME = process.env['LOGOS_BUCKET_NAME'] ?? '';
const AWS_REGION = process.env['AWS_REGION'] ?? 'us-east-1';

const s3Client = new S3Client({ region: AWS_REGION });

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

interface UploadOptions {
  imageBuffer: Buffer;
  mimeType: string;
  teamId: number;
  imageType: 'avatar' | 'banner';
}

/**
 * Upload an image to the team logos S3 bucket.
 * Returns the public HTTPS URL of the stored object.
 *
 * Objects are keyed as:
 *   teams/{teamId}/{imageType}/{uuid}.{ext}
 */
export async function uploadImageToS3({
  imageBuffer,
  mimeType,
  teamId,
  imageType,
}: UploadOptions): Promise<string> {
  if (!LOGOS_BUCKET_NAME) {
    throw new Error('LOGOS_BUCKET_NAME environment variable is not set');
  }

  const ext = MIME_TO_EXT[mimeType] ?? 'bin';
  const key = `teams/${teamId}/${imageType}/${randomUUID()}.${ext}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: LOGOS_BUCKET_NAME,
      Key: key,
      Body: imageBuffer,
      ContentType: mimeType,
      // Objects are publicly readable — enforced by bucket policy
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  // Return the public S3 URL (bucket has a public-read policy)
  return `https://${LOGOS_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;
}

import { LOGGER } from '@legacy-sports/logging';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';

const CLOUDFLARE_ACCOUNT_ID = process.env['CLOUDFLARE_ACCOUNT_ID'] ?? '';
// CLOUDFLARE_AI_API_TOKEN: used for local dev.
// CLOUDFLARE_AI_TOKEN_PATH: Secrets Manager secret name, used in production.
const CLOUDFLARE_AI_API_TOKEN_LOCAL =
  process.env['CLOUDFLARE_AI_API_TOKEN'] ?? '';
const CLOUDFLARE_AI_TOKEN_PATH = process.env['CLOUDFLARE_AI_TOKEN_PATH'] ?? '';

let cfTokenPromise: Promise<string> | null = null;

async function getCloudflareToken(): Promise<string> {
  if (CLOUDFLARE_AI_API_TOKEN_LOCAL) {
    return CLOUDFLARE_AI_API_TOKEN_LOCAL;
  }
  if (!CLOUDFLARE_AI_TOKEN_PATH) {
    throw new Error(
      'Either CLOUDFLARE_AI_API_TOKEN (local dev) or CLOUDFLARE_AI_TOKEN_PATH (production) must be set',
    );
  }
  if (!cfTokenPromise) {
    cfTokenPromise = retrieveSecretParameterValue(CLOUDFLARE_AI_TOKEN_PATH);
  }
  return cfTokenPromise;
}

/**
 * Cloudflare Workers AI model used for image classification.
 * ResNet-50 returns ImageNet class labels with confidence scores.
 */
const CF_MODEL = '@cf/microsoft/resnet-50';

/**
 * ImageNet label substrings that indicate potentially NSFW or inappropriate content.
 * ResNet-50 uses ImageNet's 1000-class taxonomy; none map directly to "NSFW",
 * but we can block images that confidently match these categories.
 *
 * This list is intentionally conservative — it blocks borderline cases to
 * prioritise safety over permissiveness.
 */
const NSFW_LABEL_PATTERNS: RegExp[] = [
  /bikini/i,
  /swimming[\s_-]?trunk/i,
  /brassiere/i,
  /maillot/i,
  /miniskirt/i,
  /stocking/i,
  /garter/i,
  /corset/i,
  /negligee/i,
];

interface CfAiClassification {
  label: string;
  score: number;
}

interface CfAiResponse {
  success: boolean;
  result: CfAiClassification[];
  errors?: { message: string }[];
}

/**
 * Classify an image using the Cloudflare Workers AI image classification API.
 * Returns `true` if the image is likely NSFW, `false` if it appears safe.
 *
 * Throws if the Cloudflare API call fails or returns an error.
 */
export async function classifyImageForNsfw(
  imageBuffer: Buffer,
): Promise<boolean> {
  if (!CLOUDFLARE_ACCOUNT_ID) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID environment variable must be set');
  }

  const apiToken = await getCloudflareToken();
  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/${CF_MODEL}`;

  // Cloudflare Workers AI accepts the image as binary form-data (preferred) or
  // as a JSON array of uint8 values. Send binary form-data to avoid the large
  // JSON expansion that Array.from(imageBuffer) would produce for multi-MB files.
  // Convert Buffer → Uint8Array so Blob accepts it without TypeScript errors
  // (Buffer.buffer is typed as ArrayBufferLike which includes SharedArrayBuffer).
  const imageBytes = new Uint8Array(imageBuffer);
  const form = new FormData();
  form.append(
    'image',
    new Blob([imageBytes], { type: 'application/octet-stream' }),
    'image',
  );

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `Cloudflare AI API returned ${response.status}: ${errorText}`,
    );
  }

  const data = (await response.json()) as CfAiResponse;

  if (!data.success) {
    const errMsg =
      data.errors?.map((e) => e.message).join(', ') ?? 'Unknown error';
    throw new Error(`Cloudflare AI classification failed: ${errMsg}`);
  }

  // Log top labels for observability
  const top5 = (data.result ?? []).slice(0, 5);
  LOGGER.debug('image-upload: Cloudflare classification results', {
    top5: top5.map((r) => `${r.label}(${r.score.toFixed(3)})`),
  });

  // Check top classifications against NSFW patterns
  const NSFW_CONFIDENCE_THRESHOLD = 0.35;
  for (const { label, score } of top5) {
    if (score < NSFW_CONFIDENCE_THRESHOLD) continue;
    for (const pattern of NSFW_LABEL_PATTERNS) {
      if (pattern.test(label)) {
        LOGGER.warn('image-upload: NSFW label detected', { label, score });
        return true;
      }
    }
  }

  return false;
}

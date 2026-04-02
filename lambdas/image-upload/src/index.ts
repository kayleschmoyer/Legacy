import type {
  APIGatewayEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils/node';
import { and, eq } from 'drizzle-orm';
import { PublicSchema, runWithPublicClient } from '@legacy-sports/db-client';
import { classifyImageForNsfw } from './cloudflare';
import { uploadImageToS3 } from './storage';
import { validateImageBuffer } from './validate';
import { getAuthenticatedUserId } from './auth';

function getAllowedOrigins(): Set<string> {
  const raw =
    process.env['CORS_ALLOWED_ORIGINS'] ?? 'https://legacy-fantasy.com';
  return new Set(
    raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );
}

function getCorsHeaders(event: APIGatewayEvent): Record<string, string> {
  const origin = event.headers?.['Origin'] ?? event.headers?.['origin'];
  const allowed = getAllowedOrigins();
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers':
      'Content-Type,Authorization,X-Api-Key,X-Amz-Security-Token,X-CSRF-Token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'X-Content-Type-Options': 'nosniff',
  };
  if (origin && allowed.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return headers;
}

function jsonResponse(
  statusCode: number,
  body: unknown,
  corsHeaders: Record<string, string>,
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
    body: JSON.stringify(body),
  };
}

/**
 * Verify that the given user is authorized to upload images for the given team.
 * The user must be a league member whose assigned teamId matches AND whose
 * permission level is general_manager, assistant_manager, or commissioner.
 *
 * Throws if the user is not authorized.
 */
async function verifyTeamOwnership(
  userId: number,
  teamId: number,
): Promise<void> {
  const rows = await runWithPublicClient(getDbOptions(), async (db) => {
    return db
      .select({
        teamId: PublicSchema.leagueMembers.teamId,
        permissionLevel: PublicSchema.leagueMembers.permissionLevel,
      })
      .from(PublicSchema.leagueMembers)
      .innerJoin(
        PublicSchema.teams,
        eq(PublicSchema.teams.id, PublicSchema.leagueMembers.teamId),
      )
      .where(
        and(
          eq(PublicSchema.leagueMembers.userId, userId),
          eq(PublicSchema.leagueMembers.teamId, teamId),
        ),
      )
      .limit(1);
  });

  if (rows.length === 0) {
    throw new Error('Forbidden: user is not a member of the team');
  }

  const { permissionLevel } = rows[0];
  const isCommissioner = permissionLevel === 'commissioner';
  const isGM =
    permissionLevel === 'general_manager' ||
    permissionLevel === 'assistant_manager';

  if (!isCommissioner && !isGM) {
    throw new Error(
      'Forbidden: only the team General Manager can upload team images',
    );
  }
}

/**
 * Image Upload Lambda
 *
 * POST /images/upload
 * Query params: teamId (int), imageType ("avatar" | "banner")
 * Body: raw image bytes
 * Content-Type: image/png | image/jpeg | image/webp
 * Auth: ls_jwt cookie or Authorization: Bearer <token>
 *
 * Returns: { url: string } — the public S3 URL of the uploaded image.
 * The caller should pass this URL to the updateTeamBranding GraphQL mutation.
 */
export const handler = async (
  event: APIGatewayEvent,
  _context: Context,
): Promise<APIGatewayProxyResult> => {
  const corsHeaders = getCorsHeaders(event);

  // OPTIONS pre-flight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // Health check
  if (
    event.path === '/images/health' ||
    event.path === '/images/upload/health'
  ) {
    return jsonResponse(200, { status: 'ok' }, corsHeaders);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' }, corsHeaders);
  }

  // ── Authentication ──────────────────────────────────────────────────────────
  let userId: number;
  try {
    userId = await getAuthenticatedUserId(event);
  } catch (err: unknown) {
    LOGGER.warn('image-upload: auth failed', { error: String(err) });
    return jsonResponse(401, { error: 'Unauthorized' }, corsHeaders);
  }

  // ── Query parameter validation ──────────────────────────────────────────────
  const qs = event.queryStringParameters ?? {};
  const teamIdStr = qs['teamId'];
  const imageType = qs['imageType'];

  if (!teamIdStr || !/^\d+$/.test(teamIdStr)) {
    return jsonResponse(
      400,
      {
        error:
          'teamId query parameter is required and must be a positive integer',
      },
      corsHeaders,
    );
  }
  if (imageType !== 'avatar' && imageType !== 'banner') {
    return jsonResponse(
      400,
      { error: 'imageType query parameter must be "avatar" or "banner"' },
      corsHeaders,
    );
  }

  const teamId = parseInt(teamIdStr, 10);

  // ── Team ownership authorization ────────────────────────────────────────────
  try {
    await verifyTeamOwnership(userId, teamId);
  } catch (err: unknown) {
    LOGGER.warn('image-upload: team ownership check failed', {
      error: String(err),
      userId,
      teamId,
    });
    return jsonResponse(403, { error: 'Forbidden' }, corsHeaders);
  }

  // ── Content-Type validation ─────────────────────────────────────────────────
  const contentType =
    event.headers['Content-Type'] ?? event.headers['content-type'] ?? '';
  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  const mimeType = contentType.split(';')[0]?.trim().toLowerCase() ?? '';

  if (!ALLOWED_TYPES.includes(mimeType)) {
    return jsonResponse(
      415,
      {
        error: `Unsupported media type. Allowed: ${ALLOWED_TYPES.join(', ')}`,
      },
      corsHeaders,
    );
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  if (!event.body) {
    return jsonResponse(400, { error: 'Request body is empty' }, corsHeaders);
  }

  const imageBuffer = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64')
    : Buffer.from(event.body, 'binary');

  // ── File size + format validation ───────────────────────────────────────────
  try {
    validateImageBuffer(imageBuffer, mimeType);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid image';
    // Map validation errors to appropriate HTTP status codes:
    //   413 Payload Too Large  — image exceeds the size limit
    //   400 Bad Request        — empty file or magic-byte signature mismatch
    const isTooBig = err instanceof Error && err.message.includes('too large');
    const statusCode = isTooBig ? 413 : 400;
    return jsonResponse(statusCode, { error: msg }, corsHeaders);
  }

  // ── Cloudflare NSFW classification ─────────────────────────────────────────
  try {
    const isNsfw = await classifyImageForNsfw(imageBuffer);
    if (isNsfw) {
      LOGGER.warn('image-upload: NSFW content detected', {
        userId,
        teamId,
        imageType,
        mimeType,
      });
      return jsonResponse(
        422,
        {
          error:
            'This image was flagged as inappropriate and cannot be uploaded. Please choose a different image.',
        },
        corsHeaders,
      );
    }
  } catch (err: unknown) {
    // If Cloudflare classification fails, we reject the upload to be safe
    LOGGER.error('image-upload: Cloudflare classification error', {
      error: String(err),
      userId,
      teamId,
    });
    return jsonResponse(
      502,
      {
        error:
          'Image moderation service is temporarily unavailable. Please try again later.',
      },
      corsHeaders,
    );
  }

  // ── Upload to S3 ────────────────────────────────────────────────────────────
  let imageUrl: string;
  try {
    imageUrl = await uploadImageToS3({
      imageBuffer,
      mimeType,
      teamId,
      imageType,
    });
  } catch (err: unknown) {
    LOGGER.error('image-upload: S3 upload failed', {
      error: String(err),
      userId,
      teamId,
    });
    return jsonResponse(
      500,
      {
        error: 'Failed to store image. Please try again later.',
      },
      corsHeaders,
    );
  }

  LOGGER.info('image-upload: upload successful', {
    userId,
    teamId,
    imageType,
    mimeType,
    imageUrl,
  });

  return jsonResponse(200, { url: imageUrl }, corsHeaders);
};

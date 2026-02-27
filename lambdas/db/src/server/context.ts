import { verify } from 'jsonwebtoken';
import { LOGGER } from '@legacy-sports/logging';
import { retrieveSecretParameterValue } from '@legacy-sports/aws-utils';

export interface ImpersonatedBy {
  id: number;
  email?: string;
  username: string;
}

export interface JWTPayload {
  id: number | string;
  email?: string;
  username: string;
  accessLevel?: string;
  isAdmin?: boolean;
  impersonatedBy?: ImpersonatedBy;
  [key: string]: unknown; // For other JWT standard fields
}

export interface User {
  id: number;
  email?: string;
  username: string;
  isAdmin: boolean;
  /** Present when this session was created by an admin via impersonation. */
  impersonatedBy?: ImpersonatedBy;
}

const JWT_SECRET_NAME = process.env['JWT_SECRET_NAME'] || '';
const JWT_SECRET_LOCAL = process.env['JWT_SECRET'] || '';
let jwtSecretPromise: Promise<string> | null = null;

export async function getJwtSecret(): Promise<string> {
  // Local dev shortcut: JWT_SECRET env var skips Secrets Manager lookup
  if (JWT_SECRET_LOCAL) {
    return JWT_SECRET_LOCAL;
  }

  if (!JWT_SECRET_NAME) {
    throw new Error('JWT_SECRET_NAME is not set');
  }

  if (!jwtSecretPromise) {
    jwtSecretPromise = retrieveSecretParameterValue(JWT_SECRET_NAME);
  }

  return jwtSecretPromise;
}

export function parseUserFromJwtPayload(payload: JWTPayload): User {
  const idRaw = payload.id;
  const id = typeof idRaw === 'string' ? Number(idRaw) : idRaw;
  if (!Number.isFinite(id)) {
    throw new Error('Invalid JWT payload: id must be a number');
  }

  if (typeof payload.username !== 'string' || payload.username.length === 0) {
    throw new Error('Invalid JWT payload: username is required');
  }

  const accessLevel =
    typeof payload.accessLevel === 'string' ? payload.accessLevel : undefined;

  let impersonatedBy: ImpersonatedBy | undefined;
  if (
    payload.impersonatedBy &&
    typeof payload.impersonatedBy === 'object' &&
    typeof payload.impersonatedBy.id === 'number' &&
    typeof payload.impersonatedBy.username === 'string'
  ) {
    const raw = payload.impersonatedBy;
    impersonatedBy = {
      id: raw.id,
      username: raw.username,
      email: typeof raw.email === 'string' ? raw.email : undefined,
    };
  }

  return {
    id,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    username: payload.username,
    isAdmin: payload.isAdmin === true || accessLevel === 'admin',
    impersonatedBy,
  };
}

/**
 * Extract and verify the user from the Authorization header.
 * Returns null if no valid token is present.
 */
export async function extractUserFromEvent(
  authorization: string | undefined,
): Promise<User | null> {
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return null;
  }

  try {
    const token = authorization.substring(7); // Remove 'Bearer ' prefix
    const jwtSecret = await getJwtSecret();
    const decoded = verify(token, jwtSecret, {
      algorithms: ['HS256'],
    }) as JWTPayload;
    return parseUserFromJwtPayload(decoded);
  } catch (error) {
    LOGGER.warn('Failed to decode JWT', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

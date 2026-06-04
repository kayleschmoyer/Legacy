// Mobile app type definitions to improve type safety
// These provide better types than the current incomplete GraphQL schema

import {
  LeaguePositionFragment,
  TeamMemberFragment,
} from '../../api/db/graphql.generated';

// Event handler types for form events
export type FormEventHandler = (event: {
  preventDefault(): void;
  stopPropagation(): void;
}) => void;

// Type guards for safe property access
export function hasValidId<T extends { id?: number | null }>(
  obj: T,
): obj is T & { id: number } {
  return typeof obj.id === 'number' && obj.id > 0;
}

export function hasValidPlayerId(obj: {
  playerId?: number | null;
}): obj is { playerId: number } {
  return typeof obj.playerId === 'number' && obj.playerId > 0;
}

export function hasValidPositionType(obj: {
  positionType?: string | null;
}): obj is { positionType: string } {
  return typeof obj.positionType === 'string' && obj.positionType.length > 0;
}

// Extended types with proper null safety
export interface SafeTeamMember extends TeamMemberFragment {
  id: number;
  playerId: number;
}

export interface SafeLeaguePosition extends LeaguePositionFragment {
  id: number;
  positionType: string;
}

// Utility functions for safe data access
export function toSafeTeamMember(
  member: TeamMemberFragment | null,
): SafeTeamMember | null {
  if (!member || !hasValidId(member) || !hasValidPlayerId(member)) {
    return null;
  }
  return {
    ...member,
    id: member.id,
    playerId: member.playerId,
  } as SafeTeamMember;
}

export function toSafeLeaguePosition(
  position: LeaguePositionFragment | null,
): SafeLeaguePosition | null {
  if (
    !position ||
    typeof position.id !== 'number' ||
    position.id <= 0 ||
    typeof position.positionType !== 'string' ||
    position.positionType.length === 0
  ) {
    return null;
  }
  return {
    ...position,
    id: position.id,
    positionType: position.positionType,
  } as SafeLeaguePosition;
}

// Error handling utility
export function getErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

// Connection edge handling for GraphQL connections
export function extractNodes<T>(
  connection: { edges?: Array<{ node?: T | null }> | null } | null,
): T[] {
  if (!connection?.edges) return [];
  return connection.edges
    .map((edge) => edge?.node)
    .filter((node): node is T => node != null);
}

// Normalizes numeric identifiers that may be delivered as strings or nulls
export function normalizeNumericIdentifier(
  value: number | string | null | undefined,
): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

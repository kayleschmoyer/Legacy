/**
 * The universal join-by-code flow (LS-10078): preview whatever an invite code
 * points at, then join it with the right mutation. The code alone cannot say
 * whether it is a mock draft's or a league's — `resolveInviteCode` does.
 *
 * Navigation stays with the caller (`onJoined`): web and native route
 * differently, and both already know their own draft and league paths.
 */

import { useCallback, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { LOGGER } from '@legacy-sports/logging';
import {
  JoinLeagueByCode as JOIN_LEAGUE_BY_CODE,
  JoinMockDraft as JOIN_MOCK_DRAFT,
  type JoinLeagueByCodeMutation,
  type JoinLeagueByCodeMutationVariables,
  type JoinMockDraftMutation,
  type JoinMockDraftMutationVariables,
  ResolveInviteCode as RESOLVE_INVITE_CODE,
  type ResolveInviteCodeQuery,
  type ResolveInviteCodeQueryVariables,
} from '@legacy-sports/graphql';
import { hasErrorCode } from '../../../utils/graphql-errors';

/** Where a successful join (or an accepted invite) lands. */
export type JoinedTarget =
  | { kind: 'mock'; draftId: number; sport: string }
  | { kind: 'league'; leagueId: number; sport: string };

export type InvitePreviewData = NonNullable<
  ResolveInviteCodeQuery['resolveInviteCode']
>;

/** Invite codes are 8 characters from an unambiguous alphabet. */
export const INVITE_CODE_PATTERN = /^[A-Z0-9]{8}$/;

export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export interface UseInviteCodeParams {
  code: string;
  onJoined: (target: JoinedTarget) => void;
}

export function useInviteCode({ code, onJoined }: UseInviteCodeParams) {
  const normalized = normalizeInviteCode(code);
  const valid = INVITE_CODE_PATTERN.test(normalized);

  const { data, loading, error } = useQuery<
    ResolveInviteCodeQuery,
    ResolveInviteCodeQueryVariables
  >(RESOLVE_INVITE_CODE, {
    variables: { code: normalized },
    skip: !valid,
    fetchPolicy: 'network-only',
  });

  const [joinLeague] = useMutation<
    JoinLeagueByCodeMutation,
    JoinLeagueByCodeMutationVariables
  >(JOIN_LEAGUE_BY_CODE);
  const [joinMock] = useMutation<
    JoinMockDraftMutation,
    JoinMockDraftMutationVariables
  >(JOIN_MOCK_DRAFT);

  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const preview = data?.resolveInviteCode ?? null;

  const join = useCallback(
    async (teamName: string) => {
      if (!preview) return;
      setJoining(true);
      setJoinError(null);
      try {
        if (preview.__typename === 'MockDraftInvitePreview') {
          const result = await joinMock({
            variables: { inviteCode: normalized, teamName },
          });
          const joined = result.data?.joinMockDraft;
          if (joined?.draftId != null) {
            onJoined({
              kind: 'mock',
              draftId: joined.draftId,
              sport: joined.sport ?? preview.sport ?? 'baseball',
            });
          }
        } else if (preview.__typename === 'LeagueInvitePreview') {
          const result = await joinLeague({
            variables: { inviteCode: normalized, teamName },
          });
          const leagueId =
            result.data?.joinLeagueByCode?.leagueId ?? preview.leagueId;
          if (leagueId != null) {
            onJoined({
              kind: 'league',
              leagueId,
              sport: preview.sport ?? 'baseball',
            });
          }
        }
      } catch (err) {
        setJoinError(
          err instanceof Error ? err.message : 'Could not join. Try again.',
        );
        LOGGER.warn('[useInviteCode] join failed', { err });
      } finally {
        setJoining(false);
      }
    },
    [joinLeague, joinMock, normalized, onJoined, preview],
  );

  return {
    code: normalized,
    valid,
    preview,
    loading,
    /** The viewer must sign in before the preview can load. */
    needsSignIn: hasErrorCode(error, 'UNAUTHENTICATED'),
    error: error ?? null,
    notFound: valid && !loading && !error && data !== undefined && !preview,
    join,
    joining,
    joinError,
  };
}

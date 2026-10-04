import { useEffect, useRef, useState } from 'react';
import type { InviteCodeLeague, InviteCodeValidation } from './joinLeagueTypes';

/** Invite codes are exactly 8 uppercase alphanumerics. */
export const INVITE_CODE_PATTERN = /^[A-Z0-9]{8}$/;

/** Debounce before a complete code is sent for validation. */
export const INVITE_CODE_DEBOUNCE_MS = 400;

/**
 * Debounced invite-code validation with a stale-response guard (LS-8812).
 *
 * Lifted verbatim in behaviour from the pre-redesign mobile Join screen so the
 * redesign cannot regress it: validation fires only once the code matches
 * {@link INVITE_CODE_PATTERN}, is debounced by
 * {@link INVITE_CODE_DEBOUNCE_MS}, and a monotonic version ref discards any
 * response that lands after a newer request was issued (the user kept typing).
 *
 * @param code    The raw code from the input; trimmed and upper-cased here.
 * @param validate Resolves the league behind a code, or null when unknown.
 */
export function useInviteCodeValidation(
  code: string,
  validate: (code: string) => Promise<InviteCodeLeague | null>,
): InviteCodeValidation {
  const versionRef = useRef(0);
  const [league, setLeague] = useState<InviteCodeLeague | null>(null);
  const [checking, setChecking] = useState(false);

  const normalized = code.trim().toUpperCase();
  const complete = INVITE_CODE_PATTERN.test(normalized);

  useEffect(() => {
    if (!complete) {
      // Invalidate any in-flight request: the code is no longer complete, so a
      // late response must not repopulate the card.
      versionRef.current += 1;
      setLeague(null);
      setChecking(false);
      return;
    }

    const version = ++versionRef.current;
    setChecking(true);

    const timer = setTimeout(() => {
      void validate(normalized)
        .then((result) => {
          if (versionRef.current !== version) return;
          setLeague(result);
          setChecking(false);
        })
        .catch(() => {
          if (versionRef.current !== version) return;
          // A failed lookup is indistinguishable from an unknown code as far
          // as the card is concerned — both render the invalid state.
          setLeague(null);
          setChecking(false);
        });
    }, INVITE_CODE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [normalized, complete, validate]);

  if (!complete) return { status: 'idle', league: null };
  if (checking) return { status: 'checking', league: null };
  if (!league) return { status: 'invalid', league: null };
  // "Already a member" outranks "full": it is the more actionable message, and
  // a user already in a full league needs the GO TO LEAGUE affordance.
  if (league.isAlreadyMember) return { status: 'alreadyMember', league };
  if (league.isFull) return { status: 'full', league };
  return { status: 'valid', league };
}

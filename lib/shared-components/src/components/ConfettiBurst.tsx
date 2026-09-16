/**
 * ConfettiBurst (web) — capability shim of ./ConfettiBurst.native.tsx:
 * react-native's Animated API (used natively) has no web build in this
 * codebase, so this renders the same burst with a scoped CSS keyframe
 * instead — fall ~660px with 720° rotation over 1.6–2.6s, staggered up to
 * ~0.55s.
 *
 * The geometry originated in the Draft Room v2 my-pick splash (LS-9402) and
 * was generalised here by LS-10111 for the matchup scoreboard's touchdown
 * celebration. LS-10205 has since replaced the draft splash with an
 * announcement card, so the scoreboard is currently the only caller — the
 * component stays palette-agnostic for the next one.
 */
import React, { useMemo } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

const PIECE_COUNT = 26;
const MIN_DURATION_S = 1.6;
const MAX_DURATION_S = 2.6;
const MAX_STAGGER_S = 0.55;

interface ConfettiPiece {
  key: string;
  left: string;
  color: string;
  delaySeconds: number;
  durationSeconds: number;
}

/** Deterministic-per-burst confetti geometry; regenerated on each seed change. */
function useConfettiGeometry(
  seed: number,
  colors: readonly string[],
): ConfettiPiece[] {
  return useMemo(
    () =>
      Array.from(
        { length: PIECE_COUNT },
        (_, i): ConfettiPiece => ({
          key: `${seed}-${i}`,
          left: `${Math.round(Math.random() * 100)}%`,
          color: colors[i % colors.length],
          delaySeconds: Math.random() * MAX_STAGGER_S,
          durationSeconds:
            MIN_DURATION_S + Math.random() * (MAX_DURATION_S - MIN_DURATION_S),
        }),
      ),
    [seed, colors],
  );
}

const KEYFRAMES = `
@keyframes lsConfettiBurstFall {
  0%   { opacity: 0.95; transform: translateY(0) rotate(0deg); }
  75%  { opacity: 0.95; }
  100% { opacity: 0.3; transform: translateY(660px) rotate(720deg); }
}
`;

export interface ConfettiBurstProps {
  /** Regenerates the burst's geometry — pass a value that changes per celebration. */
  seed: number;
  /** Palette the pieces cycle through. */
  colors: readonly string[];
  /** Test hook for platform E2E/unit assertions. */
  testID?: string;
  /** Stacking order above the celebrating surface. */
  zIndex?: number;
}

export function ConfettiBurst({
  seed,
  colors,
  testID = 'confetti-burst',
  zIndex = 60,
}: ConfettiBurstProps): React.JSX.Element | null {
  const pieces = useConfettiGeometry(seed, colors);
  const reducedMotion = useReducedMotion();

  // A full-screen fall of 26 rotating pieces is exactly the motion
  // `prefers-reduced-motion` asks us to suppress, and it is purely
  // decorative — so it is dropped outright rather than shortened.
  if (reducedMotion) return null;

  return (
    <div
      data-testid={testID}
      // Decorative only: the celebrating surface announces the event itself.
      aria-hidden
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <style>{KEYFRAMES}</style>
      {pieces.map((piece) => (
        <div
          key={piece.key}
          style={{
            position: 'absolute',
            left: piece.left,
            top: -14,
            width: 7,
            height: 11,
            borderRadius: 2,
            backgroundColor: piece.color,
            animation: `lsConfettiBurstFall ${piece.durationSeconds}s ease-in ${piece.delaySeconds}s 1 both`,
          }}
        />
      ))}
    </div>
  );
}

export default ConfettiBurst;

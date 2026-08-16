/**
 * DraftPickSplashConfetti (web) — capability shim of
 * ./DraftPickSplashConfetti.native.tsx: react-native's Animated API (used
 * natively) has no web build in this codebase, so this renders the same
 * ~26-piece brand-palette burst with a scoped CSS keyframe instead — fall
 * ~660px with 720° rotation over 1.6–2.6s, staggered up to ~0.55s, per the
 * Draft Room v2 README "My-pick splash (overlay)" (LS-9402).
 */
import React, { useMemo } from 'react';
import { SPLASH_CONFETTI_COLORS } from './constants';

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

/** Deterministic-per-burst confetti geometry; regenerated on each pick. */
function useConfettiGeometry(seed: number): ConfettiPiece[] {
  return useMemo(
    () =>
      Array.from(
        { length: PIECE_COUNT },
        (_, i): ConfettiPiece => ({
          key: `${seed}-${i}`,
          left: `${Math.round(Math.random() * 100)}%`,
          color: SPLASH_CONFETTI_COLORS[i % SPLASH_CONFETTI_COLORS.length],
          delaySeconds: Math.random() * MAX_STAGGER_S,
          durationSeconds:
            MIN_DURATION_S + Math.random() * (MAX_DURATION_S - MIN_DURATION_S),
        }),
      ),
    [seed],
  );
}

const KEYFRAMES = `
@keyframes lsSplashConfettiFall {
  0%   { opacity: 0.95; transform: translateY(0) rotate(0deg); }
  75%  { opacity: 0.95; }
  100% { opacity: 0.3; transform: translateY(660px) rotate(720deg); }
}
`;

export interface DraftPickSplashConfettiProps {
  /** Regenerates the burst's geometry — pass the overall pick number so each new my-pick gets a fresh scatter. */
  seed: number;
}

export function DraftPickSplashConfetti({
  seed,
}: DraftPickSplashConfettiProps): React.JSX.Element {
  const pieces = useConfettiGeometry(seed);

  return (
    <div
      data-testid="draft-pick-splash-confetti"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
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
            animation: `lsSplashConfettiFall ${piece.durationSeconds}s ease-in ${piece.delaySeconds}s 1 both`,
          }}
        />
      ))}
    </div>
  );
}

export default DraftPickSplashConfetti;

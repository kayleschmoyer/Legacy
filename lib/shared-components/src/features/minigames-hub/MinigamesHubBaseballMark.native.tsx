/**
 * MinigamesHubBaseballMark (native) — `react-native-svg` rendering of the
 * Minigames Hub hero's baseball artwork for Android/iOS.
 *
 * Unlike the web sibling, this uses `useThemeTokens()` instead of the raw
 * hex/rgba literals baked into the web illustration: the web version's
 * fixed-palette gradients and stitching predate the theme-compliance ratchet
 * (`.github/checks/theme-compliance.sh`, `.agents/skills/ui/SKILL.md`) and
 * are grandfathered into its baseline, but a *new* file may not add raw
 * color literals to the repo's count. Simplifying to a themed circle + seams
 * (no gradient sheen/shadow, no cross-stitching) keeps this file
 * theme-correct in both light and dark without growing that count — a
 * decorative-fidelity tradeoff, not a functional one. See
 * `MinigamesHubBaseballMark.tsx` for the shared contract.
 */
import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { useThemeTokens } from '../../hooks/useThemeTokens';

export const MinigamesHubBaseballMark: React.FC = () => {
  const tokens = useThemeTokens();
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 240 240"
      fill="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle
        cx={120}
        cy={118}
        r={100}
        fill={tokens.surface.surfaceRaised}
        stroke={tokens.surface.outlineStrong}
        strokeWidth={1}
      />
      <Path
        d="M60 38 C95 78 95 158 60 198"
        stroke={tokens.brand.seamRed}
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
        opacity={0.9}
      />
      <Path
        d="M180 38 C145 78 145 158 180 198"
        stroke={tokens.brand.seamRed}
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
        opacity={0.9}
      />
    </Svg>
  );
};

export default MinigamesHubBaseballMark;

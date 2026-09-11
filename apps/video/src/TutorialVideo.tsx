import { AbsoluteFill, Sequence } from 'remotion';
import { loadLocalFonts } from './fonts';
import { BG_DARK, SCENES } from './theme';

import { TitleScene } from './scenes/TitleScene';
import { DifferentiatorScene } from './scenes/DifferentiatorScene';
import { CrossEraScene } from './scenes/CrossEraScene';
import { CreateLeagueScene } from './scenes/CreateLeagueScene';
import { DraftScene } from './scenes/DraftScene';
import { MatchupScene } from './scenes/MatchupScene';
import { CTAScene } from './scenes/CTAScene';

// Load fonts at module level so Remotion handles delayRender/continueRender
loadLocalFonts();

export const TutorialVideo = () => {
  return (
    <AbsoluteFill style={{ background: BG_DARK }}>
      <Sequence
        from={SCENES.TITLE.from}
        durationInFrames={SCENES.TITLE.duration}
      >
        <TitleScene />
      </Sequence>

      <Sequence
        from={SCENES.DIFFERENTIATOR.from}
        durationInFrames={SCENES.DIFFERENTIATOR.duration}
      >
        <DifferentiatorScene />
      </Sequence>

      <Sequence
        from={SCENES.CROSS_ERA.from}
        durationInFrames={SCENES.CROSS_ERA.duration}
      >
        <CrossEraScene />
      </Sequence>

      <Sequence
        from={SCENES.CREATE_LEAGUE.from}
        durationInFrames={SCENES.CREATE_LEAGUE.duration}
      >
        <CreateLeagueScene />
      </Sequence>

      <Sequence
        from={SCENES.DRAFT.from}
        durationInFrames={SCENES.DRAFT.duration}
      >
        <DraftScene />
      </Sequence>

      <Sequence
        from={SCENES.MATCHUP.from}
        durationInFrames={SCENES.MATCHUP.duration}
      >
        <MatchupScene />
      </Sequence>

      <Sequence from={SCENES.CTA.from} durationInFrames={SCENES.CTA.duration}>
        <CTAScene />
      </Sequence>
    </AbsoluteFill>
  );
};

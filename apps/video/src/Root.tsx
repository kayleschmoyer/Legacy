import { Composition } from 'remotion';
import { TutorialVideo } from './TutorialVideo';
import {
  VIDEO_FPS,
  VIDEO_DURATION_FRAMES,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
} from './theme';

export const Root = () => {
  return (
    <Composition
      id="TutorialVideo"
      component={TutorialVideo}
      durationInFrames={VIDEO_DURATION_FRAMES}
      fps={VIDEO_FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
    />
  );
};

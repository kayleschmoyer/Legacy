import React from 'react';
import { render } from '@testing-library/react';
import { TouchdownHorn } from './TouchdownHorn';

const mockUseReducedMotion = jest.fn(() => false);
jest.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));

describe('TouchdownHorn (web)', () => {
  const play = jest.fn(() => Promise.resolve());
  const audioInstance = { play, currentTime: 5 };
  const AudioMock = jest.fn(() => audioInstance);
  const originalAudio = window.Audio;

  beforeEach(() => {
    play.mockClear();
    play.mockImplementation(() => Promise.resolve());
    AudioMock.mockClear();
    audioInstance.currentTime = 5;
    mockUseReducedMotion.mockReturnValue(false);
    Object.defineProperty(window, 'Audio', {
      configurable: true,
      writable: true,
      value: AudioMock,
    });
  });

  afterAll(() => {
    Object.defineProperty(window, 'Audio', {
      configurable: true,
      writable: true,
      value: originalAudio,
    });
  });

  it('never plays on mount, even when enabled', () => {
    render(<TouchdownHorn seed={0} enabled />);
    expect(play).not.toHaveBeenCalled();
    expect(AudioMock).not.toHaveBeenCalled();
  });

  it('plays from the start when the seed increases and audio is enabled', () => {
    const { rerender } = render(<TouchdownHorn seed={0} enabled />);
    rerender(<TouchdownHorn seed={1} enabled />);
    expect(play).toHaveBeenCalledTimes(1);
    expect(audioInstance.currentTime).toBe(0);
  });

  it('plays again for each new touchdown, reusing one audio element', () => {
    const { rerender } = render(<TouchdownHorn seed={0} enabled />);
    rerender(<TouchdownHorn seed={1} enabled />);
    rerender(<TouchdownHorn seed={2} enabled />);
    expect(play).toHaveBeenCalledTimes(2);
    expect(AudioMock).toHaveBeenCalledTimes(1);
  });

  it('does not play when audio is not enabled', () => {
    const { rerender } = render(<TouchdownHorn seed={0} enabled={false} />);
    rerender(<TouchdownHorn seed={1} enabled={false} />);
    expect(play).not.toHaveBeenCalled();
  });

  it('does not replay a missed touchdown when audio is enabled afterwards', () => {
    const { rerender } = render(<TouchdownHorn seed={0} enabled={false} />);
    rerender(<TouchdownHorn seed={1} enabled={false} />);
    rerender(<TouchdownHorn seed={1} enabled />);
    expect(play).not.toHaveBeenCalled();
  });

  it('does not play when the user prefers reduced motion', () => {
    mockUseReducedMotion.mockReturnValue(true);
    const { rerender } = render(<TouchdownHorn seed={0} enabled />);
    rerender(<TouchdownHorn seed={1} enabled />);
    expect(play).not.toHaveBeenCalled();
  });

  it('swallows a blocked-autoplay rejection', async () => {
    play.mockImplementation(() => Promise.reject(new Error('NotAllowedError')));
    const { rerender } = render(<TouchdownHorn seed={0} enabled />);
    rerender(<TouchdownHorn seed={1} enabled />);
    await Promise.resolve();
    expect(play).toHaveBeenCalledTimes(1);
  });
});

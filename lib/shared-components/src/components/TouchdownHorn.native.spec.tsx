import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { TouchdownHorn } from './TouchdownHorn.native';

const mockPlayer = {
  play: jest.fn(),
  seekTo: jest.fn(() => Promise.resolve()),
};
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
}));

const mockUseReducedMotion = jest.fn(() => false);
jest.mock('../hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));

describe('TouchdownHorn (native)', () => {
  beforeEach(() => {
    mockPlayer.play.mockClear();
    mockPlayer.seekTo.mockClear();
    mockUseReducedMotion.mockReturnValue(false);
  });

  it('never plays on mount, even when enabled', () => {
    render(<TouchdownHorn seed={0} enabled />);
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('rewinds and plays when the seed increases and audio is enabled', async () => {
    const { rerender } = render(<TouchdownHorn seed={0} enabled />);
    rerender(<TouchdownHorn seed={1} enabled />);
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalledTimes(1));
  });

  it('does not play when audio is not enabled', () => {
    const { rerender } = render(<TouchdownHorn seed={0} enabled={false} />);
    rerender(<TouchdownHorn seed={1} enabled={false} />);
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('does not replay a missed touchdown when audio is enabled afterwards', () => {
    const { rerender } = render(<TouchdownHorn seed={0} enabled={false} />);
    rerender(<TouchdownHorn seed={1} enabled={false} />);
    rerender(<TouchdownHorn seed={1} enabled />);
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });

  it('does not play when the user prefers reduced motion', () => {
    mockUseReducedMotion.mockReturnValue(true);
    const { rerender } = render(<TouchdownHorn seed={0} enabled />);
    rerender(<TouchdownHorn seed={1} enabled />);
    expect(mockPlayer.play).not.toHaveBeenCalled();
  });
});

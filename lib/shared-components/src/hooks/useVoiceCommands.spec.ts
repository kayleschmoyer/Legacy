import { act, renderHook } from '@testing-library/react';
import { useVoiceCommands } from './useVoiceCommands';

// ─── Mock SpeechRecognition ──────────────────────────────────────────────────

interface MockRecognition {
  continuous: boolean;
  interimResults: boolean;
  onstart: () => void;
  onend: () => void;
  onresult: (event: {
    results: {
      [index: number]: {
        [index: number]: { transcript: string };
        length: number;
      };
      length: number;
    };
  }) => void;
  onerror: (event: { error: string }) => void;
  start: jest.Mock;
  stop: jest.Mock;
}

let mockRecognition: MockRecognition;

function createMockSpeechRecognition() {
  return class MockSR {
    continuous = false;
    interimResults = false;
    onstart: () => void = jest.fn();
    onend: () => void = jest.fn();
    onresult: (event: unknown) => void = jest.fn();
    onerror: (event: unknown) => void = jest.fn();
    start = jest.fn();
    stop = jest.fn();

    constructor() {
      mockRecognition = this as unknown as MockRecognition;
    }
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useVoiceCommands', () => {
  const originalSR = window.SpeechRecognition;
  const originalWebkitSR = window.webkitSpeechRecognition;

  beforeEach(() => {
    // Clear both globals so each test controls availability explicitly
    delete (window as Record<string, unknown>).SpeechRecognition;
    delete (window as Record<string, unknown>).webkitSpeechRecognition;
  });

  afterEach(() => {
    if (originalSR) {
      (window as Record<string, unknown>).SpeechRecognition = originalSR;
    }
    if (originalWebkitSR) {
      (window as Record<string, unknown>).webkitSpeechRecognition =
        originalWebkitSR;
    }
  });

  // ── Disabled ────────────────────────────────────────────────────────────

  it('returns idle state when disabled', () => {
    const { result } = renderHook(() => useVoiceCommands(false));

    expect(result.current.voiceCommand).toBe('');
    expect(result.current.isListening).toBe(false);
    expect(result.current.error).toBeNull();
  });

  // ── Unavailable API ─────────────────────────────────────────────────────

  it('returns speech-recognition-unavailable error when enabled but API missing', () => {
    const { result } = renderHook(() => useVoiceCommands(true));

    expect(result.current.error).toBe('speech-recognition-unavailable');
    expect(result.current.isListening).toBe(false);
  });

  // ── Start / stop lifecycle ──────────────────────────────────────────────

  it('starts recognition when enabled and SpeechRecognition is available', () => {
    (window as Record<string, unknown>).SpeechRecognition =
      createMockSpeechRecognition();

    renderHook(() => useVoiceCommands(true));

    expect(mockRecognition.continuous).toBe(true);
    expect(mockRecognition.interimResults).toBe(false);
    expect(mockRecognition.start).toHaveBeenCalled();
  });

  it('uses webkitSpeechRecognition fallback', () => {
    (window as Record<string, unknown>).webkitSpeechRecognition =
      createMockSpeechRecognition();

    renderHook(() => useVoiceCommands(true));

    expect(mockRecognition.start).toHaveBeenCalled();
  });

  it('sets isListening=true on recognition start event', () => {
    (window as Record<string, unknown>).SpeechRecognition =
      createMockSpeechRecognition();

    const { result } = renderHook(() => useVoiceCommands(true));

    act(() => mockRecognition.onstart());

    expect(result.current.isListening).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('sets isListening=false on recognition end event', () => {
    (window as Record<string, unknown>).SpeechRecognition =
      createMockSpeechRecognition();

    const { result } = renderHook(() => useVoiceCommands(true));

    act(() => mockRecognition.onstart());
    expect(result.current.isListening).toBe(true);

    act(() => mockRecognition.onend());
    expect(result.current.isListening).toBe(false);
  });

  it('stops recognition on unmount', () => {
    (window as Record<string, unknown>).SpeechRecognition =
      createMockSpeechRecognition();

    const { unmount } = renderHook(() => useVoiceCommands(true));

    expect(mockRecognition.stop).not.toHaveBeenCalled();
    unmount();
    expect(mockRecognition.stop).toHaveBeenCalledTimes(1);
  });

  it('stops recognition when toggled from enabled to disabled', () => {
    (window as Record<string, unknown>).SpeechRecognition =
      createMockSpeechRecognition();

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useVoiceCommands(enabled),
      { initialProps: { enabled: true } },
    );

    const first = mockRecognition;
    rerender({ enabled: false });
    expect(first.stop).toHaveBeenCalled();
  });

  // ── Results ─────────────────────────────────────────────────────────────

  it('sets voiceCommand from recognition result', () => {
    (window as Record<string, unknown>).SpeechRecognition =
      createMockSpeechRecognition();

    const { result } = renderHook(() => useVoiceCommands(true));

    act(() => {
      mockRecognition.onresult({
        results: {
          0: { 0: { transcript: 'draft player one' }, length: 1 },
          length: 1,
        },
      });
    });

    expect(result.current.voiceCommand).toBe('draft player one');
  });

  it('uses the latest result when multiple results arrive', () => {
    (window as Record<string, unknown>).SpeechRecognition =
      createMockSpeechRecognition();

    const { result } = renderHook(() => useVoiceCommands(true));

    act(() => {
      mockRecognition.onresult({
        results: {
          0: { 0: { transcript: 'first command' }, length: 1 },
          1: { 0: { transcript: 'second command' }, length: 1 },
          length: 2,
        },
      });
    });

    expect(result.current.voiceCommand).toBe('second command');
  });

  // ── Error handling ──────────────────────────────────────────────────────

  it('maps "not-allowed" to permission-denied error', () => {
    (window as Record<string, unknown>).SpeechRecognition =
      createMockSpeechRecognition();

    const { result } = renderHook(() => useVoiceCommands(true));

    act(() => mockRecognition.onerror({ error: 'not-allowed' }));

    expect(result.current.error).toBe('permission-denied');
    expect(result.current.isListening).toBe(false);
  });

  it('maps other errors to recognition-error', () => {
    (window as Record<string, unknown>).SpeechRecognition =
      createMockSpeechRecognition();

    const { result } = renderHook(() => useVoiceCommands(true));

    act(() => mockRecognition.onerror({ error: 'network' }));

    expect(result.current.error).toBe('recognition-error');
    expect(result.current.isListening).toBe(false);
  });

  it('clears error and listening state when disabled after an error', () => {
    (window as Record<string, unknown>).SpeechRecognition =
      createMockSpeechRecognition();

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useVoiceCommands(enabled),
      { initialProps: { enabled: true } },
    );

    act(() => mockRecognition.onerror({ error: 'network' }));
    expect(result.current.error).toBe('recognition-error');

    rerender({ enabled: false });

    expect(result.current.error).toBeNull();
    expect(result.current.isListening).toBe(false);
  });
});

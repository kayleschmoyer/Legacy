import type { VoiceCommandError } from './useVoiceCommands';

export type { VoiceCommandError };

/**
 * Native stub for useVoiceCommands.
 * window.webkitSpeechRecognition is a web-only API with no React Native equivalent.
 * Returns error only when enabled so callers see no error while voice commands are disabled.
 */
export const useVoiceCommands = (
  enabled: boolean,
): {
  voiceCommand: string;
  isListening: boolean;
  error: VoiceCommandError | null;
} => {
  return {
    voiceCommand: '',
    isListening: false,
    error: enabled ? 'speech-recognition-unavailable' : null,
  };
};

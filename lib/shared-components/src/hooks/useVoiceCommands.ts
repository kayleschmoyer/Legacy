import { useEffect, useState } from 'react';

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}

interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
  length: number;
}

interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  onstart: () => void;
  onend: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognition;
    SpeechRecognition?: new () => SpeechRecognition;
  }
}

const getSpeechRecognition = (): (new () => SpeechRecognition) | undefined => {
  if (typeof window === 'undefined') return undefined;
  return (
    window.SpeechRecognition ?? window.webkitSpeechRecognition ?? undefined
  );
};

export type VoiceCommandError =
  | 'speech-recognition-unavailable'
  | 'permission-denied'
  | 'recognition-error';

export const useVoiceCommands = (enabled: boolean) => {
  const [voiceCommand, setVoiceCommand] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<VoiceCommandError | null>(null);

  const SR = getSpeechRecognition();

  useEffect(() => {
    if (!enabled) {
      setError(null);
      setIsListening(false);
      return;
    }

    if (!SR) {
      setError('speech-recognition-unavailable');
      return;
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      setVoiceCommand(transcript);
    };
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsListening(false);
      setError(
        event.error === 'not-allowed'
          ? 'permission-denied'
          : 'recognition-error',
      );
    };

    recognition.start();

    return () => recognition.stop();
  }, [enabled, SR]);

  return { voiceCommand, isListening, error };
};

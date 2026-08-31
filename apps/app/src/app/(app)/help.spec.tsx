import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import HelpScreen from './help';

// expo-constants pulls in native expo-modules-core which is unavailable in Jest.
jest.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
  expoConfig: { extra: {} },
}));

// Mock @legacy-sports/app-config so tests can flip jiraProxyUrl between
// configured / unconfigured without depending on the module-load-time
// singleton (which reads process.env once).
const mockConfig: Record<string, string | undefined> = {};
jest.mock('@legacy-sports/app-config/native', () => ({
  get config() {
    return mockConfig;
  },
}));

function setJiraProxyUrl(value: string | undefined): void {
  mockConfig.jiraProxyUrl = value;
}

const mockModalVisible = jest.fn();
const mockReportKind = jest.fn();
jest.mock('../../features/bug-report/BugReportModal', () => ({
  __esModule: true,
  default: ({
    visible,
    onClose,
    kind,
  }: {
    visible: boolean;
    onClose: () => void;
    kind?: string;
  }) => {
    const { Text } =
      jest.requireActual<typeof import('react-native')>('react-native');
    mockModalVisible(visible);
    if (visible) mockReportKind(kind);
    return visible ? <Text onPress={onClose}>feedback-modal-open</Text> : null;
  },
}));

jest.mock('tamagui', () => {
  const {
    View,
    Text: RNText,
    ScrollView,
  } = jest.requireActual<typeof import('react-native')>('react-native');
  const passthrough =
    (Tag: React.ComponentType<{ children?: React.ReactNode }>) =>
    ({
      children,
      ...rest
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => <Tag {...rest}>{children}</Tag>;
  return {
    createTokens: (tokens: unknown) => tokens,
    H1: passthrough(RNText),
    H3: passthrough(RNText),
    Text: passthrough(RNText),
    Separator: () => <View />,
    XStack: passthrough(View),
    YStack: passthrough(View),
    ScrollView: ({ children }: { children: React.ReactNode }) => (
      <ScrollView>{children}</ScrollView>
    ),
  };
});

describe('HelpScreen — Report a Bug action routing (LS-8842)', () => {
  let openUrlSpy: jest.SpiedFunction<typeof Linking.openURL>;

  beforeEach(() => {
    jest.clearAllMocks();
    setJiraProxyUrl(undefined);
    openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens the in-app bug report modal, not the browser, when jiraProxyUrl is configured', () => {
    setJiraProxyUrl('https://api.example.com/jira');
    render(<HelpScreen />);

    fireEvent.press(screen.getByText('Report a Bug'));

    expect(mockModalVisible).toHaveBeenLastCalledWith(true);
    expect(mockReportKind).toHaveBeenLastCalledWith('bug');
    expect(screen.getByText('feedback-modal-open')).toBeTruthy();
    expect(openUrlSpy).not.toHaveBeenCalled();
  });

  it('falls back to the Discord support contact — not the GitHub issue tracker — when jiraProxyUrl is unconfigured', () => {
    setJiraProxyUrl(undefined);
    render(<HelpScreen />);

    fireEvent.press(screen.getByText('Report a Bug'));

    expect(mockModalVisible).not.toHaveBeenCalledWith(true);
    expect(openUrlSpy).toHaveBeenCalledTimes(1);
    const [openedUrl] = openUrlSpy.mock.calls[0];
    expect(openedUrl).toContain('discord.gg');
    expect(openedUrl).not.toContain('github.com');
  });

  it('still opens the URL directly for non-action contact entries (Community Discussions, Discord)', () => {
    setJiraProxyUrl('https://api.example.com/jira');
    render(<HelpScreen />);

    fireEvent.press(screen.getByText('Community Discussions'));
    expect(openUrlSpy).toHaveBeenCalledWith(
      expect.stringContaining('github.com/bkrupa/legacy-sports/discussions'),
    );

    fireEvent.press(screen.getByText('Join our Discord'));
    expect(openUrlSpy).toHaveBeenCalledWith(
      expect.stringContaining('discord.gg'),
    );

    expect(mockModalVisible).not.toHaveBeenCalledWith(true);
  });
});

describe('HelpScreen — Suggest a Feature action routing (LS-9247)', () => {
  let openUrlSpy: jest.SpiedFunction<typeof Linking.openURL>;

  beforeEach(() => {
    jest.clearAllMocks();
    setJiraProxyUrl(undefined);
    openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens the in-app feature request modal instead of an external link when jiraProxyUrl is configured', () => {
    setJiraProxyUrl('https://api.example.com/jira');
    render(<HelpScreen />);

    fireEvent.press(screen.getByText('Suggest a Feature'));

    expect(mockModalVisible).toHaveBeenLastCalledWith(true);
    expect(mockReportKind).toHaveBeenLastCalledWith('feature');
    expect(screen.getByText('feedback-modal-open')).toBeTruthy();
    expect(openUrlSpy).not.toHaveBeenCalled();
  });

  it('falls back to the GitHub feature request template when jiraProxyUrl is unconfigured', () => {
    setJiraProxyUrl(undefined);
    render(<HelpScreen />);

    fireEvent.press(screen.getByText('Suggest a Feature'));

    expect(mockModalVisible).not.toHaveBeenCalledWith(true);
    expect(openUrlSpy).toHaveBeenCalledTimes(1);
    const [openedUrl] = openUrlSpy.mock.calls[0];
    expect(openedUrl).toContain('github.com');
    expect(openedUrl).toContain('feature_request');
  });

  it('routes bug and feature entries to their own modal kinds independently', () => {
    setJiraProxyUrl('https://api.example.com/jira');
    render(<HelpScreen />);

    fireEvent.press(screen.getByText('Suggest a Feature'));
    expect(mockReportKind).toHaveBeenLastCalledWith('feature');

    fireEvent.press(screen.getByText('feedback-modal-open'));

    fireEvent.press(screen.getByText('Report a Bug'));
    expect(mockReportKind).toHaveBeenLastCalledWith('bug');
  });
});

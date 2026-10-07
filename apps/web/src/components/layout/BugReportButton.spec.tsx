/**
 * LS-10700: the Suggest a Feature dialog reused the bug dialog's hard-coded
 * "What happened?" label, and that visible label wasn't tied to the textarea
 * (which carried a separate aria-label), so the screen-reader name didn't
 * match either (LS-10741). The label now comes from the per-kind copy and is
 * associated with the textarea via `htmlFor`/`id`.
 *
 * `tamagui`'s real `Dialog` needs a `TamaguiProvider` this project's Jest
 * setup doesn't configure (see BaseModal.spec.tsx), so Tamagui primitives are
 * swapped for plain DOM equivalents.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

import { BugReportButton } from './BugReportButton';

type Children = { children?: React.ReactNode };

jest.mock('../../config/environment', () => ({
  env: {
    jiraProxyUrl: 'https://jira-proxy.test',
    appVersion: 'test',
    commitSha: 'test',
  },
}));

jest.mock('../../lib/csrf', () => ({
  CSRF_HEADER: 'x-csrf-token',
  getCsrfToken: () => 'token',
}));

jest.mock('../../lib/consoleErrorCapture', () => ({
  getCapturedErrors: () => [],
}));

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({ user: null }),
}));

jest.mock('@legacy-sports/shared-components/ui', () => {
  const PassThrough = ({ children }: Children) => <div>{children}</div>;
  // Honors `tag`/`htmlFor` the way Tamagui's web text components do, so a
  // `tag="label"` Paragraph renders a real <label for>.
  const Paragraph = ({
    children,
    tag,
    htmlFor,
  }: Children & { tag?: string; htmlFor?: string }) =>
    tag === 'label' ? (
      <label htmlFor={htmlFor}>{children}</label>
    ) : (
      <p>{children}</p>
    );
  const Button = ({
    children,
    onPress,
  }: Children & { onPress?: () => void }) => (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  );
  return { Button, Paragraph, XStack: PassThrough, YStack: PassThrough };
});

jest.mock('tamagui', () => {
  const PassThrough = ({ children }: Children) => <div>{children}</div>;
  const DialogRoot = ({ children, open }: Children & { open?: boolean }) =>
    open ? <div>{children}</div> : null;
  const Dialog = Object.assign(DialogRoot, {
    Trigger: PassThrough,
    Portal: PassThrough,
    Overlay: () => null,
    Content: PassThrough,
    Close: PassThrough,
  });
  return { Dialog, ScrollView: PassThrough };
});

const renderDialog = (kind: 'bug' | 'feature') =>
  render(
    <BugReportButton
      kind={kind}
      controlledOpen
      onDialogOpenChange={jest.fn()}
    />,
  );

describe('BugReportButton description label (LS-10700)', () => {
  it('labels the bug dialog textarea "What happened?"', () => {
    renderDialog('bug');

    const textarea = screen.getByLabelText('What happened?');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveAttribute(
      'placeholder',
      expect.stringMatching(/^Describe the issue/),
    );
  });

  it('labels the feature dialog textarea with feature-oriented copy', () => {
    renderDialog('feature');

    const textarea = screen.getByLabelText("What's your idea?");
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveAttribute(
      'placeholder',
      expect.stringMatching(/^Describe the feature/),
    );
    expect(screen.queryByText('What happened?')).not.toBeInTheDocument();
  });

  it('uses the visible label as the accessible name in both modes', () => {
    const { unmount } = renderDialog('bug');
    expect(
      screen.getByRole('textbox', { name: 'What happened?' }),
    ).toBeInTheDocument();
    unmount();

    renderDialog('feature');
    expect(
      screen.getByRole('textbox', { name: "What's your idea?" }),
    ).toBeInTheDocument();
  });
});

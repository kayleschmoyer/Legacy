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
 *
 * LS-10720: a failed submit rendered the raw fetch error ("Failed to fetch")
 * or an "HTTP 500" string; failures now map to friendly retry copy.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { BugReportButton } from './BugReportButton';

type Children = { children?: React.ReactNode };
type AriaLabel = { 'aria-label'?: string };

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
    id,
  }: Children & { tag?: string; htmlFor?: string; id?: string }) =>
    tag === 'label' ? (
      <label htmlFor={htmlFor} id={id}>
        {children}
      </label>
    ) : (
      <p id={id}>{children}</p>
    );
  const Button = ({
    children,
    onPress,
    'aria-label': ariaLabel,
  }: Children & { onPress?: () => void; 'aria-label'?: string }) => (
    <button type="button" onClick={onPress} aria-label={ariaLabel}>
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
    // Mirrors Tamagui's DialogPortalFrame: the portal frame, not
    // Dialog.Content, is the element exposed as the modal dialog (LS-10709).
    Portal: ({
      children,
      ...aria
    }: Children & {
      'aria-labelledby'?: string;
      'aria-describedby'?: string;
    }) => (
      <div role="dialog" aria-modal="true" {...aria}>
        {children}
      </div>
    ),
    Overlay: () => null,
    Content: PassThrough,
    // Tamagui's Dialog.Close injects accessibilityLabel="Dialog Close" into
    // its asChild child unless the child sets its own aria-label.
    Close: ({ children }: { children: React.ReactElement<AriaLabel> }) =>
      jest.requireActual<typeof React>('react').cloneElement(children, {
        'aria-label': children.props['aria-label'] ?? 'Dialog Close',
      }),
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

describe('BugReportButton dialog accessible names (LS-10709)', () => {
  it.each([
    ['bug', 'Report a Bug'],
    ['feature', 'Suggest a Feature'],
  ] as const)('names the %s dialog "%s"', (kind, title) => {
    renderDialog(kind);

    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
  });

  it('names the footer Cancel button "Cancel", not "Dialog Close"', () => {
    renderDialog('bug');

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Dialog Close' }),
    ).not.toBeInTheDocument();
  });
});

describe('BugReportButton submit failures (LS-10720)', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  const fillAndSubmit = () => {
    renderDialog('bug');
    // Under SEARCH_MIN_LENGTH, so no duplicate-search request fires.
    fireEvent.change(screen.getByLabelText('What happened?'), {
      target: { value: 'Broken' },
    });
    fireEvent.change(screen.getByLabelText('Add screenshot or video'), {
      target: {
        files: [new File(['png'], 'shot.png', { type: 'image/png' })],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Report' }));
  };

  it('shows friendly offline copy instead of "Failed to fetch"', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    fillAndSubmit();

    expect(
      await screen.findByText(/You appear to be offline/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('What happened?')).toHaveValue('Broken');
    expect(
      screen.getByRole('button', { name: 'Remove shot.png' }),
    ).toBeInTheDocument();
  });

  it('shows a generic retry message on a 5xx and keeps text and attachments', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Failed to create bug report' }),
    });

    fillAndSubmit();

    expect(
      await screen.findByText(
        /We couldn't send your report. Please try again./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Failed to create bug report|HTTP 500/),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('What happened?')).toHaveValue('Broken');
    expect(
      screen.getByRole('button', { name: 'Remove shot.png' }),
    ).toBeInTheDocument();
  });

  it("surfaces the proxy's 400 validation message", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Description is too long' }),
    });

    fillAndSubmit();

    expect(
      await screen.findByText(/Description is too long/),
    ).toBeInTheDocument();
  });
});

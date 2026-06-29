import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LOGGER } from '@legacy-sports/logging';
import { ResetPasswordPage } from './ResetPasswordPage';

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));

jest.mock('../../config/environment', () => ({
  env: { baseUrl: '/', oauthProxyUrl: 'http://localhost:5001' },
}));

const renderPage = (search = '') =>
  render(
    <MemoryRouter initialEntries={[`/reset-password${search}`]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    </MemoryRouter>,
  );

const submitForm = (password: string, confirm: string) => {
  fireEvent.change(screen.getByLabelText(/^new password$/i), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText(/confirm new password/i), {
    target: { value: confirm },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: /update password/i }).closest('form')!,
  );
};

describe('ResetPasswordPage', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(LOGGER, 'error').mockImplementation(() => undefined);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    errorSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('shows invalid-link state when no token is present', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /invalid link/i }),
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('renders the password form when a token is present', () => {
    renderPage('?token=abc123');
    expect(
      screen.getByRole('heading', { name: /choose a new password/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
  });

  it('validates minimum password length', () => {
    renderPage('?token=abc123');
    submitForm('short', 'short');
    expect(
      screen.getByText('Password must be at least 12 characters.'),
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('validates passwords match', () => {
    renderPage('?token=abc123');
    submitForm('longpassword123', 'differentpassword123');
    expect(screen.getByText(/do not match/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows success state after a successful reset', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });
    renderPage('?token=abc123');
    submitForm('newpassword123', 'newpassword123');

    await waitFor(() => {
      expect(
        screen.getByText(/password has been updated/i),
      ).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:5001/reset-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          token: 'abc123',
          password: 'newpassword123',
          confirmPassword: 'newpassword123',
        }),
      }),
    );
  });

  it('shows server error message on failed reset', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Token expired' }),
    });
    renderPage('?token=expired');
    submitForm('newpassword123', 'newpassword123');

    await waitFor(() => {
      expect(screen.getByText(/token expired/i)).toBeInTheDocument();
    });
    expect(errorSpy).toHaveBeenCalled();
  });
});

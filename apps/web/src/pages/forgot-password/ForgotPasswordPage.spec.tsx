import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LOGGER } from '@legacy-sports/logging';
import { ForgotPasswordPage } from './ForgotPasswordPage';

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));

jest.mock('../../config/environment', () => ({
  env: { baseUrl: '/', oauthProxyUrl: 'http://localhost:5001' },
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );

const submitForm = (email: string) => {
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: email },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: /send reset link/i }).closest('form')!,
  );
};

describe('ForgotPasswordPage', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(LOGGER, 'error').mockImplementation(() => undefined);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    errorSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('renders the email form', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /forgot/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /send reset link/i }),
    ).toBeInTheDocument();
  });

  it('shows an error when submitting with only whitespace', () => {
    renderPage();
    // Enter whitespace so HTML required constraint passes but our trim check fires
    submitForm('   ');
    expect(screen.getByText(/please enter your email/i)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('shows success message after a successful submission', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });
    renderPage();
    submitForm('user@example.com');
    await waitFor(() => {
      expect(screen.getByText(/if an account exists/i)).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:5001/forgot-password',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows a generic error when the request fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });
    renderPage();
    submitForm('user@example.com');
    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    });
    expect(errorSpy).toHaveBeenCalled();
  });
});

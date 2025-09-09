import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { LoginWrapper } from '../LoginWrapper';

describe('LoginWrapper', () => {
  const mockOnLogin = jest.fn();
  const mockOnRegister = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with default props', () => {
    const { getByText, getByPlaceholderText } = render(<LoginWrapper />);

    // Check that essential elements are present
    expect(getByText('Login')).toBeTruthy();
    expect(getByPlaceholderText('Email')).toBeTruthy();
    expect(getByPlaceholderText('Password')).toBeTruthy();
    expect(getByText('Login')).toBeTruthy(); // Login button
  });

  it('renders correctly with custom props', () => {
    const { getByText, getByPlaceholderText } = render(
      <LoginWrapper
        title="Custom Login"
        emailPlaceholder="Enter Email"
        passwordPlaceholder="Enter Password"
        loginButtonText="Sign In"
        registerLinkText="New user? Create account"
      />
    );

    // Check that custom props are applied
    expect(getByText('Custom Login')).toBeTruthy();
    expect(getByPlaceholderText('Enter Email')).toBeTruthy();
    expect(getByPlaceholderText('Enter Password')).toBeTruthy();
    expect(getByText('Sign In')).toBeTruthy();
    expect(getByText('Register here')).toBeTruthy(); // Check for the nested text instead
  });

  it('displays input fields and button', () => {
    const { getByPlaceholderText, getByText } = render(<LoginWrapper />);

    expect(getByPlaceholderText('Email')).toBeTruthy();
    expect(getByPlaceholderText('Password')).toBeTruthy();
    expect(getByText('Login')).toBeTruthy();
  });

  it('calls onLogin when login button is pressed with valid inputs', async () => {
    const { getByPlaceholderText, getByText } = render(
      <LoginWrapper onLogin={mockOnLogin} />
    );

    const emailInput = getByPlaceholderText('Email');
    const passwordInput = getByPlaceholderText('Password');
    const loginButton = getByText('Login');

    fireEvent.changeText(emailInput, 'test@example.com');
    fireEvent.changeText(passwordInput, 'password123');
    fireEvent.press(loginButton);

    await waitFor(() => {
      expect(mockOnLogin).toHaveBeenCalledWith(
        'test@example.com',
        'password123'
      );
    });
  });

  it('shows error when login attempted with empty fields', async () => {
    const { getByText, queryByText } = render(
      <LoginWrapper onLogin={mockOnLogin} />
    );

    const loginButton = getByText('Login');
    fireEvent.press(loginButton);

    await waitFor(() => {
      expect(queryByText('Please enter both email and password.')).toBeTruthy();
    });

    expect(mockOnLogin).not.toHaveBeenCalled();
  });

  it('calls onRegister when register link is pressed', () => {
    const { getByText } = render(<LoginWrapper onRegister={mockOnRegister} />);

    const registerLink = getByText('Register here');
    fireEvent.press(registerLink);

    expect(mockOnRegister).toHaveBeenCalled();
  });

  it('shows loading state correctly', () => {
    const { getByText, queryByText } = render(
      <LoginWrapper isLoading={true} />
    );

    // Should show loading indicator and disable inputs
    expect(getByText('Welcome to Legacy Sports!')).toBeTruthy(); // Title should still be there
    // Button shows loading indicator instead of text when isLoading=true
    expect(queryByText('Login')).toBeFalsy(); // Login button text should not be visible when loading
  });

  it('shows external error message', () => {
    const { getByText } = render(
      <LoginWrapper errorMessage="External error occurred" />
    );

    expect(getByText('External error occurred')).toBeTruthy();
  });
});

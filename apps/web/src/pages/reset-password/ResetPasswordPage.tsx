import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LOGGER } from '@legacy-sports/logging';
import { PageMeta } from '../../components/PageMeta';
import { env } from '../../config/environment';

export function ResetPasswordPage(): React.JSX.Element {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (!token) {
      setError('Reset token is missing. Please use the link from your email.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${env.oauthProxyUrl}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword: confirm }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `Request failed: ${response.status}`);
      }

      setDone(true);
    } catch (err) {
      LOGGER.error(
        'Reset-password request failed',
        err instanceof Error ? err : String(err),
      );
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: '#0A0F1A',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
  };

  const cardStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '400px',
    background: '#0D1526',
    border: '1px solid #1B3A5C',
    borderRadius: '12px',
    padding: '40px 32px',
  };

  const headingStyle: React.CSSProperties = {
    fontFamily: "'Big Shoulders Display', Impact, sans-serif",
    color: '#E8DCC8',
    fontSize: '24px',
    margin: '0 0 8px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: '#111B2F',
    border: '1px solid #1B3A5C',
    borderRadius: '6px',
    color: '#E8DCC8',
    fontSize: '15px',
    marginBottom: '16px',
    boxSizing: 'border-box',
    outline: 'none',
  };

  if (!token) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={headingStyle}>Invalid link</h1>
          <p style={{ color: '#B0B8C8', lineHeight: 1.6 }}>
            This reset link is missing a token. Please use the link from your
            email, or{' '}
            <Link to="/forgot-password" style={{ color: '#C5A55A' }}>
              request a new one
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageMeta
        title="Reset Password — Legacy Sports"
        description="Choose a new password for your Legacy Sports account."
      />

      <div style={containerStyle}>
        <div style={cardStyle}>
          <a
            href="/"
            style={{
              display: 'block',
              marginBottom: '32px',
              textAlign: 'center',
            }}
          >
            <img
              src={`${env.baseUrl}logo.png`}
              alt="Legacy Sports"
              height={40}
            />
          </a>

          <h1 style={headingStyle}>Choose a new password</h1>

          {done ? (
            <div>
              <p
                style={{
                  color: '#B0B8C8',
                  lineHeight: 1.6,
                  marginBottom: '24px',
                }}
              >
                Your password has been updated. You can now sign in with your
                new password.
              </p>
              <Link
                to="/login"
                style={{
                  display: 'block',
                  textAlign: 'center',
                  padding: '12px',
                  background: '#1B3A5C',
                  color: '#E8DCC8',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                Sign in
              </Link>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                void handleSubmit(e);
              }}
            >
              <p
                style={{
                  color: '#B0B8C8',
                  lineHeight: 1.6,
                  marginBottom: '24px',
                  marginTop: 0,
                }}
              >
                Must be at least 12 characters.
              </p>

              <label
                htmlFor="password"
                style={{
                  display: 'block',
                  color: '#9CA3AF',
                  fontSize: '13px',
                  marginBottom: '6px',
                }}
              >
                New password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 12 characters"
                required
                disabled={isSubmitting}
                style={inputStyle}
              />

              <label
                htmlFor="confirm"
                style={{
                  display: 'block',
                  color: '#9CA3AF',
                  fontSize: '13px',
                  marginBottom: '6px',
                }}
              >
                Confirm new password
              </label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat password"
                required
                disabled={isSubmitting}
                style={{ ...inputStyle, marginBottom: error ? '8px' : '20px' }}
              />

              {error && (
                <p
                  style={{
                    color: '#C41E3A',
                    fontSize: '13px',
                    marginBottom: '16px',
                    marginTop: 0,
                  }}
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: isSubmitting ? '#0F2440' : '#1B3A5C',
                  color: '#E8DCC8',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmitting ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

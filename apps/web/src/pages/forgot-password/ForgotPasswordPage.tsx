import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LOGGER } from '@legacy-sports/logging';
import { PageMeta } from '../../components/PageMeta';
import { env } from '../../config/environment';

export function ForgotPasswordPage(): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${env.oauthProxyUrl}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      setSubmitted(true);
    } catch (err) {
      LOGGER.error(
        'Forgot-password request failed',
        err instanceof Error ? err : String(err),
      );
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <PageMeta
        title="Forgot Password — Legacy Sports"
        description="Reset your Legacy Sports password."
      />

      <div
        style={{
          minHeight: '100vh',
          background: '#0A0F1A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '400px',
            background: '#0D1526',
            border: '1px solid #1B3A5C',
            borderRadius: '12px',
            padding: '40px 32px',
          }}
        >
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

          <h1
            style={{
              fontFamily: "'Big Shoulders Display', Impact, sans-serif",
              color: '#E8DCC8',
              fontSize: '24px',
              margin: '0 0 8px',
            }}
          >
            Forgot your password?
          </h1>

          {submitted ? (
            <div>
              <p
                style={{
                  color: '#B0B8C8',
                  lineHeight: 1.6,
                  marginBottom: '24px',
                }}
              >
                If an account exists for{' '}
                <strong style={{ color: '#E8DCC8' }}>{email}</strong>, you'll
                receive a password reset link shortly. Check your inbox.
              </p>
              <p style={{ color: '#6B7280', fontSize: '14px' }}>
                Already have a link?{' '}
                <Link to="/login" style={{ color: '#C5A55A' }}>
                  Sign in
                </Link>
              </p>
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
                Enter your email and we'll send you a reset link.
              </p>

              <label
                htmlFor="email"
                style={{
                  display: 'block',
                  color: '#9CA3AF',
                  fontSize: '13px',
                  marginBottom: '6px',
                }}
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: '#111B2F',
                  border: '1px solid #1B3A5C',
                  borderRadius: '6px',
                  color: '#E8DCC8',
                  fontSize: '15px',
                  marginBottom: error ? '8px' : '20px',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
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
                  marginBottom: '20px',
                }}
              >
                {isSubmitting ? 'Sending…' : 'Send reset link'}
              </button>

              <p
                style={{
                  color: '#6B7280',
                  fontSize: '13px',
                  textAlign: 'center',
                  margin: 0,
                }}
              >
                <Link to="/login" style={{ color: '#C5A55A' }}>
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

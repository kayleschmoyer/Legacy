import React from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { BrandLogo, type BrandLogoProps } from './BrandLogo';
import { render } from '../../test-utils';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockLogger = LOGGER as jest.Mocked<typeof LOGGER>;

describe('BrandLogo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the wordmark when wordmarkOnly is true', () => {
    const { getByText } = render(<BrandLogo wordmarkOnly />);
    expect(getByText('LEGACY SPORTS')).toBeTruthy();
  });

  it('renders the full lockup when src is provided', () => {
    const { getByText } = render(<BrandLogo src="/logo.png" />);
    expect(getByText('LEGACY SPORTS')).toBeTruthy();
    expect(getByText('Where history plays on.')).toBeTruthy();
  });

  it('logs an error and renders null when src is missing and wordmarkOnly is false', () => {
    // Bypass the discriminated-union compile-time guard to exercise the
    // runtime fallback. Consumers can't reach this path through the typed API,
    // but defensive logging matters for runtime config / prop-forwarding bugs.
    const { container } = render(<BrandLogo {...({} as BrandLogoProps)} />);
    expect(mockLogger.error.mock.calls).toHaveLength(1);
    const [message] = mockLogger.error.mock.calls[0] as [string];
    expect(message).toContain('`src` is required');
    expect(container.firstChild).toBeNull();
  });
});

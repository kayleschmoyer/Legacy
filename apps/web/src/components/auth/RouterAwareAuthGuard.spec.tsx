import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { RouterAwareAuthGuard } from './RouterAwareAuthGuard';

const mockGuard = jest.fn<React.ReactNode, [{ currentPath?: string | null }]>();

jest.mock('@legacy-sports/shared-components/auth', () => ({
  EnhancedAuthGuard: (props: { currentPath?: string | null }) =>
    mockGuard(props),
}));

let navigateTo: (to: string) => void = () => undefined;
function NavCapture() {
  const navigate = useNavigate();
  navigateTo = (to) => navigate(to);
  return null;
}

describe('RouterAwareAuthGuard (LS-10488)', () => {
  beforeEach(() => {
    mockGuard.mockImplementation(({ currentPath }) => (
      <div data-testid="path">{currentPath}</div>
    ));
  });

  it('re-evaluates the guard with the new path on client-side navigation from a public path', () => {
    render(
      <MemoryRouter initialEntries={['/pricing']}>
        <NavCapture />
        <RouterAwareAuthGuard basePath="/base">
          <div />
        </RouterAwareAuthGuard>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('path').textContent).toBe('/base/pricing');

    act(() => navigateTo('/profile/subscription'));
    expect(screen.getByTestId('path').textContent).toBe(
      '/base/profile/subscription',
    );
  });
});

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useBackOrHome } from './useBackOrHome';

function BackButton({ fallbackPath }: { fallbackPath?: string }) {
  const goBack = useBackOrHome(fallbackPath);
  return <button onClick={goBack}>Back</button>;
}

function CurrentPath() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function renderAt(
  initialEntries: string[],
  initialIndex: number,
  fallbackPath?: string,
) {
  return render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
      <CurrentPath />
      <Routes>
        <Route
          path="/terms"
          element={<BackButton fallbackPath={fallbackPath} />}
        />
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('useBackOrHome (LS-10768)', () => {
  it('goes to / when the page is the first history entry (fresh tab)', () => {
    renderAt(['/terms'], 0);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/);
  });

  it('goes back to the previous in-app page when there is one', () => {
    renderAt(['/leagues', '/terms'], 1);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/leagues$/);
  });

  it('honours a custom fallback path', () => {
    renderAt(['/terms'], 0, '/help');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/help$/);
  });
});

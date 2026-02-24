/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BaseballLandingPage } from '../BaseballLandingPage';

// Mock shared-components to lightweight HTML equivalents
jest.mock('@legacy-sports/shared-components', () => ({
  Button: ({ children, onPress, ...rest }: any) => (
    <button onClick={onPress} {...rest}>
      {children}
    </button>
  ),
  H1: ({ children, ...rest }: any) => <h1 {...rest}>{children}</h1>,
  H2: ({ children, ...rest }: any) => <h2 {...rest}>{children}</h2>,
  H3: ({ children, ...rest }: any) => <h3 {...rest}>{children}</h3>,
  Paragraph: ({ children, ...rest }: any) => <p {...rest}>{children}</p>,
  XStack: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
  YStack: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
  HolographicCard: ({ children, ...rest }: any) => (
    <div {...rest}>{children}</div>
  ),
  useAuth: () => ({
    isAuthenticated: true,
    user: { id: '1', username: 'testuser' },
  }),
}));

// Mock Tamagui styled components to div/input
jest.mock('tamagui', () => {
  const React = require('react');
  const filterDOMProps = (props: any) => {
    const { children, onPress, ...rest } = props || {};
    // Drop all non-standard DOM props to reduce console noise
    return { children, onClick: onPress };
  };
  const Styled = (_c: any, _s?: any) => (props: any) => (
    <div {...filterDOMProps(props)}>{props?.children}</div>
  );
  return {
    styled: Styled,
    Text: ({ children, ..._rest }: any) => <span>{children}</span>,
    Paragraph: ({ children, ..._rest }: any) => <p>{children}</p>,
    H1: ({ children, ..._rest }: any) => <h1>{children}</h1>,
    H2: ({ children, ..._rest }: any) => <h2>{children}</h2>,
    XStack: ({ children, onPress, ..._rest }: any) => (
      <div onClick={onPress}>{children}</div>
    ),
    YStack: ({ children, onPress, ..._rest }: any) => (
      <div onClick={onPress}>{children}</div>
    ),
    Input: ({ value, onChangeText, placeholder, ..._rest }: any) => (
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChangeText?.(e.target.value)}
      />
    ),
    Dialog: Object.assign(
      ({ children, open }: any) => (open ? <div>{children}</div> : null),
      {
        Portal: ({ children }: any) => <div>{children}</div>,
        Overlay: (props: any) => <div>{props?.children}</div>,
        Content: ({ children, ..._rest }: any) => (
          <div role="dialog">{children}</div>
        ),
        Title: ({ children, ..._rest }: any) => <h3>{children}</h3>,
        Description: ({ children, ..._rest }: any) => <p>{children}</p>,
        Close: ({ asChild, children, ..._rest }: any) =>
          asChild ? children : <button>Close</button>,
      },
    ),
    Separator: (_props: any) => <hr />,
  };
});

// Mock LeagueCard to a simple div for predictability
jest.mock('../LeagueCard', () => ({
  LeagueCard: ({ league }: any) => (
    <div data-testid="league-card">{league.name}</div>
  ),
}));

// Mock GraphQL generated hooks (path from src/components/baseball/__tests__ to src/api/db)
jest.mock('../../../api/db/graphql.generated', () => ({
  useGetUserLeaguesQuery: jest.fn(() => ({
    data: { userLeagues: [] },
    loading: false,
  })),
  useCreateLeagueAndTeamsMutation: jest.fn(() => [
    jest.fn(),
    { loading: false },
  ]),
  GetUserLeagues: {},
}));

describe('BaseballLandingPage', () => {
  it('shows empty state when user has no leagues', () => {
    render(
      <MemoryRouter>
        <BaseballLandingPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/No leagues yet/i)).toBeInTheDocument();
    expect(
      screen.getAllByText(/Create your first league/i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('renders leagues list and supports search', () => {
    const {
      useGetUserLeaguesQuery,
    }: any = require('../../../api/db/graphql.generated');
    useGetUserLeaguesQuery.mockReturnValue({
      data: {
        userLeagues: [
          { id: 1, name: 'Saturday Sluggers' },
          { id: 2, name: 'Sunday Stars' },
        ],
      },
      loading: false,
    });

    render(
      <MemoryRouter>
        <BaseballLandingPage />
      </MemoryRouter>,
    );

    // Both league names rendered in the list
    expect(screen.getByText('Saturday Sluggers')).toBeInTheDocument();
    expect(screen.getByText('Sunday Stars')).toBeInTheDocument();

    // Search filters list
    const search = screen.getByPlaceholderText(/Search leagues/i);
    fireEvent.change(search, { target: { value: 'Saturday' } });
    expect(screen.getByText('Saturday Sluggers')).toBeInTheDocument();
    expect(screen.queryByText('Sunday Stars')).not.toBeInTheDocument();
  });

  it('opens create league dialog when clicking Create League', () => {
    render(
      <MemoryRouter>
        <BaseballLandingPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText(/Create League/i));
    expect(screen.getByText(/Create a new league/i)).toBeInTheDocument();
  });
});

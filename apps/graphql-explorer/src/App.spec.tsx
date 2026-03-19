/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { App } from './App';

describe('GraphQL Explorer App', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the GraphQL Explorer header', () => {
    render(<App />);
    expect(screen.getByText('GraphQL Explorer')).toBeInTheDocument();
  });

  it('renders the query textarea with default query', () => {
    render(<App />);
    const textarea = screen.getByLabelText('GraphQL Query:');
    expect(textarea.value).toContain('__schema');
  });

  it('renders the variables textarea', () => {
    render(<App />);
    const textarea = screen.getByLabelText('Variables (JSON):');
    expect(textarea.value).toBe('{}');
  });

  it('renders the execute button', () => {
    render(<App />);
    expect(screen.getByText('Execute Query (Ctrl+Enter)')).toBeInTheDocument();
  });

  it('shows placeholder text when no response yet', () => {
    render(<App />);
    expect(
      screen.getByText('Execute a query to see the response here.'),
    ).toBeInTheDocument();
  });

  it('displays connected endpoint', () => {
    render(<App />);
    expect(
      screen.getByText('http://localhost:5000/graphql'),
    ).toBeInTheDocument();
  });

  it('executes query and displays response data', async () => {
    const mockResponse = {
      data: { __schema: { types: [{ name: 'Query', kind: 'OBJECT' }] } },
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: () => Promise.resolve(mockResponse),
    });

    render(<App />);

    fireEvent.click(screen.getByText('Execute Query (Ctrl+Enter)'));

    await waitFor(() => {
      expect(screen.getByText('Data:')).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:5000/graphql',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('displays fetch errors', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(
      new Error('Network failure'),
    );

    render(<App />);

    fireEvent.click(screen.getByText('Execute Query (Ctrl+Enter)'));

    await waitFor(() => {
      expect(screen.getByText('Network failure')).toBeInTheDocument();
    });
  });

  it('displays GraphQL errors from response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: () =>
        Promise.resolve({ errors: [{ message: 'Field "foo" not found' }] }),
    });

    render(<App />);

    fireEvent.click(screen.getByText('Execute Query (Ctrl+Enter)'));

    await waitFor(() => {
      expect(screen.getByText('GraphQL Errors:')).toBeInTheDocument();
    });
  });

  it('handles Ctrl+Enter keyboard shortcut', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: () => Promise.resolve({ data: {} }),
    });

    render(<App />);

    const textarea = screen.getByLabelText('GraphQL Query:');
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  it('shows loading state during query execution', async () => {
    let resolvePromise: ((value: unknown) => void) | undefined;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    (global.fetch as jest.Mock).mockReturnValueOnce(pendingPromise);

    render(<App />);

    fireEvent.click(screen.getByText('Execute Query (Ctrl+Enter)'));

    expect(screen.getByText('Executing...')).toBeInTheDocument();

    if (resolvePromise) {
      resolvePromise({
        json: () => Promise.resolve({ data: {} }),
      });
    }

    await waitFor(() => {
      expect(
        screen.getByText('Execute Query (Ctrl+Enter)'),
      ).toBeInTheDocument();
    });
  });

  it('handles invalid JSON in variables', async () => {
    render(<App />);

    const variablesInput = screen.getByLabelText('Variables (JSON):');
    fireEvent.change(variablesInput, { target: { value: 'not valid json' } });

    fireEvent.click(screen.getByText('Execute Query (Ctrl+Enter)'));

    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument();
    });
  });
});

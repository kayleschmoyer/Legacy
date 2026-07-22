/**
 * StatsGridPagination.spec.tsx — unit tests for the shared stats-grid
 * pagination block (LS-8566), extracted verbatim from the MLB batting and
 * pitching data grids' inlined renderPagination helpers.
 */
import React from 'react';
import { StatsGridPagination } from './StatsGridPagination';
import { fireEvent, render, screen } from '../../../test-utils';

const makeProps = () => ({
  currentPage: 2,
  totalPages: 5,
  totalCount: 12345,
  pageSize: 25,
  onPrev: jest.fn(),
  onNext: jest.fn(),
  onGoToPage: jest.fn(),
  onPageSizeChange: jest.fn(),
});

describe('StatsGridPagination', () => {
  test('renders the page info with formatted total count', () => {
    render(<StatsGridPagination {...makeProps()} />);

    expect(screen.getByText('Page 2 of 5')).toBeInTheDocument();
    expect(screen.getByText('(12,345 total)')).toBeInTheDocument();
  });

  test('Prev is disabled on page 1 by default', () => {
    const props = makeProps();
    render(<StatsGridPagination {...props} currentPage={1} />);

    fireEvent.click(screen.getByText('← Previous'));

    expect(props.onPrev).not.toHaveBeenCalled();
  });

  test('Prev on page 1 is enabled when hasPreviousPage=true overrides the derivation', () => {
    const props = makeProps();
    render(
      <StatsGridPagination {...props} currentPage={1} hasPreviousPage={true} />,
    );

    fireEvent.click(screen.getByText('← Previous'));

    expect(props.onPrev).toHaveBeenCalledTimes(1);
  });

  test('Next is disabled on the last page', () => {
    const props = makeProps();
    render(<StatsGridPagination {...props} currentPage={5} />);

    fireEvent.click(screen.getByText('Next →'));

    expect(props.onNext).not.toHaveBeenCalled();
  });

  test('Next fires onNext when a next page exists', () => {
    const props = makeProps();
    render(<StatsGridPagination {...props} />);

    fireEvent.click(screen.getByText('Next →'));

    expect(props.onNext).toHaveBeenCalledTimes(1);
  });

  test('quick-jump page button fires onGoToPage with the page number', () => {
    const props = makeProps();
    render(<StatsGridPagination {...props} />);

    fireEvent.click(screen.getByText('4'));

    expect(props.onGoToPage).toHaveBeenCalledTimes(1);
    expect(props.onGoToPage).toHaveBeenCalledWith(4);
  });

  test('current-page quick-jump button is disabled', () => {
    const props = makeProps();
    render(<StatsGridPagination {...props} />);

    fireEvent.click(screen.getByText('2'));

    expect(props.onGoToPage).not.toHaveBeenCalled();
  });

  test('page-size button fires onPageSizeChange with the size', () => {
    const props = makeProps();
    render(<StatsGridPagination {...props} />);

    fireEvent.click(screen.getByText('50'));

    expect(props.onPageSizeChange).toHaveBeenCalledTimes(1);
    expect(props.onPageSizeChange).toHaveBeenCalledWith(50);
  });

  test('quick-jump row is hidden when totalPages <= 1', () => {
    const props = makeProps();
    render(<StatsGridPagination {...props} currentPage={1} totalPages={1} />);

    // The main controls still render...
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    // ...but no quick-jump page button exists (page-size buttons are 10/25/50/100).
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });
});

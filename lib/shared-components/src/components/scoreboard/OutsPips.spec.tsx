import React from 'react';
import { OutsPips } from './OutsPips';
import { render } from '../../test-utils';

describe('OutsPips', () => {
  it('renders the trailing label by default', () => {
    const { getByText } = render(<OutsPips outs={1} />);
    // Singular form for 1 out
    expect(getByText('1 out')).toBeTruthy();
  });

  it('uses the plural label for 0, 2, and 3 outs', () => {
    const zero = render(<OutsPips outs={0} />);
    expect(zero.getByText('0 outs')).toBeTruthy();
    const two = render(<OutsPips outs={2} />);
    expect(two.getByText('2 outs')).toBeTruthy();
    const three = render(<OutsPips outs={3} />);
    expect(three.getByText('3 outs')).toBeTruthy();
  });

  it('hides the label when hideLabel is true', () => {
    const { queryByText } = render(<OutsPips outs={2} hideLabel />);
    expect(queryByText(/out/)).toBeNull();
  });

  it('clamps negative out counts to 0 (no pips filled)', () => {
    const { getByText } = render(<OutsPips outs={-1} />);
    // The clamped value drives both the label and the aria-label.
    expect(getByText('0 outs')).toBeTruthy();
  });

  it('clamps over-3 out counts to 3 (caps the pip fill)', () => {
    const { getByText } = render(<OutsPips outs={5} />);
    expect(getByText('3 outs')).toBeTruthy();
  });
});

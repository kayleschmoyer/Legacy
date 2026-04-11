import React from 'react';
import { Dropdown, DropdownItem } from './Dropdown';
import { render } from './test-utils';

const items: DropdownItem[] = [
  { text: 'Option 1', value: 'option1' },
  { text: 'Option 2', value: 'option2' },
];

describe('Dropdown', () => {
  it('renders placeholder text', () => {
    const { getByText } = render(
      <Dropdown
        value=""
        onChange={jest.fn()}
        items={items}
        placeholder="Pick one"
      />,
    );
    expect(getByText('Pick one')).toBeTruthy();
  });

  it('forwards aria-label to the trigger element', () => {
    const { getByRole } = render(
      <Dropdown
        value=""
        onChange={jest.fn()}
        items={items}
        aria-label="Choose a sport"
      />,
    );
    expect(getByRole('button', { name: 'Choose a sport' })).toBeTruthy();
  });

  it('does not set aria-label when prop is omitted', () => {
    const { getByRole } = render(
      <Dropdown
        value=""
        onChange={jest.fn()}
        items={items}
        placeholder="Pick one"
      />,
    );
    const trigger = getByRole('button', { name: 'Pick one' });
    expect(trigger).not.toHaveAttribute('aria-label');
  });
});

import React from 'react';
import { Form, type FormField } from './Form';
import { fireEvent, render } from '../test-utils';

describe('Form', () => {
  it('renders an input field with its current value', () => {
    const onChangeText = jest.fn();
    const fields: FormField[] = [
      {
        type: 'input',
        key: 'name',
        label: 'League Name',
        value: 'Dead Ball Dynasty',
        onChangeText,
      },
    ];
    const { getByText, getByDisplayValue } = render(<Form fields={fields} />);
    expect(getByText('League Name')).toBeTruthy();
    expect(getByDisplayValue('Dead Ball Dynasty')).toBeTruthy();
  });

  it('renders a select field', () => {
    const fields: FormField[] = [
      {
        type: 'select',
        key: 'era',
        label: 'Era',
        value: 'deadball',
        onValueChange: jest.fn(),
        options: [{ value: 'deadball', label: 'Dead Ball Era' }],
      },
    ];
    const { getByText } = render(<Form fields={fields} />);
    expect(getByText('Era')).toBeTruthy();
  });

  it('renders a toggle field and fires onValueChange', () => {
    const onValueChange = jest.fn();
    const fields: FormField[] = [
      {
        type: 'toggle',
        key: 'scoring',
        label: 'Scoring',
        value: 'h2h',
        onValueChange,
        options: [
          { value: 'h2h', label: 'Head-to-Head' },
          { value: 'roto', label: 'Rotisserie' },
        ],
      },
    ];
    const { getByText } = render(<Form fields={fields} />);
    fireEvent.click(getByText('Rotisserie'));
    expect(onValueChange).toHaveBeenCalledWith('roto');
  });

  it('does not render a submit button when onSubmit is omitted', () => {
    const { queryByText } = render(<Form fields={[]} />);
    expect(queryByText('Save')).toBeNull();
  });

  it('renders and fires the submit button when onSubmit is provided', () => {
    const onSubmit = jest.fn();
    const { getByText } = render(
      <Form fields={[]} submitLabel="Create League" onSubmit={onSubmit} />,
    );
    fireEvent.click(getByText('Create League'));
    expect(onSubmit).toHaveBeenCalled();
  });
});

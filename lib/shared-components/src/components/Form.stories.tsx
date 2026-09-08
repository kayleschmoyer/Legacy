import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import React, { useState } from 'react';
import { Form, type FormField } from './Form';

const meta: Meta<typeof Form> = {
  title: 'Components/Form',
  component: Form,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

function LeagueCreateFormDemo(): React.JSX.Element {
  const [name, setName] = useState('Dead Ball Dynasty');
  const [season, setSeason] = useState('1920 – 1930');
  const [scoring, setScoring] = useState('h2h');

  const fields: FormField[] = [
    {
      type: 'input',
      key: 'name',
      label: 'League Name',
      value: name,
      onChangeText: setName,
    },
    {
      type: 'input',
      key: 'season',
      label: 'Season',
      value: season,
      onChangeText: setSeason,
    },
    {
      type: 'toggle',
      key: 'scoring',
      label: 'Scoring',
      value: scoring,
      onValueChange: setScoring,
      options: [
        { value: 'h2h', label: 'Head-to-Head' },
        { value: 'roto', label: 'Rotisserie' },
        { value: 'points', label: 'Points' },
      ],
    },
  ];

  return <Form fields={fields} submitLabel="Create League" onSubmit={fn()} />;
}

export const LeagueCreate: Story = { render: () => <LeagueCreateFormDemo /> };

function SettingsFormDemo(): React.JSX.Element {
  const [era, setEra] = useState('deadball');
  const [visibility, setVisibility] = useState('public');

  const fields: FormField[] = [
    {
      type: 'select',
      key: 'era',
      label: 'Era',
      value: era,
      onValueChange: setEra,
      options: [
        { value: 'deadball', label: 'Dead Ball Era' },
        { value: 'liveball', label: 'Live Ball Era' },
        { value: 'modern', label: 'Modern Era' },
      ],
    },
    {
      type: 'toggle',
      key: 'visibility',
      label: 'Visibility',
      value: visibility,
      onValueChange: setVisibility,
      options: [
        { value: 'public', label: 'Public' },
        { value: 'private', label: 'Private' },
      ],
    },
  ];

  return <Form fields={fields} submitLabel="Save Settings" onSubmit={fn()} />;
}

export const Settings: Story = { render: () => <SettingsFormDemo /> };

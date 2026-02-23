import React from 'react';
import type { ApolloClient } from '@apollo/client';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LeagueScoringEditor } from '../LeagueScoringEditor';
import {
  type GetLeagueScoringProfileQuery,
  ScoringStatGroup,
  type UpdateLeagueScoringProfileMutationResult,
  useUpdateLeagueScoringProfileMutation,
} from '../../../api/db/graphql.generated';

function mockPickDomProps(
  props: Record<string, unknown>,
  allowed: readonly string[] = [],
): Record<string, unknown> {
  const allowedSet = new Set<string>([
    'className',
    'id',
    'style',
    'role',
    'title',
    'tabIndex',
    'onClick',
    'onFocus',
    'onBlur',
    'onMouseEnter',
    'onMouseLeave',
    'onKeyDown',
    'onKeyUp',
    'htmlFor',
    ...allowed,
  ]);

  const domProps: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (
      key.startsWith('data-') ||
      key.startsWith('aria-') ||
      allowedSet.has(key)
    ) {
      domProps[key] = value;
    }
  }

  return domProps;
}

jest.mock('../../../api/db/graphql.generated', () => {
  const actual = jest.requireActual<
    typeof import('../../../api/db/graphql.generated')
  >('../../../api/db/graphql.generated');
  return {
    ...actual,
    useUpdateLeagueScoringProfileMutation: jest.fn(() => [
      jest.fn(),
      { loading: false },
    ]),
  };
});

jest.mock('@tamagui/lucide-icons', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return new Proxy(
    {},
    {
      get: (_target, name) => {
        if (typeof name === 'string' && name[0] === name[0].toUpperCase()) {
          const Ic = React.forwardRef<HTMLSpanElement>((p, ref) => (
            <span ref={ref} data-icon={name} {...p} />
          ));
          Ic.displayName = name;
          return Ic;
        }
        return undefined;
      },
    },
  );
});

jest.mock('@legacy-sports/shared-components', () => {
  function Stack(allProps: Record<string, unknown>) {
    const props = { ...allProps };
    const children = props.children as React.ReactNode;
    delete props.children;
    const domProps = mockPickDomProps(props);
    return <div {...domProps}>{children}</div>;
  }

  function Button(allProps: Record<string, unknown>) {
    const props = { ...allProps };
    const children = props.children as React.ReactNode;
    const onPress =
      typeof props.onPress === 'function'
        ? (props.onPress as () => void)
        : undefined;
    const disabled = Boolean(props.disabled);

    delete props.children;
    delete props.onPress;
    delete props.disabled;

    const domProps = mockPickDomProps(props);

    return (
      <button type="button" onClick={onPress} disabled={disabled} {...domProps}>
        {children}
      </button>
    );
  }

  const Separator = () => <hr />;

  return {
    Button,
    Card: Stack,
    XStack: Stack,
    YStack: Stack,
    Separator,
  };
});

jest.mock('tamagui', () => {
  const React = jest.requireActual<typeof import('react')>('react');

  const View = (allProps: Record<string, unknown>) => {
    const props = { ...allProps };
    const children = props.children as React.ReactNode;
    delete props.children;

    const domProps = mockPickDomProps(props);
    return <div {...domProps}>{children}</div>;
  };

  const Text = (allProps: Record<string, unknown>) => {
    const props = { ...allProps };
    const children = props.children as React.ReactNode;
    delete props.children;

    const domProps = mockPickDomProps(props, ['as']);
    return <span {...domProps}>{children}</span>;
  };

  const Input = React.forwardRef<HTMLInputElement, Record<string, unknown>>(
    (allProps, forwardedRef) => {
      const props = { ...allProps };
      const onChangeText = props.onChangeText as
        | undefined
        | ((value: string) => void);
      const onChangeProp = props.onChange as
        | undefined
        | ((value: unknown) => void);
      const value = props.value as string | undefined;
      const defaultValue = props.defaultValue as string | undefined;
      const textAlign = props.textAlign as string | undefined;
      const width = props.width as number | string | undefined;
      const backgroundColor = props.backgroundColor as string | undefined;
      const borderColor = props.borderColor as string | undefined;
      const style = props.style as React.CSSProperties | undefined;

      delete props.onChangeText;
      delete props.onChange;
      delete props.value;
      delete props.defaultValue;
      delete props.textAlign;
      delete props.width;
      delete props.backgroundColor;
      delete props.borderColor;
      delete props.style;

      const inlineStyle: React.CSSProperties = {
        ...(style ?? {}),
      };

      if (textAlign) {
        inlineStyle.textAlign = textAlign as React.CSSProperties['textAlign'];
      }

      if (width !== undefined) {
        inlineStyle.width =
          typeof width === 'number' ? `${width}px` : String(width);
      }

      if (backgroundColor) {
        inlineStyle.backgroundColor = backgroundColor;
      }

      if (borderColor) {
        inlineStyle.borderColor = borderColor;
      }

      const domProps = mockPickDomProps(props, [
        'id',
        'name',
        'placeholder',
        'disabled',
        'inputMode',
        'min',
        'max',
        'step',
        'type',
      ]);

      const inputType =
        typeof domProps.type === 'string' ? domProps.type : 'text';
      delete domProps.type;

      const handleChange = (
        changeEvent: React.ChangeEvent<HTMLInputElement>,
      ) => {
        if (typeof onChangeProp === 'function') {
          onChangeProp(changeEvent);
        }

        if (typeof onChangeText === 'function') {
          onChangeText(changeEvent.target.value);
        }
      };

      const inputProps: React.InputHTMLAttributes<HTMLInputElement> = {
        ...domProps,
        onChange: handleChange,
        style: inlineStyle,
        type: inputType,
      } as React.InputHTMLAttributes<HTMLInputElement>;

      if (value !== undefined) {
        inputProps.value = value;
      } else if (defaultValue !== undefined) {
        inputProps.defaultValue = defaultValue;
      }

      return (
        <input
          ref={forwardedRef as React.Ref<HTMLInputElement>}
          {...inputProps}
        />
      );
    },
  );
  Input.displayName = 'MockedTamaguiInput';

  const AnimatePresence = (allProps: Record<string, unknown>) => {
    return (allProps.children as React.ReactNode) ?? null;
  };

  return {
    __esModule: true,
    Text,
    Input,
    AnimatePresence,
    YStack: View,
    XStack: View,
    Stack: View,
  };
});

type LeagueScoringProfile = NonNullable<
  GetLeagueScoringProfileQuery['leagueScoringProfile']
>;

function createMutationState(): UpdateLeagueScoringProfileMutationResult {
  return {
    loading: false,
    called: false,
    client: {} as ApolloClient<object>,
    reset: jest.fn(),
    data: undefined,
    error: undefined,
  };
}

describe('LeagueScoringEditor', () => {
  const baseProfile: LeagueScoringProfile = {
    __typename: 'ScoringConfig',
    profileId: 42,
    profileName: 'Custom',
    multiplierGroups: [],
    stats: [
      {
        __typename: 'ScoringRule',
        multiplier: 1,
        defaultMultiplier: 1,
        isOverride: false,
        isEnabled: true,
        definition: {
          __typename: 'ScoringStatDefinition',
          id: 10,
          statKey: 'hr',
          statGroup: ScoringStatGroup.Batting,
          displayName: 'Home Runs',
          description: 'Points per home run',
          sourceColumn: 'hr',
          defaultMultiplier: 1,
          minMultiplier: 0,
          maxMultiplier: 10,
          stepSize: 0.5,
          isRequired: true,
          enforcePositive: true,
          enforceNegative: false,
        },
      },
      {
        __typename: 'ScoringRule',
        multiplier: -1,
        defaultMultiplier: -1,
        isOverride: false,
        isEnabled: true,
        definition: {
          __typename: 'ScoringStatDefinition',
          id: 11,
          statKey: 'cs',
          statGroup: ScoringStatGroup.Batting,
          displayName: 'Caught Stealing',
          description: 'Penalty for getting caught',
          sourceColumn: 'cs',
          defaultMultiplier: -1,
          minMultiplier: -5,
          maxMultiplier: 0,
          stepSize: 0.5,
          isRequired: true,
          enforcePositive: false,
          enforceNegative: true,
        },
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('submits multiplier overrides when Save Changes is pressed', async () => {
    const refetchMock = jest.fn().mockResolvedValue(undefined);
    const mutateMock = jest.fn().mockResolvedValue(undefined);
    const mockedUpdateHook = useUpdateLeagueScoringProfileMutation as jest.Mock;
    mockedUpdateHook.mockReturnValue([mutateMock, createMutationState()]);

    render(
      <LeagueScoringEditor
        leagueId={99}
        profile={baseProfile}
        loading={false}
        error={null}
        onRefetch={refetchMock}
      />,
    );

    const homeRunsInput = screen.getByLabelText('Home Runs multiplier');
    fireEvent.change(homeRunsInput, { target: { value: '2.5' } });

    const saveButton = screen.getByRole('button', { name: /save.*change/i });
    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);

    await waitFor(() => expect(mutateMock).toHaveBeenCalled());

    expect(mutateMock).toHaveBeenCalledWith({
      variables: {
        leagueId: 99,
        updates: [
          {
            statDefinitionId: 10,
            multiplier: 2.5,
          },
        ],
      },
    });

    expect(refetchMock).toHaveBeenCalled();
  });

  it('resets overrides back to default values', () => {
    const refetchMock = jest.fn().mockResolvedValue(undefined);
    const mutateMock = jest.fn().mockResolvedValue(undefined);
    const mockedUpdateHook = useUpdateLeagueScoringProfileMutation as jest.Mock;
    mockedUpdateHook.mockReturnValue([mutateMock, createMutationState()]);

    render(
      <LeagueScoringEditor
        leagueId={1}
        profile={baseProfile}
        loading={false}
        error={null}
        onRefetch={refetchMock}
      />,
    );

    const csInput = screen.getByLabelText('Caught Stealing multiplier');
    fireEvent.change(csInput, { target: { value: '-2' } });

    const resetButton = screen.getByRole('button', {
      name: 'Reset Caught Stealing multiplier',
    });
    fireEvent.click(resetButton);

    expect((csInput as HTMLInputElement).value).toBe('-1');
  });
});

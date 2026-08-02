import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import { type RefetchFn, usePullToRefresh } from './usePullToRefresh';

function Probe({
  refetchFns,
  onRenderResult,
}: {
  refetchFns: readonly RefetchFn[];
  onRenderResult: (result: ReturnType<typeof usePullToRefresh>) => void;
}): React.JSX.Element {
  const result = usePullToRefresh(refetchFns);
  onRenderResult(result);
  return (
    <Text testID="refreshing" onPress={result.onRefresh}>
      {String(result.refreshing)}
    </Text>
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets pending microtasks (including rejection handling) drain under `act`. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function noop(): void {
  // Intentionally unused — some Probe renders don't need the hook result.
}

describe('usePullToRefresh (LS-8847)', () => {
  it('starts idle', () => {
    let latest: ReturnType<typeof usePullToRefresh> | undefined;
    render(<Probe refetchFns={[]} onRenderResult={(r) => (latest = r)} />);
    expect(latest?.refreshing).toBe(false);
  });

  it('sets refreshing true on pull and clears it once every refetch settles', async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const refetchFns: RefetchFn[] = [() => first.promise, () => second.promise];

    let latest: ReturnType<typeof usePullToRefresh> | undefined;
    const { getByTestId } = render(
      <Probe refetchFns={refetchFns} onRenderResult={(r) => (latest = r)} />,
    );

    void act(() => {
      fireEvent.press(getByTestId('refreshing'));
    });
    expect(latest?.refreshing).toBe(true);

    await act(async () => {
      first.resolve();
      second.resolve();
      await flushMicrotasks();
    });

    expect(latest?.refreshing).toBe(false);
  });

  it('calls every refetch function on pull', async () => {
    const refetchFns: RefetchFn[] = [
      jest.fn().mockResolvedValue(undefined),
      jest.fn().mockResolvedValue(undefined),
    ];

    const { getByTestId } = render(
      <Probe refetchFns={refetchFns} onRenderResult={noop} />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('refreshing'));
      await flushMicrotasks();
    });

    expect(refetchFns[0]).toHaveBeenCalledTimes(1);
    expect(refetchFns[1]).toHaveBeenCalledTimes(1);
  });

  it('clears the refreshing flag even when a refetch rejects, rather than sticking', async () => {
    const ok = deferred<void>();
    const failing = deferred<void>();
    const refetchFns: RefetchFn[] = [() => ok.promise, () => failing.promise];

    let latest: ReturnType<typeof usePullToRefresh> | undefined;
    const { getByTestId } = render(
      <Probe refetchFns={refetchFns} onRenderResult={(r) => (latest = r)} />,
    );

    void act(() => {
      fireEvent.press(getByTestId('refreshing'));
    });
    expect(latest?.refreshing).toBe(true);

    await act(async () => {
      ok.resolve();
      failing.reject(new Error('network error'));
      await flushMicrotasks();
    });

    expect(latest?.refreshing).toBe(false);
  });

  it('uses the latest refetch functions without re-subscribing onRefresh', async () => {
    const firstFns: RefetchFn[] = [jest.fn().mockResolvedValue(undefined)];
    const secondFns: RefetchFn[] = [jest.fn().mockResolvedValue(undefined)];

    let latest: ReturnType<typeof usePullToRefresh> | undefined;
    const { rerender, getByTestId } = render(
      <Probe refetchFns={firstFns} onRenderResult={(r) => (latest = r)} />,
    );
    const firstOnRefresh = latest?.onRefresh;

    rerender(
      <Probe refetchFns={secondFns} onRenderResult={(r) => (latest = r)} />,
    );
    expect(latest?.onRefresh).toBe(firstOnRefresh);

    await act(async () => {
      fireEvent.press(getByTestId('refreshing'));
      await flushMicrotasks();
    });

    expect(secondFns[0]).toHaveBeenCalledTimes(1);
    expect(firstFns[0]).not.toHaveBeenCalled();
  });

  it('exposes a ready RefreshControl element wired to refreshing/onRefresh', () => {
    let latest: ReturnType<typeof usePullToRefresh> | undefined;
    render(<Probe refetchFns={[]} onRenderResult={(r) => (latest = r)} />);

    expect(latest?.refreshControl.props.refreshing).toBe(latest?.refreshing);
    expect(latest?.refreshControl.props.onRefresh).toBe(latest?.onRefresh);
  });
});

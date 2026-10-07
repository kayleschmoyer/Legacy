import React from 'react';
import { render } from '@testing-library/react';
import { FlatList } from './ReactNativeEquivalents';

// LS-10682: the web FlatList must fire onEndReached even when the page —
// not the list container — is the scroller, via an end-of-content sentinel.

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

let observers: Array<{
  callback: ObserverCallback;
  observe: jest.Mock;
  disconnect: jest.Mock;
}> = [];
const originalIntersectionObserver = global.IntersectionObserver;

beforeEach(() => {
  observers = [];
  global.IntersectionObserver = jest.fn((callback: ObserverCallback) => {
    const observer = { callback, observe: jest.fn(), disconnect: jest.fn() };
    observers.push(observer);
    return observer;
  }) as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  global.IntersectionObserver = originalIntersectionObserver;
});

const renderItem = ({ item }: { item: string }) => <span>{item}</span>;

describe('web FlatList end sentinel (LS-10682)', () => {
  test('fires onEndReached when the end sentinel enters the viewport', () => {
    const onEndReached = jest.fn();
    render(
      <FlatList
        data={['a', 'b']}
        renderItem={renderItem}
        onEndReached={onEndReached}
      />,
    );

    const observer = observers[observers.length - 1];
    expect(observer.observe).toHaveBeenCalledTimes(1);

    observer.callback([{ isIntersecting: false }]);
    expect(onEndReached).not.toHaveBeenCalled();

    observer.callback([{ isIntersecting: true }]);
    expect(onEndReached).toHaveBeenCalledWith({ distanceFromEnd: 0 });
  });

  test('re-observes the sentinel when a new page of items lands', () => {
    const onEndReached = jest.fn();
    const { rerender } = render(
      <FlatList
        data={['a']}
        renderItem={renderItem}
        onEndReached={onEndReached}
      />,
    );
    const first = observers[observers.length - 1];

    rerender(
      <FlatList
        data={['a', 'b']}
        renderItem={renderItem}
        onEndReached={onEndReached}
      />,
    );

    expect(first.disconnect).toHaveBeenCalled();
    expect(observers[observers.length - 1]).not.toBe(first);
  });

  test('observes nothing without an onEndReached handler', () => {
    render(<FlatList data={['a']} renderItem={renderItem} />);
    expect(observers).toHaveLength(0);
  });
});

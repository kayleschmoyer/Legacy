import { renderHook } from '@testing-library/react';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';

const MESSAGE = 'Discard unsaved changes?';

function addLink(): HTMLAnchorElement {
  const link = document.createElement('a');
  link.setAttribute('href', '/leagues');
  document.body.appendChild(link);
  return link;
}

function click(el: Element): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}

describe('useUnsavedChangesGuard', () => {
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    confirmSpy = jest.spyOn(window, 'confirm');
  });

  afterEach(() => {
    confirmSpy.mockRestore();
    document.body.innerHTML = '';
  });

  it('does nothing when not dirty', () => {
    renderHook(() => useUnsavedChangesGuard(false, MESSAGE));
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    const event = click(addLink());

    expect(beforeUnload.defaultPrevented).toBe(false);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('prompts on beforeunload when dirty', () => {
    renderHook(() => useUnsavedChangesGuard(true, MESSAGE));
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);

    expect(beforeUnload.defaultPrevented).toBe(true);
  });

  it('blocks an in-app link click when the user declines', () => {
    confirmSpy.mockReturnValue(false);
    renderHook(() => useUnsavedChangesGuard(true, MESSAGE));
    const event = click(addLink());

    expect(confirmSpy).toHaveBeenCalledWith(MESSAGE);
    expect(event.defaultPrevented).toBe(true);
  });

  it('lets an in-app link click through when the user confirms', () => {
    confirmSpy.mockReturnValue(true);
    renderHook(() => useUnsavedChangesGuard(true, MESSAGE));
    const event = click(addLink());

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores hash links and clicks inside ignoreRoot', () => {
    const root = document.createElement('div');
    const inner = document.createElement('a');
    inner.setAttribute('href', '/x');
    root.appendChild(inner);
    document.body.appendChild(root);
    const hash = document.createElement('a');
    hash.setAttribute('href', '#top');
    document.body.appendChild(hash);

    renderHook(() => useUnsavedChangesGuard(true, MESSAGE, root));
    click(inner);
    click(hash);

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('removes listeners when the edit becomes clean', () => {
    const { rerender } = renderHook(
      ({ dirty }) => useUnsavedChangesGuard(dirty, MESSAGE),
      { initialProps: { dirty: true } },
    );
    rerender({ dirty: false });
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    click(addLink());

    expect(beforeUnload.defaultPrevented).toBe(false);
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

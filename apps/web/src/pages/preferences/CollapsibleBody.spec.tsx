/**
 * Regression guard for LS-7098: a collapsed section body must carry the
 * `inert` attribute so its controls leave the tab order and accessibility
 * tree. The previous `{ inert: '' }` spread was falsy under React 19's
 * boolean-attribute handling, so the attribute was never written to the DOM.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

import { CollapsibleBody } from './CollapsibleBody';

function renderBody(isCollapsed: boolean) {
  render(
    <CollapsibleBody isCollapsed={isCollapsed}>
      <button type="button">Inside</button>
    </CollapsibleBody>,
  );
  return screen
    .getByText('Inside', { selector: 'button' })
    .closest('[aria-hidden]');
}

describe('CollapsibleBody', () => {
  it('sets inert and aria-hidden when collapsed', () => {
    const wrapper = renderBody(true);
    expect(wrapper).not.toBeNull();
    expect(wrapper?.hasAttribute('inert')).toBe(true);
    expect(wrapper?.getAttribute('aria-hidden')).toBe('true');
  });

  it('omits inert when expanded', () => {
    const wrapper = renderBody(false);
    expect(wrapper).not.toBeNull();
    expect(wrapper?.hasAttribute('inert')).toBe(false);
  });
});

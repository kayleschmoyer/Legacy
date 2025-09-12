import React, { PropsWithChildren } from 'react';

export interface WebProvidersProps extends PropsWithChildren {
  /**
   * Additional providers to wrap around children
   */
  additionalProviders?: React.ComponentType<PropsWithChildren>[];
}

function WebProviders({ 
  children,
  additionalProviders = [],
 }: WebProvidersProps) {
  // Wrap with additional providers if any
  let wrappedChildren = children;

  for (const Provider of additionalProviders.reverse()) {
    wrappedChildren = <Provider>{wrappedChildren}</Provider>;
  }

  return wrappedChildren;
}


export { WebProviders };
export default WebProviders;

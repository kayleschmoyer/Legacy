import React from 'react';

export function CollapsibleBody({
  isCollapsed,
  children,
}: {
  isCollapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden={isCollapsed}
      // `inert` removes the subtree from the accessibility tree AND from
      // sequential focus navigation, so collapsed content isn't tab-stop
      // reachable for assistive tech. React 19 treats `inert` as a boolean
      // attribute, so an empty string would be falsy and never set it (LS-7098).
      inert={isCollapsed}
      style={{
        display: 'grid',
        gridTemplateRows: isCollapsed ? '0fr' : '1fr',
        transition: 'grid-template-rows 0.3s ease-out',
      }}
    >
      <div
        style={{
          overflow: 'hidden',
          minHeight: 0,
          visibility: isCollapsed ? 'hidden' : 'visible',
          pointerEvents: isCollapsed ? 'none' : 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}

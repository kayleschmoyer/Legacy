'use strict';
const fs = require('fs');

// Fix the barrel file (remove BOM if present, write clean UTF-8)
const barrelPath =
  'D:/code/legacy-sports-worktrees/LS-388-split-elite-draftboard-modules/apps/web/src/components/EliteDraftBoard.tsx';

const barrelContent = `/**
 * EliteDraftBoard - barrel re-export
 *
 * The implementation has been split into focused modules under
 * ./EliteDraftBoard/. Import from here for backwards-compatible paths.
 */
export { EliteDraftBoardScreen } from './EliteDraftBoard/index';
`;

fs.writeFileSync(barrelPath, barrelContent, { encoding: 'utf8' });
console.log('Barrel file written without BOM');

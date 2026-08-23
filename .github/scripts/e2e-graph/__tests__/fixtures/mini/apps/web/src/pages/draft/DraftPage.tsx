import { DraftWidget } from '@mini/lib';
import helper from './draft-helper';
export function DraftPage() {
  const Lazy = () => import('./draft-lazy-panel');
  return [DraftWidget, helper, Lazy];
}

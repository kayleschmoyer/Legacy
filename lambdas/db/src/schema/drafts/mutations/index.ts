/**
 * Draft mutations — barrel
 *
 * Each file registers its mutation(s) via Pothos side-effects on import.
 * Import order does not affect behaviour.
 */

import './make-draft-pick';
import './initialize-draft';
import './initialize-mock-draft';
import './update-draft-settings';
import './pause-resume-draft';
import './commissioner-pick';
import './commissioner-disable-autopick';
import './draft-order';
import './toggle-autopick';
import './undo-last-pick';

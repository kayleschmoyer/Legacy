/**
 * The shared driver-contract fixture (ADR-0016).
 *
 * A single, platform-neutral definition of the elements the {@link
 * ../app-driver-contract} cases exercise — the testIDs, roles, texts and option
 * values every {@link ../types.AppDriver} implementation must resolve. The web
 * contract renders it as static HTML (below); a native contract renders the
 * equivalent Tamagui screen with the same `testID`s (emulator-gated).
 *
 * The markup is deliberately script-free so it can be loaded straight from a
 * `data:` URL through `PlaywrightWebDriver.open()` — no web build, no dev
 * server, no auth. Element behaviours the contract relies on (an input honoring
 * Backspace, a `<select>` changing value) are native browser behaviours, not
 * scripted ones.
 */

/** Stable identifiers shared by the fixture markup and the contract cases. */
export const FIXTURE = {
  root: 'contract-root',
  rowPrefix: 'contract-row-',
  rows: ['contract-row-1', 'contract-row-2', 'contract-row-3'],
  rowTexts: ['Alpha Player', 'Bravo Player', 'Charlie Player'],
  headingName: 'Contract Fixture',
  input: 'contract-input',
  inputLabel: 'Search',
  inputPlaceholder: 'Search players',
  select: 'contract-select',
  optionValues: ['a', 'b', 'c'],
  primaryButtonName: 'Primary Action',
  disabledButton: 'contract-disabled',
  disabledButtonName: 'Disabled Action',
  attr: 'contract-attr',
  attrName: 'data-state',
  attrValue: 'ready',
  alertText: 'Something happened',
  absent: 'contract-absent',
  hidden: 'contract-hidden',
  /**
   * Two elements sharing one testid — one `display:none`, one rendered — the
   * fixture shape of a responsive component mounted once per CSS breakpoint
   * (LS-9712). `visible()` must resolve to the rendered one regardless of DOM
   * order; `first()` deliberately would not (it is DOM-order, not viewport).
   */
  duplicate: 'contract-duplicate',
  duplicateHiddenText: 'Duplicate (hidden)',
  duplicateVisibleText: 'Duplicate (visible)',
} as const;

/** Static, script-free HTML rendering of {@link FIXTURE} for the web driver. */
export const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Driver Contract Fixture</title></head>
<body>
  <main data-testid="${FIXTURE.root}">
    <h1>${FIXTURE.headingName}</h1>
    <div data-testid="${FIXTURE.attr}" ${FIXTURE.attrName}="${FIXTURE.attrValue}">Badge</div>
    <ul>
      <li data-testid="${FIXTURE.rows[0]}">${FIXTURE.rowTexts[0]}</li>
      <li data-testid="${FIXTURE.rows[1]}">${FIXTURE.rowTexts[1]}</li>
      <li data-testid="${FIXTURE.rows[2]}">${FIXTURE.rowTexts[2]}</li>
    </ul>
    <label for="search-input">${FIXTURE.inputLabel}</label>
    <input id="search-input" data-testid="${FIXTURE.input}" placeholder="${FIXTURE.inputPlaceholder}" />
    <select data-testid="${FIXTURE.select}">
      <option value="${FIXTURE.optionValues[0]}">Apple</option>
      <option value="${FIXTURE.optionValues[1]}">Banana</option>
      <option value="${FIXTURE.optionValues[2]}">Cherry</option>
    </select>
    <button data-testid="contract-primary">${FIXTURE.primaryButtonName}</button>
    <button data-testid="${FIXTURE.disabledButton}" disabled>${FIXTURE.disabledButtonName}</button>
    <div role="alert">${FIXTURE.alertText}</div>
    <div data-testid="${FIXTURE.hidden}" style="display:none">Hidden</div>
    <div data-testid="${FIXTURE.duplicate}" style="display:none">${FIXTURE.duplicateHiddenText}</div>
    <div data-testid="${FIXTURE.duplicate}">${FIXTURE.duplicateVisibleText}</div>
  </main>
</body>
</html>`;

/** The fixture as a navigable `data:` URL (for `driver.open()` on web). */
export const FIXTURE_DATA_URL = `data:text/html;charset=utf-8,${encodeURIComponent(
  FIXTURE_HTML,
)}`;

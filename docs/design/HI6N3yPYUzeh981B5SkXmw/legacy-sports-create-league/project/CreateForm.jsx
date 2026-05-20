// CreateForm.jsx — shared form components & state for Legacy Sports Create League
// Sport-aware: handles both baseball (the live product) and football (the
// "Coming Soon" surface tokenised in the design system).

// ── Sport-specific data ─────────────────────────────
const SPORTS = [
  {
    id: 'baseball',
    name: 'Baseball',
    icon: 'icons/brand/baseball.svg',
    league: 'MLB',
    defaultTeams: 12,
    defaultRoster: 26,
    comingSoon: false,
  },
  {
    id: 'football',
    name: 'Football',
    icon: 'icons/brand/football.svg',
    league: 'NFL',
    defaultTeams: 10,
    defaultRoster: 16,
    comingSoon: true,
  },
];

const ERAS_BY_SPORT = {
  baseball: [
    { id: 'all', name: 'All Eras', years: '1871 – Now', premium: false },
    { id: 'deadball', name: 'Dead Ball', years: '1901 – 1919', premium: true },
    { id: 'golden', name: 'Golden Age', years: '1920 – 1945', premium: true },
    { id: 'expansion', name: 'Expansion', years: '1946 – 1968', premium: true },
    {
      id: 'freeagency',
      name: 'Free Agency',
      years: '1969 – 1993',
      premium: true,
    },
    { id: 'steroid', name: 'Steroid Era', years: '1994 – 2005', premium: true },
    { id: 'modern', name: 'Modern', years: '2006 – Now', premium: true },
    { id: 'custom', name: 'Custom Range', years: 'Pick years', premium: true },
  ],
  football: [
    { id: 'all', name: 'All Eras', years: '1920 – Now', premium: false },
    { id: 'pioneer', name: 'Pioneer', years: '1920 – 1945', premium: true },
    {
      id: 'singleplat',
      name: 'Single-Platoon',
      years: '1946 – 1959',
      premium: true,
    },
    {
      id: 'superbowl',
      name: 'Super Bowl Era',
      years: '1960 – 1977',
      premium: true,
    },
    {
      id: 'westcoast',
      name: 'West Coast',
      years: '1978 – 1993',
      premium: true,
    },
    { id: 'capera', name: 'Salary Cap', years: '1994 – 2010', premium: true },
    {
      id: 'spread',
      name: 'Spread Offense',
      years: '2011 – Now',
      premium: true,
    },
    { id: 'custom', name: 'Custom Range', years: 'Pick years', premium: true },
  ],
};

const POOLS_BY_SPORT = {
  baseball: [
    { value: 'all', label: 'All MLB' },
    { value: 'nl', label: 'National' },
    { value: 'al', label: 'American' },
  ],
  football: [
    { value: 'all', label: 'All NFL' },
    { value: 'nfc', label: 'NFC' },
    { value: 'afc', label: 'AFC' },
  ],
};

const ROSTER_SIZES_BY_SPORT = {
  baseball: [20, 22, 24, 26, 28, 30, 35, 40],
  football: [13, 14, 15, 16, 17, 18, 20, 22],
};

const ROSTER_RANGE_BY_SPORT = {
  baseball: {
    min: 15,
    max: 50,
    defaultLabel: '26 is the Legacy Sports standard.',
  },
  football: {
    min: 10,
    max: 25,
    defaultLabel:
      '16 is the Legacy Sports standard (1 QB, 2 RB, 3 WR, 1 TE, K, DEF + bench).',
  },
};

// ── Form defaults — sport-aware ─────────────────────
const baseDefaults = {
  // Basic
  leagueName: '',
  numberOfDivisions: 2,
  isPublic: false,
  // Schedule
  schedulingStrategy: 'divisional',
  playerPool: 'all',
  // Era & History
  eraFilter: 'all',
  customEraStartYear: '1920',
  customEraEndYear: '1945',
  hofOnly: false,
  // Draft
  draftMode: 'live',
  selectionMethod: 'standard',
  draftOrder: 'snake',
  auctionBudget: '200',
  auctionMinBid: '1',
  draftDate: '',
  draftTime: '20:00',
  // Waivers / cap
  waiverType: 'standard',
  faabBudgetDefault: 100,
  salaryCapEnabled: false,
  salaryCap: '250',
};

const defaultsForSport = (sport) => {
  const s = SPORTS.find((x) => x.id === sport) || SPORTS[0];
  return {
    ...baseDefaults,
    sport: s.id,
    numberOfTeams: s.defaultTeams,
    maxRosterSize: s.defaultRoster,
  };
};

const DEFAULT_FORM = defaultsForSport('baseball');

// When switching sport, keep user-entered values but reset sport-keyed ones.
const applySportSwitch = (f, nextSport) => {
  const fresh = defaultsForSport(nextSport);
  return {
    ...f,
    sport: nextSport,
    numberOfTeams: fresh.numberOfTeams,
    maxRosterSize: fresh.maxRosterSize,
    eraFilter: 'all', // Era options differ — reset
    playerPool: 'all', // Pool options differ — reset
    customEraStartYear: nextSport === 'football' ? '1960' : '1920',
    customEraEndYear: nextSport === 'football' ? '1977' : '1945',
  };
};

// ── low-level inputs ────────────────────────────────
const Field = ({ label, required, hint, full, children }) => (
  <div className={`ls-field ${full ? 'ls-field-full' : ''}`}>
    <div className="ls-label">
      <span>{label}</span>
      {required && <span className="req">Required</span>}
    </div>
    {children}
    {hint && <div className="ls-help">{hint}</div>}
  </div>
);

const TextInput = ({
  value,
  onChange,
  placeholder,
  max,
  prefix,
  disabled,
  type = 'text',
}) => {
  const over = max && value.length > max;
  const warn = max && value.length > max * 0.9 && !over;
  return (
    <div className="ls-input-wrap">
      {prefix && <span className="ls-input-prefix">{prefix}</span>}
      <input
        type={type}
        className={`ls-input ${prefix ? 'with-prefix' : ''}`}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={max}
        onChange={(e) => onChange(e.target.value)}
      />
      {max && (
        <span
          className={`ls-input-count ${over ? 'over' : warn ? 'warn' : ''}`}
        >
          {value.length}/{max}
        </span>
      )}
    </div>
  );
};

const ButtonGroup = ({
  value,
  options,
  onChange,
  disabled,
  wide,
  lockedFilter,
}) => (
  <div className={`ls-bgrp ${wide ? 'wide' : ''}`}>
    {options.map((o) => {
      const val = typeof o === 'object' ? o.value : o;
      const label = typeof o === 'object' ? o.label : o;
      const itemDisabled = disabled || (typeof o === 'object' && o.disabled);
      const locked = lockedFilter && !lockedFilter(val);
      return (
        <button
          key={val}
          className={value === val ? 'on' : ''}
          disabled={itemDisabled || locked}
          onClick={() => !itemDisabled && !locked && onChange(val)}
          title={locked ? 'Locked by other settings' : undefined}
        >
          {label}
        </button>
      );
    })}
  </div>
);

const Toggle = ({
  value,
  onChange,
  offLabel = 'Off',
  onLabel = 'On',
  disabled,
}) => (
  <div className="ls-toggle">
    <button
      className={!value ? 'on' : ''}
      disabled={disabled}
      onClick={() => onChange(false)}
    >
      <span className="dot" />
      {offLabel}
    </button>
    <button
      className={value ? 'on' : ''}
      disabled={disabled}
      onClick={() => onChange(true)}
    >
      <span className="dot" />
      {onLabel}
    </button>
  </div>
);

// ── Sport switcher ─────────────────────────────────
// The very first decision a commissioner makes — baseball or football. Big enough
// to read at-a-glance, prominent enough to feel like a mode switch (not a filter).
const SportSwitcher = ({ value, onChange, disabled, compact }) => (
  <div
    className={`ls-sport-switch ${compact ? 'compact' : ''}`}
    role="tablist"
    aria-label="Sport"
  >
    {SPORTS.map((s) => (
      <button
        key={s.id}
        role="tab"
        aria-selected={value === s.id}
        className={`ls-sport-tab ${value === s.id ? 'on' : ''}`}
        data-sport={s.id}
        disabled={disabled}
        onClick={() => value !== s.id && onChange(s.id)}
      >
        <img
          src={s.icon}
          width={compact ? 22 : 28}
          height={compact ? 22 : 28}
          alt=""
        />
        <div className="ls-sport-tab-text">
          <div className="ls-sport-tab-name">{s.name}</div>
          {!compact && (
            <div className="ls-sport-tab-sub">
              {s.league}
              {s.comingSoon ? ' · Beta' : ''}
            </div>
          )}
        </div>
        {s.comingSoon && <span className="ls-sport-flag">Beta</span>}
      </button>
    ))}
  </div>
);

// ── Section accordion ──────────────────────────────
const Section = ({
  num,
  title,
  sub,
  summary,
  open,
  onToggle,
  twoCol,
  children,
}) => (
  <section
    className={`ls-section ${open ? 'open' : ''} ${twoCol ? 'two-col' : ''}`}
  >
    <button className="ls-section-head" onClick={onToggle} aria-expanded={open}>
      <div className="ls-section-num">{String(num).padStart(2, '0')}</div>
      <div className="ls-section-title-wrap">
        <div className="ls-section-title">{title}</div>
        <div className="ls-section-sub">{sub}</div>
      </div>
      {!open && summary && <div className="ls-section-summary">{summary}</div>}
      <svg
        className="ls-section-chevron"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
    {open && <div className="ls-section-body">{children}</div>}
  </section>
);

// ── Era Picker ──────────────────────────────────────
const EraPicker = ({ sport, value, onChange, disabled }) => {
  const eras = ERAS_BY_SPORT[sport] || ERAS_BY_SPORT.baseball;
  return (
    <div className="ls-era-grid">
      {eras.map((e) => (
        <button
          key={e.id}
          className={`ls-era-card ${value === e.id ? 'on' : ''} ${e.premium ? 'premium' : ''}`}
          disabled={disabled}
          onClick={() => onChange(e.id)}
        >
          <div className="ls-era-name">{e.name}</div>
          <div className="ls-era-years">{e.years}</div>
          {e.premium && (
            <svg
              className="ls-era-lock"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
};

// ── Section builders (shared across page + modal) ──
const BasicSection = ({ f, set, disabled }) => (
  <>
    <Field
      label="League Name"
      required
      full
      hint={`3–50 characters. Shown on standings, invites, and the draft board.`}
    >
      <TextInput
        value={f.leagueName}
        onChange={(v) => set({ leagueName: v })}
        placeholder={
          f.sport === 'football'
            ? 'e.g. Vince Lombardi Memorial'
            : 'e.g. Dead Ball Dynasty'
        }
        max={50}
        disabled={disabled}
      />
    </Field>
    <Field
      label="Number of Teams"
      required
      hint={
        f.sport === 'football'
          ? '10 is the Legacy Sports football standard.'
          : 'Even numbers produce cleanest divisions. 12 is the Legacy Sports standard.'
      }
    >
      <ButtonGroup
        value={f.numberOfTeams}
        options={[4, 6, 8, 10, 12, 14, 16]}
        onChange={(v) => {
          const newDiv =
            f.numberOfDivisions % 2 !== v % 2 ? 1 : f.numberOfDivisions;
          set({ numberOfTeams: v, numberOfDivisions: Math.min(newDiv, v) });
        }}
        disabled={disabled}
      />
    </Field>
    <Field
      label="Divisions"
      hint={
        f.numberOfTeams % 2
          ? 'Teams are odd — divisions must also be odd.'
          : 'Must divide the team count evenly.'
      }
    >
      <ButtonGroup
        value={f.numberOfDivisions}
        options={[1, 2, 3, 4]}
        onChange={(v) => set({ numberOfDivisions: v })}
        disabled={disabled}
        lockedFilter={(d) =>
          d <= f.numberOfTeams && f.numberOfTeams % 2 === d % 2
        }
      />
    </Field>
    <Field
      label="Visibility"
      hint={
        f.isPublic
          ? 'Anyone with the link can request to join.'
          : 'Invite-only. You control who joins.'
      }
    >
      <Toggle
        value={f.isPublic}
        onChange={(v) => set({ isPublic: v })}
        offLabel="Private"
        onLabel="Public"
        disabled={disabled}
      />
    </Field>
  </>
);

const RosterSection = ({ f, set, disabled }) => {
  const pools = POOLS_BY_SPORT[f.sport] || POOLS_BY_SPORT.baseball;
  const sizes =
    ROSTER_SIZES_BY_SPORT[f.sport] || ROSTER_SIZES_BY_SPORT.baseball;
  const range =
    ROSTER_RANGE_BY_SPORT[f.sport] || ROSTER_RANGE_BY_SPORT.baseball;
  return (
    <>
      <Field
        label="Scheduling Strategy"
        full
        hint="How weekly matchups are assigned across the regular season."
      >
        <ButtonGroup
          wide
          value={f.schedulingStrategy}
          options={[
            { value: 'divisional', label: 'Divisional' },
            { value: 'roundrobin', label: 'Round-Robin' },
            { value: 'random', label: 'Random' },
          ]}
          onChange={(v) => set({ schedulingStrategy: v })}
          disabled={disabled}
        />
      </Field>
      <Field
        label="Max Roster Size"
        hint={`Active + bench. ${range.defaultLabel}`}
      >
        <ButtonGroup
          value={f.maxRosterSize}
          options={sizes}
          onChange={(v) => set({ maxRosterSize: v })}
          disabled={disabled}
        />
      </Field>
      <Field
        label="Player Pool"
        hint={
          f.sport === 'football'
            ? 'Limit to one conference, or keep it open league-wide.'
            : "Narrow the league to a single league's talent, or open it up."
        }
      >
        <ButtonGroup
          value={f.playerPool}
          options={pools}
          onChange={(v) => set({ playerPool: v })}
          disabled={disabled}
        />
      </Field>
    </>
  );
};

const EraSection = ({ f, set, disabled }) => (
  <>
    <Field
      label="Era Filter"
      full
      hint="Only players active during this window are draftable."
    >
      <EraPicker
        sport={f.sport}
        value={f.eraFilter}
        onChange={(v) => set({ eraFilter: v })}
        disabled={disabled}
      />
    </Field>
    {f.eraFilter === 'custom' && (
      <>
        <Field
          label="Custom Start Year"
          required
          hint="Earliest season included."
        >
          <TextInput
            type="number"
            value={f.customEraStartYear}
            onChange={(v) => set({ customEraStartYear: v })}
            placeholder={f.sport === 'football' ? '1960' : '1920'}
            disabled={disabled}
          />
        </Field>
        <Field
          label="Custom End Year"
          required
          hint="Latest season included. Must be ≥ start year."
        >
          <TextInput
            type="number"
            value={f.customEraEndYear}
            onChange={(v) => set({ customEraEndYear: v })}
            placeholder={f.sport === 'football' ? '1977' : '1945'}
            disabled={disabled}
          />
        </Field>
      </>
    )}
    <Field
      label="Hall of Fame Only"
      full
      hint={`Restrict the player pool to ${f.sport === 'football' ? 'Pro Football Hall of Fame' : 'Baseball HOF'} inductees — smaller, more legendary.`}
    >
      <Toggle
        value={f.hofOnly}
        onChange={(v) => set({ hofOnly: v })}
        disabled={disabled}
      />
    </Field>
  </>
);

const DraftSection = ({ f, set, disabled }) => {
  const autoForced = f.draftMode === 'automated';
  return (
    <>
      <Field
        label="Draft Mode"
        hint={
          autoForced
            ? 'Automated drafts always use random selection.'
            : 'Live drafts let managers pick in real time.'
        }
      >
        <ButtonGroup
          value={f.draftMode}
          options={[
            { value: 'live', label: 'Live Draft' },
            { value: 'automated', label: 'Automated' },
          ]}
          onChange={(v) =>
            set({
              draftMode: v,
              selectionMethod: v === 'automated' ? 'random' : f.selectionMethod,
            })
          }
          disabled={disabled}
        />
      </Field>
      <Field
        label="Selection Method"
        hint={
          autoForced
            ? 'Forced to Random in automated mode.'
            : 'Auction unlocks budget bidding.'
        }
      >
        <ButtonGroup
          value={f.selectionMethod}
          options={[
            { value: 'standard', label: 'Standard' },
            { value: 'auction', label: 'Auction' },
            { value: 'random', label: 'Random' },
          ]}
          onChange={(v) => set({ selectionMethod: v })}
          disabled={disabled || autoForced}
        />
      </Field>
      <Field
        label="Draft Order"
        hint="Snake reverses each round. Linear repeats the same order."
      >
        <ButtonGroup
          value={f.draftOrder}
          options={[
            { value: 'snake', label: 'Snake' },
            { value: 'linear', label: 'Linear' },
          ]}
          onChange={(v) => set({ draftOrder: v })}
          disabled={disabled}
        />
      </Field>
      <Field
        label="Draft Date & Time"
        hint="Optional. Leave blank to schedule later from the league settings."
      >
        <div className="ls-date-time">
          <TextInput
            type="date"
            value={f.draftDate}
            onChange={(v) => set({ draftDate: v })}
            disabled={disabled}
          />
          <TextInput
            type="time"
            value={f.draftTime}
            onChange={(v) => set({ draftTime: v })}
            disabled={disabled}
          />
        </div>
      </Field>
      {f.selectionMethod === 'auction' && !autoForced && (
        <>
          <Field
            label="Auction Budget"
            hint="Total dollars each manager has to fill a roster."
          >
            <TextInput
              type="number"
              value={f.auctionBudget}
              onChange={(v) => set({ auctionBudget: v })}
              prefix="$"
              disabled={disabled}
            />
          </Field>
          <Field label="Minimum Bid" hint="Lowest opening bid accepted.">
            <TextInput
              type="number"
              value={f.auctionMinBid}
              onChange={(v) => set({ auctionMinBid: v })}
              prefix="$"
              disabled={disabled}
            />
          </Field>
        </>
      )}
    </>
  );
};

const WaiversSection = ({ f, set, disabled, onUpgrade }) => (
  <>
    <Field
      label="Waiver Type"
      full
      hint={
        f.waiverType === 'faab'
          ? 'FAAB: weekly blind bidding on free agents.'
          : 'Priority-based waivers, reverse standings order.'
      }
    >
      <ButtonGroup
        wide
        value={f.waiverType}
        options={[
          { value: 'standard', label: 'Standard' },
          { value: 'faab', label: 'FAAB  ·  Premium' },
        ]}
        onChange={(v) => {
          if (v === 'faab' && !window.__premium) {
            onUpgrade('FAAB bidding');
            return;
          }
          set({ waiverType: v });
        }}
        disabled={disabled}
      />
    </Field>
    {f.waiverType === 'faab' && (
      <Field
        label="FAAB Budget (per manager)"
        full
        hint="Each manager starts the season with this budget."
      >
        <ButtonGroup
          value={f.faabBudgetDefault}
          options={[
            { value: 50, label: '$50' },
            { value: 100, label: '$100' },
            { value: 150, label: '$150' },
            { value: 200, label: '$200' },
            { value: 250, label: '$250' },
            { value: 500, label: '$500' },
          ]}
          onChange={(v) => set({ faabBudgetDefault: v })}
          disabled={disabled}
        />
      </Field>
    )}
    <Field
      label="Salary Cap"
      hint="Premium. Keeper-style caps across all teams."
    >
      <Toggle
        value={f.salaryCapEnabled}
        onChange={(v) => {
          if (v && !window.__premium) {
            onUpgrade('Salary cap');
            return;
          }
          set({ salaryCapEnabled: v });
        }}
        disabled={disabled}
      />
    </Field>
    {f.salaryCapEnabled && (
      <Field label="Cap Amount" hint="Total team salary limit, in millions.">
        <TextInput
          type="number"
          value={f.salaryCap}
          onChange={(v) => set({ salaryCap: v })}
          prefix="$"
          disabled={disabled}
        />
      </Field>
    )}
  </>
);

// ── Summary helpers ────────────────────────────────
const eraLabel = (f) => {
  const eras = ERAS_BY_SPORT[f.sport] || ERAS_BY_SPORT.baseball;
  if (f.eraFilter === 'custom')
    return `${f.customEraStartYear || '—'} – ${f.customEraEndYear || '—'}`;
  return (eras.find((e) => e.id === f.eraFilter) || {}).name || '—';
};
const scheduleLabel = (v) =>
  ({ divisional: 'Divisional', roundrobin: 'Round-Robin', random: 'Random' })[
    v
  ] || '—';
const poolLabel = (f) => {
  const pools = POOLS_BY_SPORT[f.sport] || POOLS_BY_SPORT.baseball;
  return (pools.find((p) => p.value === f.playerPool) || {}).label || '—';
};
const sportLabel = (f) =>
  (SPORTS.find((s) => s.id === f.sport) || SPORTS[0]).name;
const sportLeague = (f) =>
  (SPORTS.find((s) => s.id === f.sport) || SPORTS[0]).league;

// ── Validation ─────────────────────────────────────
const validateForm = (f) => {
  const errs = {};
  const range =
    ROSTER_RANGE_BY_SPORT[f.sport] || ROSTER_RANGE_BY_SPORT.baseball;
  if (!f.leagueName || f.leagueName.trim().length < 3)
    errs.leagueName = 'League name must be 3–50 characters.';
  if (f.leagueName && f.leagueName.length > 50)
    errs.leagueName = 'League name is over 50 characters.';
  if (f.numberOfTeams < 4 || f.numberOfTeams > 16)
    errs.numberOfTeams = 'Teams must be 4–16.';
  if (f.numberOfDivisions > f.numberOfTeams)
    errs.numberOfDivisions = 'More divisions than teams.';
  if (f.numberOfTeams % 2 !== f.numberOfDivisions % 2)
    errs.numberOfDivisions = 'Division parity must match team parity.';
  if (f.maxRosterSize < range.min || f.maxRosterSize > range.max)
    errs.maxRosterSize = `Roster must be ${range.min}–${range.max}.`;
  if (f.eraFilter === 'custom') {
    if (!f.customEraStartYear || !f.customEraEndYear)
      errs.customEra = 'Both start and end year required.';
    else if (+f.customEraStartYear > +f.customEraEndYear)
      errs.customEra = 'Start year must be ≤ end year.';
  }
  if (f.draftDate) {
    const d = new Date(`${f.draftDate}T${f.draftTime || '00:00'}`);
    if (d < new Date()) errs.draftDate = 'Draft date must be in the future.';
  }
  return errs;
};

Object.assign(window, {
  SPORTS,
  ERAS_BY_SPORT,
  POOLS_BY_SPORT,
  ROSTER_SIZES_BY_SPORT,
  ROSTER_RANGE_BY_SPORT,
  DEFAULT_FORM,
  defaultsForSport,
  applySportSwitch,
  Field,
  TextInput,
  ButtonGroup,
  Toggle,
  Section,
  EraPicker,
  SportSwitcher,
  BasicSection,
  RosterSection,
  EraSection,
  DraftSection,
  WaiversSection,
  eraLabel,
  scheduleLabel,
  poolLabel,
  sportLabel,
  sportLeague,
  validateForm,
});

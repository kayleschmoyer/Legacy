import React from 'react';

export type TabId =
  | 'overview'
  | 'matchup'
  | 'roster'
  | 'free-agents'
  | 'standings'
  | 'trades'
  | 'history'
  | 'team'
  | 'commish';

interface TabDef {
  id: TabId;
  label: string;
  memberOnly?: boolean;
  commishOnly?: boolean;
}

const TABS: readonly TabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'matchup', label: 'Matchup' },
  { id: 'roster', label: 'My Roster', memberOnly: true },
  { id: 'free-agents', label: 'Free Agents' },
  { id: 'standings', label: 'Standings' },
  { id: 'trades', label: 'Trades' },
  { id: 'history', label: 'History' },
  { id: 'team', label: 'My Team', memberOnly: true },
  { id: 'commish', label: 'Commissioner', commishOnly: true },
];

export const TabBar: React.FC<{
  active: TabId;
  onChange: (t: TabId) => void;
  isMember: boolean;
  isCommissioner: boolean;
  pendingTradeCount?: number;
}> = ({
  active,
  onChange,
  isMember,
  isCommissioner,
  pendingTradeCount = 0,
}) => {
  const visible = TABS.filter(
    (t) => (!t.memberOnly || isMember) && (!t.commishOnly || isCommissioner),
  );
  return (
    <nav className="ls-tabbar" role="tablist" aria-label="League sections">
      <div className="ls-tabbar-inner">
        {visible.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            className={active === t.id ? 'on' : ''}
            onClick={() => onChange(t.id)}
          >
            {t.label}
            {t.id === 'trades' && pendingTradeCount > 0 ? (
              <span className="count">{pendingTradeCount}</span>
            ) : null}
          </button>
        ))}
      </div>
    </nav>
  );
};

export const TAB_IDS: readonly TabId[] = TABS.map((t) => t.id);

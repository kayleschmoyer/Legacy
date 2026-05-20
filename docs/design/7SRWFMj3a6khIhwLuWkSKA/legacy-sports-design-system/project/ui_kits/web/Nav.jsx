// Nav.jsx — sticky top nav
const Nav = ({ current, onNav, loggedIn }) => {
  const tabs = [
    { id: 'home', label: 'Home', icon: 'scoreboard' },
    { id: 'scoreboard', label: 'Scoreboard', icon: 'live' },
    { id: 'league', label: 'My League', icon: 'league' },
    { id: 'draft', label: 'Draft', icon: 'draft' },
  ];
  return (
    <header className="ls-nav">
      <div className="ls-nav-inner">
        <a className="ls-brand" onClick={() => onNav('landing')}>
          <img src="../../assets/logo.png" alt="" />
          <div className="ls-wordmark">
            LEGACY
            <br />
            <span>SPORTS</span>
          </div>
        </a>
        {loggedIn && (
          <nav className="ls-tabs">
            {tabs.map((t) => (
              <a
                key={t.id}
                className={current === t.id ? 'on' : ''}
                onClick={() => onNav(t.id)}
              >
                <img
                  src={`../../icons/brand/${t.icon}.svg`}
                  width="16"
                  height="16"
                  alt=""
                />
                {t.label}
              </a>
            ))}
          </nav>
        )}
        <div className="ls-nav-right">
          {loggedIn ? (
            <>
              <button className="ls-icon-btn" title="Notifications">
                <img src="../../icons/brand/bell.svg" width="20" height="20" />
              </button>
              <div className="ls-avatar" title="You">
                MJ
              </div>
            </>
          ) : (
            <>
              <a className="ls-link" onClick={() => onNav('landing')}>
                Features
              </a>
              <a className="ls-link" onClick={() => onNav('landing')}>
                Pricing
              </a>
              <button
                className="ls-btn ls-btn-primary"
                onClick={() => onNav('home')}
              >
                Sign In
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
Object.assign(window, { Nav });

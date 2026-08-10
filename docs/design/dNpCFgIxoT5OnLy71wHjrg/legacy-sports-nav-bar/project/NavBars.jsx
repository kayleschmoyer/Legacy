// NavBars.jsx — the actual nav bar compositions for each surface/state

// ── Ticker ─────────────────────────────────────────────────
const Ticker = ({live=true}) => {
  const items = [
    {home:'NYY', homeScore:7, away:'BOS', awayScore:4, status:'F/9'},
    {home:'LAD', homeScore:3, away:'SFG', awayScore:2, status:'▶ 7th', live:true},
    {home:'CHC', homeScore:5, away:'STL', awayScore:8, status:'F/9'},
    {home:'HOU', homeScore:6, away:'TEX', awayScore:6, status:'▶ 5th', live:true},
    {home:'PHI', homeScore:2, away:'ATL', awayScore:5, status:'F/9'},
    {home:'SEA', homeScore:1, away:'OAK', awayScore:0, status:'▶ 3rd', live:true},
  ];
  // Duplicate so the ticker loops seamlessly
  const loop = [...items, ...items];
  return (
    <div className="ls-ticker">
      <div className={`ls-ticker-label ${live?'live':''}`}>
        {live ? <><span className="ls-dot-pulse"/> Live</> : 'Today'}
      </div>
      <div className="ls-ticker-scroll">
        {loop.map((g,i) => {
          const homeLead = g.homeScore > g.awayScore;
          return (
            <div key={i} className="ls-ticker-item">
              <span className="team">{g.away}</span>
              <span className={`score ${!homeLead && g.awayScore!==g.homeScore?'lead':''}`}>{g.awayScore}</span>
              <span className="sep">@</span>
              <span className="team">{g.home}</span>
              <span className={`score ${homeLead?'lead':''}`}>{g.homeScore}</span>
              <span className={`status ${g.live?'live':''}`}>{g.status}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Desktop — default logged-in ────────────────────────────
const NavDesktop = ({current='players', draftLive=false, compact=false, openPop, search={}, showTicker=true}) => {
  return (
    <>
      <header className={`ls-nav ${draftLive?'ls-nav--draft':''} ${compact?'ls-nav--compact':''}`}>
        <div className="ls-nav-inner">
          <Brand compact={compact}/>
          <LeagueSwitcher onClick={() => openPop && openPop('league')} active={openPop && openPop._ === 'league'} draftLive={draftLive}/>
          <div style={{marginLeft:'auto', position:'relative'}}>
            <Tabs current={current} draftLive={draftLive}/>
          </div>
          <div className="ls-nav-right" style={{marginLeft:0, position:'relative'}}>
            <div style={{position:'relative'}}>
              <IconBtn title="Notifications" count="3" onClick={() => openPop && openPop('notif')} active={openPop && openPop._ === 'notif'}>
                {Glyph.bell(17)}
              </IconBtn>
              {openPop && openPop._ === 'notif' && <NotifTray/>}
            </div>
            <div style={{position:'relative'}}>
              <HelpBtn onClick={() => openPop && openPop('help')} active={openPop && openPop._ === 'help'}/>
              {openPop && openPop._ === 'help' && <HelpMenu/>}
            </div>
            <div style={{position:'relative'}}>
              <AvatarBtn onClick={() => openPop && openPop('profile')} active={openPop && openPop._ === 'profile'}/>
              {openPop && openPop._ === 'profile' && <ProfileMenu/>}
            </div>
          </div>
          {/* League dropdown is anchored under the switcher (positioned absolutely within inner) */}
          {openPop && openPop._ === 'league' && (
            <div style={{position:'absolute', left:'calc(48px + 60px)', top:'calc(100% + 2px)'}}>
              <LeagueDropdown/>
            </div>
          )}
        </div>
      </header>
      {showTicker && <Ticker live={true}/>}
    </>
  );
};

// ── Desktop — logged out (marketing) ───────────────────────
const NavDesktopLoggedOut = () => (
  <header className="ls-nav">
    <div className="ls-nav-inner">
      <Brand/>
      <nav style={{marginLeft: 40, display:'flex', gap: 4}}>
        {['Features', 'Leagues', 'History', 'Pricing'].map(l => (
          <button type="button" key={l} className="ls-link" style={{padding:'10px 14px', fontFamily:'var(--font-display)', fontWeight:700, fontSize:12, letterSpacing:'0.1em', textTransform:'uppercase'}}>{l}</button>
        ))}
      </nav>
      <div className="ls-nav-right">
        <button type="button" className="ls-link" style={{fontFamily:'var(--font-display)', fontWeight:700, fontSize:12, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--fg1)'}}>Sign in</button>
        <button type="button" className="ls-btn ls-btn-gold">Start Your League</button>
      </div>
    </div>
  </header>
);

// ── Tablet — collapsed (no search box, compressed) ─────────
const NavTablet = ({current='players', draftLive=false}) => (
  <header className={`ls-nav ${draftLive?'ls-nav--draft':''}`}>
    <div className="ls-nav-inner" style={{maxWidth:900, gap:14}}>
      <Brand compact/>
      <LeagueSwitcher draftLive={draftLive}/>
      <div style={{marginLeft:'auto'}}>
        <Tabs current={current} draftLive={draftLive}/>
      </div>
      <div className="ls-nav-right" style={{marginLeft:0}}>
        <IconBtn title="Notifications" count="3">{Glyph.bell(17)}</IconBtn>
        <HelpBtn/>
        <AvatarBtn/>
      </div>
    </div>
  </header>
);

// ── Mobile header (web + native top portion) ───────────────
const MobileHeader = ({onMenu, draftLive=false, showLeague=true}) => (
  <div className="ls-mob-header">
    <button type="button" className="icon-btn" onClick={onMenu} aria-label="Menu">{Glyph.menu(20)}</button>
    {showLeague ? (
      <button type="button" className="ls-league-switcher" style={{maxWidth:200, padding:'5px 8px 5px 6px'}}>
        <span className="crest" style={{width:24, height:24, fontSize:10}}>LS</span>
        <span className="ls-league-label">
          <span className="eyebrow" style={{fontSize:8}}>League</span>
          <span className="name" style={{fontSize:12, maxWidth:110}}>Legends of Summer</span>
        </span>
        <span className="caret">{Glyph.chevronDown(11)}</span>
      </button>
    ) : <Brand compact/>}
    <div className="spacer"/>
    <button type="button" className="icon-btn" aria-label="Help &amp; support">{Glyph.help(18)}</button>
    <button type="button" className="icon-btn" aria-label="Report a bug">{Glyph.bug(18)}</button>
    <button type="button" className="icon-btn" aria-label="Notifications" style={{position:'relative'}}>
      {Glyph.bell(18)}
      <span style={{position:'absolute', top:4, right:4, width:8, height:8, borderRadius:'50%', background:'var(--brand-seam-red)', border:'2px solid rgba(10,15,26,0.95)'}}/>
    </button>
  </div>
);

// ── Mobile bottom bar ──────────────────────────────────────
// Mobile routing is noun-based — shared by native and the web small breakpoints
const MOBILE_TABS = [
  {id:'home',    label:'Home',    icon:'scoreboard'},
  {id:'leagues', label:'Leagues', icon:'league'},
  {id:'players', label:'Players', icon:'roster'},
  {id:'games',   label:'Games',   icon:'baseball', liveDot:true},
  {id:'you',     label:'You',     icon:'roster', avatar:true},
];

const MobileBottomBar = ({current='home', draftLive=false, items}) => {
  const tabs = items || MOBILE_TABS;
  return (
    <div className="ls-mob-bottom">
      {tabs.map(t => {
        const isDraft = draftLive && t.id==='games';
        return (
          <button type="button" key={t.id} aria-current={current===t.id?'page':undefined} className={`ls-mob-tab ${current===t.id?'on':''} ${isDraft && current===t.id?'draft-live':''}`}>
            <span className="ls-mob-tab-icon">
              {t.avatar ? (
                <span style={{width:22, height:22, borderRadius:'50%', background:'var(--grad-avatar)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--font-display)', fontWeight:800, fontSize:9, color:'#fff'}}>MJ</span>
              ) : (
                <img src={ICON(t.icon)} width="18" height="18" alt=""/>
              )}
              {t.liveDot && current!==t.id && <span className="tab-dot"/>}
              {t.badge && <span className="tab-dot" style={{width:14, height:14, fontSize:8, color:'#fff', fontFamily:'var(--font-display)', fontWeight:800, display:'inline-flex', alignItems:'center', justifyContent:'center', top:-1, right:2, background:'var(--brand-seam-red)'}}>{t.badge}</span>}
            </span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
};

// ── Mobile drawer ──────────────────────────────────────────
const MobileDrawer = ({current='home', onClose}) => {
  return (
    <div className="ls-drawer" onClick={onClose}>
      <div className="ls-drawer-panel" onClick={e=>e.stopPropagation()}>
        <div className="ls-drawer-head">
          <img src={LOGO} alt=""/>
          <div>
            <div className="name">LEGACY</div>
            <div className="sub">Sports</div>
          </div>
          <button type="button" className="icon-btn" style={{marginLeft:'auto', background:'transparent', border:0, color:'var(--fg2)', width:32, height:32}} onClick={onClose}>{Glyph.close(18)}</button>
        </div>

        <div className="ls-drawer-league-card">
          <span className="crest">LS</span>
          <div style={{minWidth:0, flex:1}}>
            <div className="name">Legends of Summer</div>
            <div className="sub">12 teams · Week 14 / 22</div>
          </div>
          <span style={{color:'var(--fg3)'}}>{Glyph.chevronRight(14)}</span>
        </div>

        <div className="ls-drawer-section">Go to</div>
        {[
          {id:'home',    label:'Home',            icon:'scoreboard'},
          {id:'leagues', label:'Leagues',         icon:'league'},
          {id:'players', label:'Players & Stats', icon:'roster'},
          {id:'games',   label:'Games',           icon:'baseball'},
        ].map(r => (
          <button type="button" key={r.id} aria-current={current===r.id?'page':undefined} className={`ls-drawer-item ${current===r.id?'on':''}`}>
            <img src={ICON(r.icon)} width="18" height="18" alt=""/>{r.label}
          </button>
        ))}

        <div className="ls-drawer-section">Leagues</div>
        <button type="button" className="ls-drawer-item">{Glyph.compass(18)}Browse public leagues</button>
        <button type="button" className="ls-drawer-item">{Glyph.ticket(18)}Join with invite code</button>
        <button type="button" className="ls-drawer-item" style={{color:'var(--brand-gold-light)'}}>
          {Glyph.plus(18)}Create a new league
        </button>

        <div className="ls-drawer-section">More play</div>
        <button type="button" className={`ls-drawer-item ${current==='minigames'?'on':''}`}>
          <img src={ICON('zap')} width="18" height="18" alt=""/>Minigames
        </button>
        <button type="button" className="ls-drawer-item">
          <img src={ICON('draft')} width="18" height="18" alt=""/>Mock Draft
        </button>
        <button type="button" className="ls-drawer-item">
          <img src={ICON('standings')} width="18" height="18" alt=""/>Standings
        </button>
        <button type="button" className="ls-drawer-item">
          <img src={ICON('trophy')} width="18" height="18" alt=""/>Trophy Case
        </button>

        <div className="ls-drawer-section">You</div>
        <button type="button" className="ls-drawer-item">{Glyph.user(18)}Profile</button>
        <button type="button" className="ls-drawer-item">{Glyph.settings(18)}Settings</button>
        <button type="button" className="ls-drawer-item">{Glyph.help(18)}Help & support</button>
        <button type="button" className="ls-drawer-item">{Glyph.bug(18)}Report a bug</button>
        <button type="button" className="ls-drawer-item">{Glyph.logout(18)}Sign out</button>
      </div>
    </div>
  );
};

Object.assign(window, {
  Ticker, NavDesktop, NavDesktopLoggedOut, NavTablet, MOBILE_TABS,
  MobileHeader, MobileBottomBar, MobileDrawer,
});

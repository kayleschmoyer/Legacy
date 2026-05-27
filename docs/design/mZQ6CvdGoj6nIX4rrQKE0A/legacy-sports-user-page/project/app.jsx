// app.jsx — main shell, hash routing, top nav, Tweaks

const { useState, useEffect, useMemo, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "persona": "champion",
  "heroVariant": "centered",
  "density": "cozy",
  "trophyStyle": "mantle",
  "accent": "gold",
  "previewAsOwner": false
}/*EDITMODE-END*/;

const parseHash = () => {
  const h = (window.location.hash || '').replace(/^#\/?/, '');
  if (h.startsWith('settings')) return 'settings';
  return 'profile';
};

const App = () => {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [route, setRoute] = useState(parseHash());
  const [transitioning, setTransitioning] = useState(false);

  // Profile + visibility state — driven by Settings page
  const persona = PERSONAS[tweaks.persona] || PERSONAS.champion;
  const [person, setPerson] = useState(() => JSON.parse(JSON.stringify(persona)));
  const [visibility, setVisibility] = useState(() => ({ ...DEFAULT_VISIBILITY }));
  const [isPublic, setIsPublic] = useState(DEFAULT_PROFILE_PUBLIC);

  // When persona tweak changes, reset profile state to that persona
  const lastPersona = useRef(tweaks.persona);
  useEffect(() => {
    if (lastPersona.current !== tweaks.persona) {
      setPerson(JSON.parse(JSON.stringify(PERSONAS[tweaks.persona] || PERSONAS.champion)));
      setVisibility({ ...DEFAULT_VISIBILITY });
      setIsPublic(true);
      lastPersona.current = tweaks.persona;
    }
  }, [tweaks.persona]);

  // Hash routing with smooth transition
  useEffect(() => {
    const onHash = () => {
      const next = parseHash();
      if (next !== route) {
        setTransitioning(true);
        setTimeout(() => {
          setRoute(next);
          setTransitioning(false);
          window.scrollTo({ top: 0, behavior: 'instant' });
        }, 180);
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [route]);

  const nav = (next) => { window.location.hash = `#/${next}`; };

  const bodyClass = [
    `density-${tweaks.density}`,
    `accent-${tweaks.accent}`,
  ].join(' ');

  return (
    <div className={bodyClass}>
      <Nav
        route={route}
        onNav={nav}
        person={person}
      />

      <div className={transitioning ? 'view exit' : ''}>
        {route === 'profile' && (
          <ProfileView
            key={`profile-${tweaks.heroVariant}-${tweaks.trophyStyle}`}
            person={person}
            visibility={visibility}
            isOwner={tweaks.previewAsOwner}
            isPublic={isPublic}
            heroVariant={tweaks.heroVariant}
            trophyStyle={tweaks.trophyStyle}
          />
        )}
        {route === 'settings' && (
          <SettingsView
            key="settings"
            person={person}
            setPerson={setPerson}
            visibility={visibility}
            setVisibility={setVisibility}
            isPublic={isPublic}
            setIsPublic={setIsPublic}
            onPreview={() => nav('profile')}
          />
        )}
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Sample profile">
          <TweakSelect
            label="Persona"
            value={tweaks.persona}
            onChange={v => setTweak('persona', v)}
            options={[
              { value: 'champion', label: 'Veteran champion · Marcus' },
              { value: 'veteran', label: 'Veteran no-rings · Jordan' },
              { value: 'rookie', label: 'Rookie · Alex' },
              { value: 'commissioner', label: 'Commissioner · Sam' },
            ]}
          />
        </TweakSection>

        <TweakSection label="Profile layout">
          <TweakRadio
            label="Hero variant"
            value={tweaks.heroVariant}
            onChange={v => setTweak('heroVariant', v)}
            options={[
              { value: 'centered', label: 'Centered' },
              { value: 'side', label: 'Side-by-side' },
              { value: 'banner', label: 'Banner' },
            ]}
          />
          <TweakRadio
            label="Trophy style"
            value={tweaks.trophyStyle}
            onChange={v => setTweak('trophyStyle', v)}
            options={[
              { value: 'mantle', label: 'Mantle' },
              { value: 'grid', label: 'Grid' },
              { value: 'timeline', label: 'Timeline' },
            ]}
          />
          <TweakRadio
            label="Density"
            value={tweaks.density}
            onChange={v => setTweak('density', v)}
            options={[
              { value: 'cozy', label: 'Cozy' },
              { value: 'compact', label: 'Compact' },
            ]}
          />
        </TweakSection>

        <TweakSection label="Accent">
          <TweakRadio
            label="Hero color"
            value={tweaks.accent}
            onChange={v => setTweak('accent', v)}
            options={[
              { value: 'gold', label: 'Gold' },
              { value: 'seam', label: 'Seam red' },
            ]}
          />
        </TweakSection>

        <TweakSection label="View mode">
          <TweakToggle
            label="Preview as owner"
            value={tweaks.previewAsOwner}
            onChange={v => setTweak('previewAsOwner', v)}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
};

// ── Top nav ──────────────────────────────────────────────
const Nav = ({ route, onNav, person }) => (
  <header className="ls-nav">
    <div className="ls-nav-inner">
      <a className="ls-brand" onClick={() => onNav('profile')}>
        <img src="design-system/assets/logo.png" alt="" />
        <div className="ls-wordmark">LEGACY<br /><span>SPORTS</span></div>
      </a>

      <nav className="ls-tabs" style={{ marginLeft: 'auto' }}>
        <a className={route === 'profile' ? 'on' : ''} onClick={() => onNav('profile')}>
          <BrandIcon name="scoreboard" size={14} opacity={0.85} /> Profile
        </a>
        <a className={route === 'settings' ? 'on' : ''} onClick={() => onNav('settings')}>
          <BrandIcon name="commissioner" size={14} opacity={0.85} /> Settings
        </a>
      </nav>

      <div className="ls-nav-right">
        <button className="ls-icon-btn" title="Notifications">
          <BrandIcon name="bell" size={18} opacity={0.85} />
        </button>
        <div className="ls-avatar" title={person.name}>{person.initials}</div>
      </div>
    </div>
  </header>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

Object.assign(window, { App, Nav });

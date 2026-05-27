// BreakpointFrame.jsx — canvas-only viewport toggle.
// Wraps a single rendered page in a resizable window with a pill row
// for each documented breakpoint. NOT part of the actual product UI —
// this is canvas chrome to inspect the page at every documented size.

const BP_LIST = [
  { id: 'xxs', width: 390, device: 'Phone · small portrait', range: '0–659' },
  {
    id: 'xs',
    width: 720,
    device: 'Phone · large / landscape',
    range: '660–799',
  },
  {
    id: 'sm',
    width: 840,
    device: 'Phone · landscape / tablet',
    range: '800–859',
  },
  { id: 'md', width: 900, device: 'Tablet · portrait', range: '860–979' },
  { id: 'lg', width: 1080, device: 'Tablet · landscape', range: '980–1119' },
  {
    id: 'xl',
    width: 1200,
    device: 'Small desktop / laptop',
    range: '1120–1279',
  },
  { id: 'xxl', width: 1440, device: 'Desktop & wide', range: '1280+' },
];

const BreakpointFrame = ({ initial = 'xl', render = null }) => {
  const [bp, setBp] = React.useState(initial);
  const current = BP_LIST.find((b) => b.id === bp);

  return (
    <div className="bp-frame">
      <div className="bp-controls">
        <div className="bp-controls-label">Viewport</div>
        <div className="bp-pills">
          {BP_LIST.map((b) => (
            <button
              key={b.id}
              className={`bp-pill ${bp === b.id ? 'on' : ''}`}
              onClick={() => setBp(b.id)}
              title={`${b.device} · ${b.range}px`}
            >
              <span className="pill-id">${b.id}</span>
              <span className="pill-w">{b.width}</span>
            </button>
          ))}
        </div>
        <div className="bp-meta">
          <div className="device">{current.device}</div>
          <div className="range">
            {current.range}px range · viewing {current.width}px
          </div>
        </div>
      </div>
      <div className="bp-frame-stage">
        <div className="bp-frame-window" style={{ width: current.width }}>
          <div className="bp-frame-window-chrome">{current.width} × auto</div>
          {render ? render(current) : null}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { BreakpointFrame, BP_LIST });

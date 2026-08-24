// Legacy Sports — Android launch logo animation.
// Sketch-draws the medallion in gold ink strokes, then punches in the real
// logo-512.png. Two cuts on one timeline: Fast (production timing per
// AnimatedLaunchScreen.tsx) and Showcase (same choreography, more air).
const { CompositionStage, useComposition, Shot, Captions, Easing, animate, interpolate, clamp } = window;

const NAVY = '#0A0F1A', GOLD = '#C5A55A', GOLD_L = '#D9BE7F', MUTED = '#9CAAC5';
const LOGO_SRC = './apps/web/public/logo-512.png';

// Exactly three motion helpers
const MOTION = {
  draw: (T, a, b) => clamp((T - a) / Math.max(b - a, 0.001), 0, 1),
  enter: (T, a, d) => Easing.easeOutQuad(clamp((T - a) / d, 0, 1)),
  pop: (T, a, d) => Easing.easeOutBack(clamp((T - a) / d, 0, 1)),
};

// ── Geometry (viewBox 0 0 512 512, matches logo-512.png framing) ──
const DEG = Math.PI / 180;
const pt = (cx, cy, r, aDeg) => [cx + r * Math.cos(aDeg * DEG), cy + r * Math.sin(aDeg * DEG)];

// Laurel (left half; right half is a mirror)
const L_C = [256, 262], L_R = 176;
const stemPts = [];
for (let a = 96; a <= 226; a += 10) stemPts.push(pt(L_C[0], L_C[1], L_R, a));
const STEM_D = 'M ' + stemPts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L ');
const LEAVES = [];
for (let i = 0; i < 12; i++) {
  const a = 106 + i * 10;
  const p = pt(L_C[0], L_C[1], L_R, a);
  const out = [Math.cos(a * DEG), Math.sin(a * DEG)];
  const tan = [-Math.sin(a * DEG), Math.cos(a * DEG)];
  const s = i % 2 ? 1 : -0.85;
  LEAVES.push([p, [p[0] + (0.55 * tan[0] + s * 0.8 * out[0]) * 30, p[1] + (0.55 * tan[1] + s * 0.8 * out[1]) * 30]]);
}
// Baseball seam (left; right is mirrored) + stitch ticks
const SEAM = [[207, 166], [156, 222], [156, 296], [207, 350]];
const SEAM_D = `M${SEAM[0]} C${SEAM[1]} ${SEAM[2]} ${SEAM[3]}`;
const bez = (P, u) => {
  const k = 1 - u;
  return [0, 1].map(j => k * k * k * P[0][j] + 3 * k * k * u * P[1][j] + 3 * k * u * u * P[2][j] + u * u * u * P[3][j]);
};
const TICKS = [];
for (let i = 0; i < 8; i++) {
  const u = 0.1 + (i * 0.8) / 7;
  const b = bez(SEAM, u), b2 = bez(SEAM, u + 0.01);
  let t = [b2[0] - b[0], b2[1] - b[1]];
  const tl = Math.hypot(t[0], t[1]); t = [t[0] / tl, t[1] / tl];
  const n = [-t[1], t[0]];
  let d = [n[0] + 0.45 * t[0], n[1] + 0.45 * t[1]];
  const dl = Math.hypot(d[0], d[1]); d = [d[0] / dl, d[1] / dl];
  TICKS.push([[b[0] - 9 * d[0], b[1] - 9 * d[1]], [b[0] + 9 * d[0], b[1] + 9 * d[1]]]);
}
// Star (5-point, centered above the ball)
const starPts = [];
for (let i = 0; i < 10; i++) {
  const r = i % 2 ? 16 : 40;
  starPts.push(pt(256, 104, r, -90 + i * 36));
}
const STAR_D = 'M ' + starPts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L ') + ' Z';

const sub = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
const dash = (pr) => ({ strokeDasharray: 1, strokeDashoffset: 1 - pr });

function SketchMedallion({ p, ink }) {
  const S = { fill: 'none', stroke: ink, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const pLeaf = sub(p, 0.56, 0.88), pTick = sub(p, 0.46, 0.72);
  const half = (mirror) => (
    <g transform={mirror ? 'translate(512,0) scale(-1,1)' : undefined}>
      <path d={SEAM_D} pathLength="1" {...S} strokeWidth="6" style={dash(sub(p, 0.34, 0.58))} />
      {TICKS.map((t, i) => (
        <line key={i} x1={t[0][0]} y1={t[0][1]} x2={t[1][0]} y2={t[1][1]} {...S} strokeWidth="4.5" opacity={clamp(pTick * 8 - i, 0, 1)} />
      ))}
      <path d={STEM_D} pathLength="1" {...S} strokeWidth="5" style={dash(sub(p, 0.42, 0.68))} />
      {LEAVES.map((l, i) => (
        <line key={i} x1={l[0][0]} y1={l[0][1]} x2={l[1][0]} y2={l[1][1]} {...S} strokeWidth="7" opacity={clamp(pLeaf * 12 - i, 0, 1)} />
      ))}
    </g>
  );
  return (
    <svg viewBox="0 0 512 512" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
      <circle cx="256" cy="256" r="238" pathLength="1" {...S} strokeWidth="7" style={dash(sub(p, 0, 0.28))} />
      <circle cx="256" cy="256" r="212" pathLength="1" {...S} strokeWidth="4" style={dash(sub(p, 0.08, 0.34))} />
      <circle cx="256" cy="258" r="106" pathLength="1" {...S} strokeWidth="6" style={dash(sub(p, 0.18, 0.46))} />
      {half(false)}
      {half(true)}
      <path d={STAR_D} pathLength="1" {...S} strokeWidth="5" style={dash(sub(p, 0.78, 1))} />
    </svg>
  );
}

// One launch-screen playthrough: draw → punch → wordmark → fade
function LaunchSequence({ T, drawStart, punchAt, punchDur, wordAt, fadeOutAt, end, ink }) {
  const p = MOTION.draw(T, drawStart, punchAt);
  const q = T < punchAt ? 0 : MOTION.draw(T, punchAt, punchAt + punchDur);
  const pop = T < punchAt ? 0 : MOTION.pop(T, punchAt, punchDur);
  const w = MOTION.draw(T, wordAt, wordAt + 0.45);
  const wPop = T < wordAt ? 0 : MOTION.pop(T, wordAt, 0.45);
  const wScale = 1.7 - 0.7 * wPop;
  const fade = 1 - MOTION.draw(T, fadeOutAt, end);
  const drawing = p > 0 && q === 0;
  const wob = drawing ? 0.9 * Math.sin(T * 34) * Math.min(1, p * 6) : 0;
  const sketchO = p === 0 ? 0 : 1 - sub(q, 0, 0.45);
  const logoO = sub(q, 0.1, 0.55);
  const logoScale = 1.3 - 0.3 * pop;
  const flashO = q > 0 ? 0.65 * (1 - sub(q, 0, 0.85)) : 0;
  const flashScale = 1 + 0.45 * sub(q, 0, 0.85);
  return (
    <div style={{ position: 'absolute', inset: 0, background: NAVY, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30, opacity: fade }}>
      <div style={{ position: 'relative', width: 250, height: 250 }}>
        <div style={{ position: 'absolute', inset: 0, opacity: sketchO, transform: `scale(${1 + 0.08 * q}) rotate(${wob}deg)` }}>
          <SketchMedallion p={p} ink={ink} />
        </div>
        <img src={LOGO_SRC} alt="Legacy Sports" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: logoO, transform: `scale(${logoScale})` }} />
        <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: `2px solid ${GOLD}`, opacity: flashO, transform: `scale(${flashScale})` }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, opacity: sub(w, 0, 0.35), transform: `scale(${wScale})` }}>
        <div style={{ width: 48, height: 2, borderRadius: 2, background: 'rgba(197,165,90,0.65)' }} />
        <div style={{ fontFamily: "'Big Shoulders Display', sans-serif", fontWeight: 800, fontSize: 27, letterSpacing: 0.5, color: GOLD_L, lineHeight: 1 }}>LEGACY SPORTS</div>
        <div style={{ fontFamily: 'Literata, serif', fontStyle: 'italic', fontSize: 13, color: MUTED }}>Where history plays on.</div>
      </div>
    </div>
  );
}

function Piece({ ink }) {
  const { T, CUES, authoredTotal, time } = useComposition();
  // Camera: gentle settle across the piece + a kick on the punch and the wordmark stamp
  const kick = (at, amt) => (T < at ? 0 : amt * (1 - Easing.easeOutCubic(clamp((T - at) / 0.45, 0, 1))));
  const cam = 1.0 + 0.04 * (1 - MOTION.draw(T, 0, authoredTotal)) + kick(CUES['Showcase punch'], 0.045) + kick(CUES['Wordmark'], 0.025);
  return (
    <div data-screen-label={`t=${Math.floor(time)}s`} style={{ position: 'absolute', inset: 0, background: 'radial-gradient(1100px at 50% 42%, #0C1526 0%, #05080F 65%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ transform: `scale(${cam})` }}>
        <window.AndroidDevice dark bg={NAVY} width={412} height={854}>
          <div style={{ position: 'relative', width: '100%', height: '100%', background: NAVY }}>
            <LaunchSequence T={T} ink={ink}
              drawStart={CUES['Showcase draw']} punchAt={CUES['Showcase punch']} punchDur={0.5}
              wordAt={CUES['Wordmark']} fadeOutAt={authoredTotal - 0.35} end={authoredTotal} />
          </div>
        </window.AndroidDevice>
      </div>

    </div>
  );
}

function LogoDrawApp() {
  const [t, setTweak] = window.useTweaks(window.TWEAK_DEFAULTS);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <CompositionStage width={1920} height={1080} bg="#05080F" scenes={window.OM_SCENES} playback={window.OM_PLAYBACK}>
        <Piece ink={t.ink} />
      </CompositionStage>
      <window.TweaksPanel>
        <window.TweakSection label="Sketch" />
        <window.TweakColor label="Ink" value={t.ink} options={['#C5A55A', '#E8EDF6', '#D9BE7F']} onChange={(v) => setTweak('ink', v)} />
        <window.TweakSection label="Editor" />
        <window.TweakToggle label="Motion editor" value={t.motionEditor} onChange={(v) => setTweak('motionEditor', v)} />
      </window.TweaksPanel>
    </div>
  );
}
window.LogoDrawApp = LogoDrawApp;

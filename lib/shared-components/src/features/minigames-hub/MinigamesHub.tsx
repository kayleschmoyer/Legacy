import React from 'react';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_SEAM_RED,
  BRAND_SEAM_RED_LIGHT,
  SURFACE_CARD,
  withAlpha,
} from '../../utils/colors';
import {
  SeasonDraftGameStatus,
  useGetDisclosureGameBestScoreQuery,
  useGetMinigamesStatsQuery,
  useGetSeasonDraftGamesQuery,
} from '../../api/db/graphql.generated';

// ── Types ──────────────────────────────────────────────────────────────────

export type MinigameId = 'season-draft' | 'disclosure' | 'twenty-questions';

export interface MinigamesHubProps {
  onNavigate: (gameId: MinigameId) => void;
}

const EYEBROW_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-display, "Big Shoulders Display", sans-serif)',
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
};

// ── Baseball SVG ───────────────────────────────────────────────────────────

const BaseballMark: React.FC = () => (
  <svg
    viewBox="0 0 240 240"
    fill="none"
    style={{
      width: '100%',
      maxWidth: 200,
      filter: 'drop-shadow(0 12px 32px rgba(0,0,0,0.5))',
      transform: 'rotate(-8deg)',
    }}
    aria-hidden="true"
  >
    <defs>
      <radialGradient id="mg-ballGrad" cx="36%" cy="30%" r="72%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="45%" stopColor="#F4EEDA" />
        <stop offset="100%" stopColor="#A89A76" />
      </radialGradient>
      <radialGradient id="mg-ballShine" cx="32%" cy="26%" r="26%">
        <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
        <stop offset="100%" stopColor="rgba(255,255,255,0)" />
      </radialGradient>
      <radialGradient id="mg-ballShadow" cx="70%" cy="78%" r="50%">
        <stop offset="0%" stopColor="rgba(40,30,15,0.28)" />
        <stop offset="100%" stopColor="rgba(40,30,15,0)" />
      </radialGradient>
    </defs>
    <ellipse cx="120" cy="222" rx="82" ry="8" fill="rgba(0,0,0,0.35)" />
    <circle cx="120" cy="118" r="100" fill="url(#mg-ballGrad)" />
    <circle cx="120" cy="118" r="100" fill="url(#mg-ballShadow)" />
    <circle cx="120" cy="118" r="100" fill="url(#mg-ballShine)" />
    <circle
      cx="120"
      cy="118"
      r="100"
      fill="none"
      stroke="#6B5F47"
      strokeWidth="1"
      opacity="0.35"
    />
    {/* Left seam */}
    <path
      d="M60 38 C95 78 95 158 60 198"
      stroke="#B01E37"
      strokeWidth="1.6"
      fill="none"
      strokeLinecap="round"
      opacity="0.9"
    />
    {/* Right seam */}
    <path
      d="M180 38 C145 78 145 158 180 198"
      stroke="#B01E37"
      strokeWidth="1.6"
      fill="none"
      strokeLinecap="round"
      opacity="0.9"
    />
    {/* Left stitches */}
    {[0.09, 0.18, 0.27, 0.36, 0.45, 0.55, 0.64, 0.73, 0.82, 0.91].map(
      (t, i) => {
        const p0 = [60, 38];
        const p1 = [95, 78];
        const p2 = [95, 158];
        const p3 = [60, 198];
        const u = 1 - t;
        const x =
          u * u * u * p0[0] +
          3 * u * u * t * p1[0] +
          3 * u * t * t * p2[0] +
          t * t * t * p3[0];
        const y =
          u * u * u * p0[1] +
          3 * u * u * t * p1[1] +
          3 * u * t * t * p2[1] +
          t * t * t * p3[1];
        const dir = i % 2 === 0 ? 1 : -1;
        return (
          <line
            key={`ls-${i}`}
            x1={x - 5}
            y1={y - 3 * dir}
            x2={x + 5}
            y2={y + 3 * dir}
            stroke="#8B1A2B"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        );
      },
    )}
    {/* Right stitches */}
    {[0.09, 0.18, 0.27, 0.36, 0.45, 0.55, 0.64, 0.73, 0.82, 0.91].map(
      (t, i) => {
        const p0 = [180, 38];
        const p1 = [145, 78];
        const p2 = [145, 158];
        const p3 = [180, 198];
        const u = 1 - t;
        const x =
          u * u * u * p0[0] +
          3 * u * u * t * p1[0] +
          3 * u * t * t * p2[0] +
          t * t * t * p3[0];
        const y =
          u * u * u * p0[1] +
          3 * u * u * t * p1[1] +
          3 * u * t * t * p2[1] +
          t * t * t * p3[1];
        const dir = i % 2 === 0 ? 1 : -1;
        return (
          <line
            key={`rs-${i}`}
            x1={x - 5}
            y1={y - 3 * dir}
            x2={x + 5}
            y2={y + 3 * dir}
            stroke="#8B1A2B"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        );
      },
    )}
  </svg>
);

// ── Draft icon SVG ─────────────────────────────────────────────────────────

const DraftIcon: React.FC = () => (
  <svg
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <rect
      x="9"
      y="3"
      width="6"
      height="4"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.8"
    />
    <path
      d="M9 12h6M9 16h4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const StatsIcon: React.FC = () => (
  <svg
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M18 20V10M12 20V4M6 20v-6"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ArrowRight: React.FC = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M5 12h14M13 6l6 6-6 6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ── Game card ──────────────────────────────────────────────────────────────

interface GameDef {
  id: MinigameId;
  title: string;
  tag: string;
  desc: string;
  accent: 'navy' | 'seam';
  icon: React.ReactNode;
  stat: { label: string; value: string };
  meta: string[];
  cta: string;
}

const GAME_TEMPLATES: Omit<GameDef, 'stat'>[] = [
  {
    id: 'season-draft',
    title: 'Season Draft',
    tag: 'Multiplayer · 2–6 players',
    desc: 'Draft hitters or pitchers across eras. Pick the right season, fill your roster, rack up the counting stats. Last one standing with the biggest number wins.',
    accent: 'navy',
    icon: <DraftIcon />,
    meta: ['Pick your stat: HR · SO · RBI · W', 'Season or Career-w/-Team'],
    cta: 'Enter Lobby',
  },
  {
    id: 'disclosure',
    title: 'Who Am I?',
    tag: 'Solo · 2–3 min',
    desc: 'Clues drop one at a time — birthplace, era, quirks, milestones. Name the player with the fewest clues revealed for a higher score.',
    accent: 'seam',
    icon: <StatsIcon />,
    meta: ['7 clues per player', 'Hall of Famers to deep cuts'],
    cta: 'Play Now',
  },
  {
    id: 'twenty-questions',
    title: '20 Questions',
    tag: 'Solo · 3–5 min',
    desc: 'Ask up to 20 yes/no questions to identify the mystery player. Fewer questions = more tokens. Pick your difficulty and start swinging.',
    accent: 'navy',
    icon: <StatsIcon />,
    meta: ['Up to 20 questions', 'Easy · Medium · Hard'],
    cta: 'Play Now',
  },
];

const GameCard: React.FC<{ game: GameDef; onPress: () => void }> = ({
  game,
  onPress,
}) => {
  const iconBg =
    game.accent === 'navy'
      ? withAlpha(BRAND_NAVY, 0.55)
      : withAlpha(BRAND_SEAM_RED, 0.2);
  const iconBorder =
    game.accent === 'navy'
      ? withAlpha('#4E8ED6', 0.3)
      : withAlpha(BRAND_SEAM_RED, 0.4);
  const cardAccentGradient =
    game.accent === 'navy'
      ? `radial-gradient(ellipse at 90% 0%, ${withAlpha(BRAND_NAVY, 0.55)} 0%, transparent 55%)`
      : `radial-gradient(ellipse at 90% 0%, ${withAlpha(BRAND_SEAM_RED, 0.35)} 0%, transparent 55%)`;

  return (
    <button
      onClick={onPress}
      style={{
        textAlign: 'left',
        background: SURFACE_CARD,
        border: `1px solid ${withAlpha('#ffffff', 0.08)}`,
        borderRadius: 16,
        padding: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        cursor: 'pointer',
        transition: 'all 240ms ease',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 360,
        color: '#F5F7FA',
        fontFamily: 'inherit',
        flex: 1,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.transform = 'translateY(-4px)';
        el.style.borderColor = withAlpha(BRAND_GOLD, 0.5);
        el.style.boxShadow = '0 20px 60px rgba(0,0,0,0.5)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.transform = '';
        el.style.borderColor = withAlpha('#ffffff', 0.08);
        el.style.boxShadow = '';
      }}
    >
      {/* Accent gradient overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: cardAccentGradient,
          opacity: 0.55,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          flex: 1,
        }}
      >
        {/* Top row: icon + tag */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: iconBg,
              border: `1px solid ${iconBorder}`,
              color: game.accent === 'navy' ? '#8FB4E8' : BRAND_SEAM_RED_LIGHT,
            }}
          >
            {game.icon}
          </div>
          <div
            style={{
              fontFamily:
                'var(--font-display, "Big Shoulders Display", sans-serif)',
              fontWeight: 700,
              fontSize: 10.5,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#9CAAC5',
              padding: '6px 11px',
              borderRadius: 9999,
              background: withAlpha('#ffffff', 0.04),
              border: `1px solid ${withAlpha('#ffffff', 0.1)}`,
            }}
          >
            {game.tag}
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            fontFamily:
              'var(--font-display, "Big Shoulders Display", sans-serif)',
            fontWeight: 800,
            fontSize: 44,
            lineHeight: 1,
            letterSpacing: '-0.02em',
            color: '#F8FAFC',
          }}
        >
          {game.title}
        </div>

        {/* Description */}
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.55,
            color: '#9CAAC5',
            margin: 0,
            maxWidth: '48ch',
          }}
        >
          {game.desc}
        </p>

        {/* Meta list */}
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {game.meta.map((m) => (
            <li
              key={m}
              style={{
                fontFamily: 'inherit',
                fontSize: 13,
                color: '#7A8BAA',
                paddingLeft: 18,
                position: 'relative',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 9,
                  width: 8,
                  height: 1,
                  background: BRAND_GOLD,
                  display: 'block',
                }}
              />
              {m}
            </li>
          ))}
        </ul>

        {/* Footer: stat + CTA */}
        <div
          style={{
            marginTop: 'auto',
            paddingTop: 16,
            borderTop: `1px dashed ${withAlpha('#ffffff', 0.1)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontFamily:
                  'var(--font-display, "Big Shoulders Display", sans-serif)',
                fontWeight: 800,
                fontSize: 26,
                color: BRAND_GOLD_LIGHT,
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {game.stat.value}
            </div>
            <div
              style={{
                fontFamily:
                  'var(--font-display, "Big Shoulders Display", sans-serif)',
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#7A8BAA',
                marginTop: 4,
              }}
            >
              {game.stat.label}
            </div>
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontFamily:
                'var(--font-display, "Big Shoulders Display", sans-serif)',
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: BRAND_GOLD_LIGHT,
              padding: '10px 16px',
              borderRadius: 9999,
              background: withAlpha(BRAND_GOLD, 0.08),
              border: `1px solid ${withAlpha(BRAND_GOLD, 0.35)}`,
            }}
          >
            {game.cta}
            <ArrowRight />
          </div>
        </div>
      </div>
    </button>
  );
};

// ── Main component ─────────────────────────────────────────────────────────

export const MinigamesHub: React.FC<MinigamesHubProps> = ({ onNavigate }) => {
  const {
    data: sdGamesData,
    loading: sdLoading,
    error: sdError,
  } = useGetSeasonDraftGamesQuery();
  const { data: bestScoreData } = useGetDisclosureGameBestScoreQuery();
  const { data: minigamesStatsData } = useGetMinigamesStatsQuery();

  // Count only in-progress games (setup or drafting).
  // Show "—" while loading or if the query errored; show "0" for a successful
  // empty result so the user can distinguish "still loading" from "no games".
  const activeGamesCount =
    sdLoading || sdError
      ? null
      : (sdGamesData?.seasonDraftGames?.filter(
          (g) =>
            g.status === SeasonDraftGameStatus.Setup ||
            g.status === SeasonDraftGameStatus.Drafting,
        ).length ?? 0);

  const bestScore = bestScoreData?.disclosureGameBestScore ?? null;
  const dbStats = minigamesStatsData?.minigamesStats;

  const statFor = (id: MinigameId): GameDef['stat'] => {
    switch (id) {
      case 'season-draft':
        return {
          label: 'Games Active',
          value: activeGamesCount !== null ? String(activeGamesCount) : '—',
        };
      case 'disclosure':
        return {
          label: 'Your Best',
          value: bestScore !== null ? String(bestScore) : '—',
        };
      case 'twenty-questions':
        return { label: 'Questions', value: '20' };
    }
  };

  const games: GameDef[] = GAME_TEMPLATES.map((template) => ({
    ...template,
    stat: statFor(template.id),
  }));

  const heroStats: Array<{ n: string; l: string } | null> = [
    {
      n:
        dbStats?.playerSeasons != null
          ? `${(dbStats.playerSeasons / 1_000_000).toFixed(1)}M`
          : '—',
      l: 'Player-Seasons',
    },
    null,
    {
      n: dbStats?.earliestYear != null ? String(dbStats.earliestYear) : '—',
      l: 'Earliest Record',
    },
    null,
    {
      n:
        dbStats?.playersTracked != null
          ? `${dbStats.playersTracked.toLocaleString()}+`
          : '—',
      l: 'Players Tracked',
    },
  ];

  return (
    <div
      style={{
        maxWidth: 1280,
        width: '100%',
        alignSelf: 'center',
        padding: '32px 20px 80px',
        margin: '0 auto',
      }}
    >
      {/* ── Hero section ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 260px',
          gap: 40,
          alignItems: 'center',
          padding: '48px 44px',
          marginBottom: 28,
          background: [
            `radial-gradient(ellipse at 85% 30%, ${withAlpha(BRAND_GOLD, 0.12)} 0%, transparent 55%)`,
            `linear-gradient(135deg, ${withAlpha(BRAND_NAVY, 0.45)} 0%, ${withAlpha('#111B2F', 0.3)} 50%, transparent 100%)`,
            SURFACE_CARD,
          ].join(', '),
          border: `1px solid ${withAlpha(BRAND_GOLD, 0.22)}`,
          borderRadius: 24,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle horizontal line pattern */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '100% 28px',
            maskImage:
              'linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Eyebrow */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: BRAND_GOLD,
                boxShadow: `0 0 0 3px ${withAlpha(BRAND_GOLD, 0.22)}`,
              }}
            />
            <div style={{ ...EYEBROW_STYLE, color: BRAND_GOLD_LIGHT }}>
              Minigames · Off-Season
            </div>
          </div>

          {/* H1 */}
          <div
            style={{
              fontFamily:
                'var(--font-display, "Big Shoulders Display", sans-serif)',
              fontWeight: 800,
              fontSize: 'clamp(38px, 6vw, 64px)',
              lineHeight: 0.98,
              letterSpacing: '-0.025em',
              color: '#F8FAFC',
              margin: '16px 0 18px',
              maxWidth: '18ch',
            }}
          >
            The game doesn't stop
            <br />
            <span
              style={{
                color: BRAND_GOLD_LIGHT,
                fontStyle: 'italic',
                fontFamily: 'Literata, serif',
                fontWeight: 400,
                letterSpacing: '-0.01em',
              }}
            >
              when the season does.
            </span>
          </div>

          {/* Lede */}
          <p
            style={{
              fontFamily: 'inherit',
              fontSize: 17,
              lineHeight: 1.55,
              color: '#9CAAC5',
              maxWidth: '52ch',
              margin: '0 0 24px',
            }}
          >
            Quick-draft showdowns and trivia built on 150 years of archived
            statistics. Play with friends or solo against the record book.
          </p>

          {/* Stats row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 22,
              flexWrap: 'wrap',
              paddingTop: 20,
              borderTop: `1px solid ${withAlpha('#ffffff', 0.08)}`,
            }}
          >
            {heroStats.map((item, i) =>
              item === null ? (
                <div
                  key={i}
                  style={{
                    width: 1,
                    height: 34,
                    background: withAlpha('#ffffff', 0.1),
                  }}
                />
              ) : (
                <div key={i}>
                  <div
                    style={{
                      fontFamily:
                        'var(--font-display, "Big Shoulders Display", sans-serif)',
                      fontWeight: 800,
                      fontSize: 24,
                      color: '#F8FAFC',
                      lineHeight: 1,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {item.n}
                  </div>
                  <div
                    style={{
                      fontFamily:
                        'var(--font-display, "Big Shoulders Display", sans-serif)',
                      fontWeight: 700,
                      fontSize: 10.5,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: '#7A8BAA',
                      marginTop: 6,
                    }}
                  >
                    {item.l}
                  </div>
                </div>
              ),
            )}
          </div>
        </div>

        {/* Baseball artwork */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            width: '100%',
            maxWidth: 220,
            justifySelf: 'end',
          }}
        >
          <BaseballMark />
        </div>
      </div>

      {/* ── Game cards ── */}
      <div
        style={{ display: 'flex', gap: 18, marginBottom: 32, flexWrap: 'wrap' }}
      >
        {games.map((g) => (
          <GameCard key={g.id} game={g} onPress={() => onNavigate(g.id)} />
        ))}
      </div>

      {/* ── Coming soon footer ── */}
      <div
        style={{
          background: withAlpha('#ffffff', 0.02),
          border: `1px dashed ${withAlpha('#ffffff', 0.1)}`,
          borderRadius: 12,
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontFamily:
                'var(--font-display, "Big Shoulders Display", sans-serif)',
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#7A8BAA',
            }}
          >
            Coming Soon
          </div>
          <div
            style={{
              fontFamily:
                'var(--font-display, "Big Shoulders Display", sans-serif)',
              fontWeight: 700,
              fontSize: 16,
              color: '#9CAAC5',
              marginTop: 4,
              letterSpacing: '0.01em',
            }}
          >
            Trade Deadline · Pennant Picks · Box Score Quiz
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#4D5D80', fontStyle: 'italic' }}>
          Three more modes in the dugout. Winter is long.
        </div>
      </div>
    </div>
  );
};

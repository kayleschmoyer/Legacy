import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useInitializeMockDraftMutation } from '../../api/db/graphql.generated';
import { PremiumGate } from '../../components/PremiumGate';
import { useIsPremium } from '../../hooks/useIsPremium';
import { PageMeta } from '../../components/PageMeta';
import {
  BLACK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_SEAM_RED,
  EMERALD,
  GRADIENT_BOARD_BG,
  GRADIENT_GOLD,
  GRADIENT_SEAM_RED,
  GRADIENT_WHITE_CARD,
  OVERLAY_WHITE_10,
  SLATE_300,
  SLATE_400,
  SLATE_500,
  withAlpha,
} from '../../constants/colors';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MockDraftSettings {
  numTeams: number;
  rosterSize: number;
  userPickPosition: number;
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────

interface SetupScreenProps {
  onStart: (settings: MockDraftSettings) => void;
  loading?: boolean;
  error?: string | null;
}

function SetupScreen({
  onStart,
  loading = false,
  error = null,
}: SetupScreenProps): React.JSX.Element {
  const navigate = useNavigate();
  const [numTeams, setNumTeams] = React.useState(8);
  const [rosterSize, setRosterSize] = React.useState(10);
  const [userPickPosition, setUserPickPosition] = React.useState(1);

  const handleStart = () => {
    onStart({ numTeams, rosterSize, userPickPosition });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: GRADIENT_BOARD_BG,
        color: '#ffffff',
        fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div style={{ maxWidth: '560px', width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: withAlpha(BRAND_SEAM_RED, 0.15),
              border: `1px solid ${withAlpha(BRAND_SEAM_RED, 0.3)}`,
              borderRadius: '20px',
              padding: '6px 16px',
              marginBottom: '20px',
              fontSize: '12px',
              color: BRAND_SEAM_RED,
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
          >
            <span role="img" aria-label="Baseball">
              ⚾
            </span>{' '}
            Practice Mode
          </div>
          <h1
            style={{
              margin: '0 0 12px 0',
              fontSize: '36px',
              fontWeight: '800',
              background: GRADIENT_GOLD,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Mock Draft Simulator
          </h1>
          <p
            style={{
              margin: 0,
              color: SLATE_400,
              fontSize: '16px',
              lineHeight: 1.5,
            }}
          >
            Practice your draft strategy against AI opponents without affecting
            any real league.
          </p>
        </div>

        {/* Settings Card */}
        <div
          style={{
            background: GRADIENT_WHITE_CARD,
            borderRadius: '20px',
            padding: '32px',
            backdropFilter: 'blur(24px)',
            border: `1px solid ${OVERLAY_WHITE_10}`,
            boxShadow: `0 16px 64px ${withAlpha(BLACK, 0.4)}`,
          }}
        >
          {/* Teams */}
          <section
            aria-labelledby="teams-label"
            style={{ marginBottom: '28px' }}
          >
            <label
              id="teams-label"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: '600',
                color: SLATE_300,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                marginBottom: '12px',
              }}
            >
              Number of Teams
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[4, 6, 8, 10, 12].map((n) => (
                <button
                  key={n}
                  aria-pressed={numTeams === n}
                  onClick={() => {
                    setNumTeams(n);
                    if (userPickPosition > n) setUserPickPosition(n);
                  }}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '10px',
                    border: `2px solid ${numTeams === n ? BRAND_SEAM_RED : OVERLAY_WHITE_10}`,
                    background:
                      numTeams === n
                        ? withAlpha(BRAND_SEAM_RED, 0.15)
                        : 'transparent',
                    color: numTeams === n ? '#ffffff' : SLATE_400,
                    fontSize: '15px',
                    fontWeight: numTeams === n ? '700' : '400',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </section>

          {/* Rounds / Roster Size */}
          <section
            aria-labelledby="roster-label"
            style={{ marginBottom: '28px' }}
          >
            <label
              id="roster-label"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: '600',
                color: SLATE_300,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                marginBottom: '12px',
              }}
            >
              Rounds (Roster Size)
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[5, 8, 10, 15].map((n) => (
                <button
                  key={n}
                  aria-pressed={rosterSize === n}
                  onClick={() => setRosterSize(n)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '10px',
                    border: `2px solid ${rosterSize === n ? EMERALD : OVERLAY_WHITE_10}`,
                    background:
                      rosterSize === n
                        ? withAlpha(EMERALD, 0.15)
                        : 'transparent',
                    color: rosterSize === n ? '#ffffff' : SLATE_400,
                    fontSize: '15px',
                    fontWeight: rosterSize === n ? '700' : '400',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </section>

          {/* Draft Position */}
          <section
            aria-labelledby="pick-label"
            style={{ marginBottom: '36px' }}
          >
            <label
              id="pick-label"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: '600',
                color: SLATE_300,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                marginBottom: '12px',
              }}
            >
              Your Draft Position
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {Array.from({ length: numTeams }, (_, i) => i + 1).map((pos) => (
                <button
                  key={pos}
                  aria-pressed={userPickPosition === pos}
                  onClick={() => setUserPickPosition(pos)}
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    border: `2px solid ${userPickPosition === pos ? BRAND_GOLD : OVERLAY_WHITE_10}`,
                    background:
                      userPickPosition === pos
                        ? withAlpha(BRAND_GOLD, 0.2)
                        : 'transparent',
                    color:
                      userPickPosition === pos ? BRAND_GOLD_LIGHT : SLATE_400,
                    fontSize: '15px',
                    fontWeight: userPickPosition === pos ? '700' : '400',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {pos}
                </button>
              ))}
            </div>
            <p
              style={{
                margin: '10px 0 0 0',
                fontSize: '12px',
                color: SLATE_500,
              }}
            >
              Snake draft — you pick{' '}
              {userPickPosition === 1
                ? 'first every odd round'
                : userPickPosition === numTeams
                  ? 'first every even round'
                  : `at position ${userPickPosition}`}
            </p>
          </section>

          {/* Actions */}
          {error && (
            <div
              style={{
                background: withAlpha(BRAND_SEAM_RED, 0.15),
                border: `1px solid ${withAlpha(BRAND_SEAM_RED, 0.4)}`,
                borderRadius: 8,
                padding: '10px 14px',
                color: BRAND_SEAM_RED,
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleStart}
              disabled={loading}
              style={{
                flex: 1,
                padding: '16px',
                borderRadius: '12px',
                border: 'none',
                background: GRADIENT_SEAM_RED,
                color: '#ffffff',
                fontSize: '17px',
                fontWeight: '700',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                boxShadow: `0 8px 24px ${withAlpha(BRAND_SEAM_RED, 0.4)}`,
                transition: 'transform 0.1s ease, box-shadow 0.1s ease',
              }}
              onMouseOver={(e) => {
                if (!loading)
                  (e.currentTarget as HTMLButtonElement).style.transform =
                    'translateY(-1px)';
              }}
              onMouseOut={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = '';
              }}
            >
              {loading ? (
                '⏳ Starting…'
              ) : (
                <>
                  <span role="img" aria-label="Start">
                    🚀
                  </span>{' '}
                  Start Mock Draft
                </>
              )}
            </button>
            <button
              onClick={() => navigate('/baseball')}
              style={{
                padding: '16px 24px',
                borderRadius: '12px',
                border: `1px solid ${OVERLAY_WHITE_10}`,
                background: 'transparent',
                color: SLATE_400,
                fontSize: '15px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Info line */}
        <p
          style={{
            textAlign: 'center',
            fontSize: '12px',
            color: SLATE_500,
            marginTop: '20px',
          }}
        >
          Mock drafts don't affect any real leagues • AI opponents use ADP-based
          strategy
        </p>
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function MockDraftPage(): React.JSX.Element {
  const navigate = useNavigate();
  const isPremium = useIsPremium();
  const [initializeMockDraft, { loading, error }] =
    useInitializeMockDraftMutation();

  const handleStart = async (s: MockDraftSettings) => {
    const result = await initializeMockDraft({
      variables: {
        numTeams: s.numTeams,
        rosterSize: s.rosterSize,
        userPickPosition: s.userPickPosition,
        pickTimeLimitSeconds: 90,
      },
    });
    const leagueId = result.data?.initializeMockDraft?.leagueId;
    if (leagueId) {
      navigate(`/baseball/league/${leagueId}/draft`);
    }
  };

  return (
    <PremiumGate
      isPremium={isPremium}
      featureName="Mock Draft Simulator"
      featureDescription="Practice your draft strategy with the full Mock Draft simulator before the real draft."
    >
      <PageMeta
        title="Mock Draft Simulator"
        description="Practice your fantasy baseball draft strategy risk-free with the full Mock Draft simulator."
      />
      <SetupScreen
        onStart={(s) => {
          void handleStart(s);
        }}
        loading={loading}
        error={error?.message ?? null}
      />
    </PremiumGate>
  );
}

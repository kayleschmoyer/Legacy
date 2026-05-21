import React, { useState } from 'react';
import { YStack } from 'tamagui';
import { Platform } from 'react-native';
import { useAuth } from '@legacy-sports/shared-components/auth';
import { LOGGER } from '@legacy-sports/logging';
import { useDeleteAllLeaguesMutation } from '../../api/db/graphql.generated';
import {
  BG_DARK,
  BORDER_STRONG,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  BRAND_SEAM_RED_DARK,
  BRAND_SEAM_RED_LIGHT,
  PANEL_BORDER,
  SURFACE_CARD,
  TEXT_INTERFACE,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
} from '../../constants/colors';

const FONT_DISPLAY = "'Big Shoulders Display', system-ui, sans-serif";
const FONT_BODY = "'Literata', Georgia, serif";

const EASE_STANDARD = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const FG_STRONG = '#FFFFFF';
const FG2 = '#DEE6FF';

type DialogStep = 'none' | 'confirm1' | 'confirm2' | 'deleting';

export const LeagueManagement: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.accessLevel === 'admin';
  const [dialog, setDialog] = useState<DialogStep>('none');
  const [liveMsg, setLiveMsg] = useState('');
  const [showError, setShowError] = useState(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [deleteAllLeagues, { loading, error }] = useDeleteAllLeaguesMutation();
  const isBusy = loading || dialog === 'deleting';

  const openConfirm1 = () => {
    setDialog('confirm1');
    setLiveMsg('Delete all leagues dialog opened.');
  };
  const goConfirm2 = () => {
    setDialog('confirm2');
    setLiveMsg('Final confirmation dialog opened.');
  };
  const cancelDialog = () => {
    setDialog('none');
    setLiveMsg('Dialog cancelled.');
  };

  const handleFinalConfirm = () => {
    setDialog('deleting');
    setLiveMsg('Deleting all leagues has started.');
    void deleteAllLeagues({
      refetchQueries: ['GetUserLeagues'],
      awaitRefetchQueries: true,
    })
      .then(() => {
        setDialog('none');
        setShowError(false);
        setSuccessMsg('All leagues have been deleted successfully.');
        setLiveMsg('All leagues deleted successfully.');
        LOGGER.info('deleteAllLeagues mutation succeeded');
      })
      .catch((err: Error) => {
        setDialog('none');
        setShowError(true);
        setLiveMsg('Unable to delete leagues. See the error card for details.');
        LOGGER.error('deleteAllLeagues mutation failed', err);
      });
  };

  const adminWarning = (
    <>
      <strong style={{ fontWeight: 600, color: FG_STRONG }}>
        All leagues you are a member of will be deleted
      </strong>{' '}
      — both the leagues you own and the leagues you have joined. As an admin,
      this purge is absolute and applies across every era and division on your
      account.
    </>
  );
  const memberWarning = (
    <>
      <strong style={{ fontWeight: 600, color: FG_STRONG }}>
        Only leagues you own will be deleted.
      </strong>{' '}
      Leagues you have joined as a manager but do not own will remain intact —
      your spot in those leagues stays open.
    </>
  );

  return (
    <>
      {Platform.OS === 'web' && (
        <style>{`
          @keyframes lm-spin { to { transform: rotate(360deg); } }
          @keyframes lm-fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
          .lm-page { animation: lm-fadeIn 280ms ${EASE_STANDARD} both; }
          .lm-spinner {
            width: 14px; height: 14px; border-radius: 50%;
            border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff;
            animation: lm-spin 800ms linear infinite;
            display: inline-block;
          }
          .lm-btn {
            font-family: ${FONT_DISPLAY};
            font-weight: 700; font-size: 13px; letter-spacing: 0.1em;
            text-transform: uppercase;
            padding: 12px 22px; min-height: 44px;
            border-radius: 12px; border: 1px solid transparent;
            cursor: pointer;
            display: inline-flex; align-items: center; justify-content: center; gap: 10px;
            transition: background-color 150ms ${EASE_STANDARD}, color 150ms ${EASE_STANDARD}, border-color 150ms ${EASE_STANDARD}, transform 150ms ${EASE_STANDARD};
          }
          .lm-btn-danger {
            background: ${BRAND_SEAM_RED}; color: #fff;
            border-color: ${BRAND_SEAM_RED_LIGHT};
          }
          .lm-btn-danger:hover:not(:disabled) { background: ${BRAND_SEAM_RED_LIGHT}; transform: translateY(-1px); }
          .lm-btn-danger:active:not(:disabled) { transform: scale(0.98); }
          .lm-btn-danger:disabled { background: ${BRAND_SEAM_RED_DARK}; border-color: ${BRAND_SEAM_RED_DARK}; opacity: 0.7; cursor: not-allowed; }
          .lm-btn-ghost {
            background: transparent; color: ${FG2}; border-color: ${BORDER_STRONG};
          }
          .lm-btn-ghost:hover:not(:disabled) { color: ${FG_STRONG}; border-color: ${TEXT_TERTIARY}; background: rgba(255,255,255,0.03); }
          .lm-btn-ghost:active:not(:disabled) { transform: scale(0.98); }
          .lm-btn:focus-visible { outline: 2px solid ${BRAND_GOLD_LIGHT}; outline-offset: 2px; }
          @media (prefers-reduced-motion: reduce) {
            .lm-page { animation: none; }
            .lm-spinner { animation: none; border-top-color: rgba(255,255,255,0.7); }
            .lm-btn { transition: none; }
            .lm-btn-danger:hover { transform: none; }
          }
        `}</style>
      )}

      <YStack
        flex={1}
        style={{ backgroundColor: BG_DARK, width: '100%' }}
        ai="center"
        // a11y: hide page content from AT while the modal dialog is open so screen
        // readers don't traverse content behind the overlay.
        aria-hidden={dialog !== 'none' ? true : undefined}
      >
        <main
          className="lm-page"
          style={{
            width: '100%',
            maxWidth: 880,
            padding: '40px 24px 80px',
            fontFamily: FONT_BODY,
            color: TEXT_INTERFACE,
            boxSizing: 'border-box',
          }}
        >
          {/* Breadcrumb */}
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: TEXT_TERTIARY,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <span style={{ color: TEXT_SECONDARY }}>Settings</span>
            <span style={{ color: TEXT_TERTIARY }}>/</span>
            <span>Management</span>
          </div>

          {/* Page head */}
          <header
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              marginBottom: 32,
              paddingBottom: 24,
              borderBottom: `1px solid ${PANEL_BORDER}`,
            }}
          >
            <h1
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 800,
                fontSize: 'clamp(32px, 5vw, 44px)',
                lineHeight: 1.05,
                letterSpacing: '-0.015em',
                color: FG_STRONG,
                margin: 0,
              }}
            >
              League Management
            </h1>
            <p
              style={{
                fontFamily: FONT_BODY,
                fontSize: 16,
                lineHeight: 1.55,
                color: TEXT_SECONDARY,
                maxWidth: '70ch',
                margin: 0,
              }}
            >
              Manage your leagues and data. Destructive operations are gated
              behind a two-step confirmation.
            </p>
          </header>

          {/* Screen-reader live region */}
          <div
            aria-live="polite"
            aria-atomic="true"
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
              border: 0,
            }}
          >
            {liveMsg}
          </div>

          {/* Card stack */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Success inline card */}
            {successMsg && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  background: `linear-gradient(180deg, rgba(197,165,90,0.16) 0%, rgba(197,165,90,0.04) 100%), ${SURFACE_CARD}`,
                  border: `1px solid ${BRAND_GOLD_LIGHT}`,
                  borderRadius: 12,
                  padding: '14px 18px',
                  display: 'flex',
                  gap: 14,
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 700,
                      fontSize: 14,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: BRAND_GOLD_LIGHT,
                      margin: '0 0 4px',
                    }}
                  >
                    Leagues deleted
                  </p>
                  <p
                    style={{
                      fontFamily: FONT_BODY,
                      fontSize: 14,
                      lineHeight: 1.5,
                      color: FG2,
                      margin: 0,
                    }}
                  >
                    {successMsg}
                  </p>
                </div>
                <button
                  type="button"
                  className="lm-btn lm-btn-ghost"
                  style={{ padding: '8px 14px', minHeight: 36, fontSize: 11 }}
                  onClick={() => setSuccessMsg(null)}
                >
                  Dismiss
                </button>
              </div>
            )}
            {/* Error inline card */}
            {error && showError && (
              <div
                role="alert"
                aria-live="assertive"
                style={{
                  background: `linear-gradient(180deg, rgba(196,30,58,0.18) 0%, rgba(196,30,58,0.06) 100%), ${SURFACE_CARD}`,
                  border: `1px solid ${BRAND_SEAM_RED}`,
                  borderRadius: 12,
                  padding: '16px 20px',
                  display: 'flex',
                  gap: 14,
                  alignItems: 'flex-start',
                  boxShadow: `0 0 0 1px rgba(196,30,58,0.35), 0 6px 24px rgba(196,30,58,0.2)`,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: BRAND_SEAM_RED,
                    color: '#fff',
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AlertCircleIcon size={18} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 700,
                      fontSize: 14,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: FG_STRONG,
                      margin: '0 0 4px',
                    }}
                  >
                    Unable to delete leagues
                  </p>
                  <p
                    style={{
                      fontFamily: FONT_BODY,
                      fontSize: 14,
                      lineHeight: 1.5,
                      color: FG2,
                      margin: 0,
                      maxWidth: '70ch',
                    }}
                  >
                    {error.message ||
                      'The server returned an error while processing your request. Your leagues are still intact. Try again, or contact your commissioner if the problem persists.'}
                  </p>
                  <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      className="lm-btn lm-btn-ghost"
                      style={{
                        padding: '8px 14px',
                        minHeight: 36,
                        fontSize: 11,
                      }}
                      onClick={() => setShowError(false)}
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      className="lm-btn lm-btn-danger"
                      style={{
                        padding: '8px 14px',
                        minHeight: 36,
                        fontSize: 11,
                      }}
                      onClick={openConfirm1}
                      disabled={isBusy}
                    >
                      Retry
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Danger Zone card */}
            <section
              aria-labelledby="lm-danger-title"
              style={{
                background: `linear-gradient(180deg, rgba(196,30,58,0.06) 0%, rgba(196,30,58,0.02) 100%), ${SURFACE_CARD}`,
                border: `1px solid rgba(196,30,58,0.45)`,
                borderRadius: 16,
                boxShadow: `0 0 0 1px rgba(196,30,58,0.35), 0 6px 24px rgba(196,30,58,0.2)`,
                overflow: 'hidden',
              }}
            >
              <header
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '22px 24px 14px',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: 'rgba(196,30,58,0.15)',
                    border: '1px solid rgba(196,30,58,0.4)',
                    color: BRAND_SEAM_RED_LIGHT,
                  }}
                >
                  <AlertTriangleIcon size={22} />
                </span>
                <div>
                  <span
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 700,
                      fontSize: 11,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: BRAND_SEAM_RED_LIGHT,
                    }}
                  >
                    Irreversible
                  </span>
                  <h2
                    id="lm-danger-title"
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 800,
                      fontSize: 22,
                      lineHeight: 1.1,
                      letterSpacing: '0.01em',
                      color: FG_STRONG,
                      margin: 0,
                      textTransform: 'uppercase',
                    }}
                  >
                    Danger Zone
                  </h2>
                </div>
              </header>
              <div style={{ padding: '8px 24px 24px' }}>
                <p
                  style={{
                    fontFamily: FONT_BODY,
                    fontSize: 16,
                    lineHeight: 1.6,
                    color: FG2,
                    maxWidth: '70ch',
                    margin: '0 0 18px',
                  }}
                >
                  {isAdmin ? adminWarning : memberWarning}
                </p>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 14,
                    marginTop: 24,
                    paddingTop: 20,
                    borderTop: `1px solid ${PANEL_BORDER}`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: FONT_BODY,
                      fontSize: 13,
                      color: TEXT_SECONDARY,
                      marginRight: 'auto',
                    }}
                  >
                    This action triggers a two-step confirmation.
                  </span>
                  <button
                    type="button"
                    className="lm-btn lm-btn-danger"
                    onClick={openConfirm1}
                    disabled={isBusy}
                    aria-busy={isBusy}
                  >
                    {isBusy ? (
                      <span className="lm-spinner" aria-hidden="true" />
                    ) : (
                      <TrashIcon size={16} />
                    )}
                    {isBusy ? 'Deleting…' : 'Delete All Leagues'}
                  </button>
                </div>
              </div>
            </section>

            {/* Information card */}
            <section
              aria-labelledby="lm-info-title"
              style={{
                background: `linear-gradient(180deg, rgba(27,58,92,0.10) 0%, rgba(27,58,92,0.02) 100%), ${SURFACE_CARD}`,
                border: `1px solid rgba(44,74,124,0.5)`,
                borderRadius: 16,
                boxShadow: '0 4px 14px rgba(8,12,20,0.55)',
                overflow: 'hidden',
              }}
            >
              <header
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '22px 24px 14px',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: 'rgba(27,58,92,0.45)',
                    border: `1px solid ${BRAND_NAVY_LIGHT}`,
                    color: BRAND_GOLD_LIGHT,
                  }}
                >
                  <InfoIcon size={22} />
                </span>
                <div>
                  <span
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 700,
                      fontSize: 11,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: BRAND_GOLD_LIGHT,
                    }}
                  >
                    What gets deleted
                  </span>
                  <h2
                    id="lm-info-title"
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 800,
                      fontSize: 22,
                      lineHeight: 1.1,
                      letterSpacing: '0.01em',
                      color: FG_STRONG,
                      margin: 0,
                      textTransform: 'uppercase',
                    }}
                  >
                    Information
                  </h2>
                </div>
              </header>
              <div style={{ padding: '8px 24px 24px' }}>
                <ConsequenceList isAdmin={!!isAdmin} />
              </div>
            </section>
          </div>
        </main>
      </YStack>

      {dialog !== 'none' && (
        <DeleteDialog
          step={dialog}
          isAdmin={!!isAdmin}
          onCancel={cancelDialog}
          onContinue={goConfirm2}
          onConfirm={handleFinalConfirm}
        />
      )}
    </>
  );
};

interface ConsequenceListProps {
  isAdmin: boolean;
}
const ConsequenceList: React.FC<ConsequenceListProps> = ({ isAdmin }) => {
  const scopeItem = isAdmin
    ? 'All leagues you are a member of (owned or joined)'
    : 'All leagues you own';
  const items = [
    scopeItem,
    'All teams in those leagues',
    'All roster data — drafted players, lineups, bench',
    'All league positions and standings history',
    'All league members and invitations',
  ];
  return (
    <ul
      style={{
        margin: 0,
        padding: 0,
        listStyle: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {items.map((label) => (
        <li
          key={label}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            fontFamily: FONT_BODY,
            fontSize: 15,
            lineHeight: 1.5,
            color: FG2,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              flexShrink: 0,
              width: 18,
              height: 18,
              marginTop: 2,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: BRAND_SEAM_RED_LIGHT,
            }}
          >
            <ChevronIcon size={14} />
          </span>
          {label}
        </li>
      ))}
      <li
        key="positive-recovery"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          fontFamily: FONT_BODY,
          fontSize: 15,
          lineHeight: 1.5,
          paddingTop: 10,
          marginTop: 6,
          borderTop: `1px solid ${PANEL_BORDER}`,
          color: BRAND_GOLD_LIGHT,
          fontStyle: 'italic',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            flexShrink: 0,
            width: 18,
            height: 18,
            marginTop: 2,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: BRAND_GOLD,
          }}
        >
          <RotateCwIcon size={14} />
        </span>
        You can create new leagues after deletion
      </li>
    </ul>
  );
};

interface DeleteDialogProps {
  step: Exclude<DialogStep, 'none'>;
  isAdmin: boolean;
  onCancel: () => void;
  onContinue: () => void;
  onConfirm: () => void;
}
const DeleteDialog: React.FC<DeleteDialogProps> = ({
  step,
  isAdmin,
  onCancel,
  onContinue,
  onConfirm,
}) => {
  const isFinal = step === 'confirm2' || step === 'deleting';
  const isDeleting = step === 'deleting';

  // Trap basic escape-to-cancel
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isDeleting, onCancel]);

  const title =
    step === 'confirm1'
      ? 'Are you sure?'
      : step === 'confirm2'
        ? 'This cannot be undone.'
        : 'Deleting your leagues…';

  const body =
    step === 'confirm1' ? (
      <p style={dialogBodyText}>
        You&rsquo;re about to delete{' '}
        {isAdmin ? 'all leagues you are a member of' : 'all leagues you own'}.
        This is the first of two confirmations.
      </p>
    ) : step === 'confirm2' ? (
      <p style={dialogBodyText}>
        Your leagues, rosters, and standings will be permanently removed. There
        is no recovery — not even from a backup.
      </p>
    ) : (
      <p style={dialogBodyText}>
        Hang tight. We&rsquo;re removing your teams, rosters, and standings.
        Don&rsquo;t close this window.
      </p>
    );

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) onCancel();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(8,12,20,0.72)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 1000,
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="lm-dlg-title"
        style={{
          width: '100%',
          maxWidth: 460,
          background: SURFACE_CARD,
          border: `1px solid ${BORDER_STRONG}`,
          borderRadius: 16,
          boxShadow: isFinal
            ? '0 20px 48px rgba(8,12,20,0.75), 0 0 0 1px rgba(196,30,58,0.4)'
            : '0 20px 48px rgba(8,12,20,0.75)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '28px 28px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'rgba(196,30,58,0.18)',
              border: '1px solid rgba(196,30,58,0.4)',
              color: BRAND_SEAM_RED_LIGHT,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {step === 'confirm1' ? (
              <AlertTriangleIcon size={22} />
            ) : (
              <TrashIcon size={22} />
            )}
          </span>
          <h3
            id="lm-dlg-title"
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 800,
              fontSize: 26,
              letterSpacing: '-0.005em',
              lineHeight: 1.15,
              color: FG_STRONG,
              margin: 0,
            }}
          >
            {title}
          </h3>
          {body}
          {step === 'confirm2' && (
            <div
              aria-label="Summary"
              style={{
                background: 'rgba(0,0,0,0.25)',
                border: `1px solid ${PANEL_BORDER}`,
                borderRadius: 10,
                padding: '12px 14px',
                fontFamily: FONT_BODY,
                fontSize: 13,
                color: TEXT_SECONDARY,
                lineHeight: 1.6,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <strong
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  color: TEXT_INTERFACE,
                  fontSize: 12,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                You will lose
              </strong>
              <span>
                ·{' '}
                {isAdmin
                  ? 'All leagues you are a member of (owned or joined)'
                  : 'All leagues you own'}
              </span>
              <span>· All teams, rosters, and lineups</span>
              <span>· All standings and league history</span>
            </div>
          )}
        </div>
        <div
          style={{
            padding: '18px 24px 24px',
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            borderTop: `1px solid ${PANEL_BORDER}`,
            marginTop: 16,
            background: 'rgba(0,0,0,0.15)',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="lm-btn lm-btn-ghost"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </button>
          {step === 'confirm1' && (
            <button
              type="button"
              className="lm-btn lm-btn-danger"
              onClick={onContinue}
              autoFocus
            >
              Continue
            </button>
          )}
          {step === 'confirm2' && (
            <button
              type="button"
              className="lm-btn lm-btn-danger"
              onClick={onConfirm}
              autoFocus
            >
              <TrashIcon size={16} />
              Yes, Delete Everything
            </button>
          )}
          {step === 'deleting' && (
            <button
              type="button"
              className="lm-btn lm-btn-danger"
              disabled
              aria-busy="true"
            >
              <span className="lm-spinner" aria-hidden="true" />
              Deleting…
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Icons (Lucide-style, 1.8 stroke) ────────────────────────────
interface IconProps {
  size?: number;
}
const baseIconProps = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const AlertTriangleIcon: React.FC<IconProps> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...baseIconProps}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const AlertCircleIcon: React.FC<IconProps> = ({ size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    {...baseIconProps}
    strokeWidth={2}
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);
const InfoIcon: React.FC<IconProps> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...baseIconProps}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);
const TrashIcon: React.FC<IconProps> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...baseIconProps}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
  </svg>
);
const ChevronIcon: React.FC<IconProps> = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    {...baseIconProps}
    strokeWidth={2.2}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const RotateCwIcon: React.FC<IconProps> = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    {...baseIconProps}
    strokeWidth={2}
  >
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

const dialogBodyText: React.CSSProperties = {
  fontFamily: FONT_BODY,
  fontSize: 15,
  lineHeight: 1.55,
  color: FG2,
  margin: 0,
  maxWidth: '60ch',
};

export default LeagueManagement;

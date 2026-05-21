import React, { useEffect, useState } from 'react';
import {
  type LeagueFragment,
  type TeamFragment,
  useGetTeamMembersQuery,
  useRenameTeamMutation,
  useUpdateTeamBrandingMutation,
} from '../../../../api/db/graphql.generated';
import { colorFromString, Empty, initialsFromName, Section } from '../Shared';
import { I } from '../Icons';

const PRESET_COLORS = [
  '#1B3A5C',
  '#C41E3A',
  '#2D6A4F',
  '#8B6F47',
  '#7C6CAE',
  '#C5A55A',
  '#0E7490',
  '#9F1239',
];

const normalizeColor = (c: string | null | undefined, fallback: string) => {
  if (!c) return fallback;
  return c.startsWith('#') ? c.toUpperCase() : c;
};

export interface TeamTabProps {
  league: LeagueFragment;
  myTeamId: number | null;
  myTeam: TeamFragment | null;
}

export const TeamTab: React.FC<TeamTabProps> = ({
  league,
  myTeamId,
  myTeam,
}) => {
  const { data: teamMembersData } = useGetTeamMembersQuery({
    variables: { teamId: myTeamId ?? 0 },
    skip: !myTeamId,
  });
  const teamMembers = teamMembersData?.teamMembers ?? [];

  const [name, setName] = useState(myTeam?.name ?? '');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [primaryColor, setPrimaryColor] = useState(
    normalizeColor(myTeam?.primaryColor, PRESET_COLORS[0]),
  );
  const [secondaryColor, setSecondaryColor] = useState(
    normalizeColor(myTeam?.secondaryColor, PRESET_COLORS[5]),
  );
  const [logoUrl, setLogoUrl] = useState(myTeam?.logoUrl ?? '');
  const [savedFlash, setSavedFlash] = useState<'name' | 'branding' | null>(
    null,
  );

  // When team data arrives or changes (different team selected), seed form values
  useEffect(() => {
    if (myTeam) {
      setName(myTeam.name ?? '');
      setPrimaryColor(normalizeColor(myTeam.primaryColor, PRESET_COLORS[0]));
      setSecondaryColor(
        normalizeColor(myTeam.secondaryColor, PRESET_COLORS[5]),
      );
      setLogoUrl(myTeam.logoUrl ?? '');
    }
  }, [
    myTeam?.id,
    myTeam?.name,
    myTeam?.primaryColor,
    myTeam?.secondaryColor,
    myTeam?.logoUrl,
    myTeam,
  ]);

  const [renameTeam, { loading: renaming }] = useRenameTeamMutation();
  const [updateBranding, { loading: savingBranding }] =
    useUpdateTeamBrandingMutation();

  const currentTeamName = myTeam?.name ?? '';
  const trimmedName = name.trim();
  const nameDirty = trimmedName.length > 0 && trimmedName !== currentTeamName;

  const requestRename = () => {
    if (!myTeamId || !nameDirty || !league.id) return;
    setConfirmOpen(true);
  };

  const onSaveName = async () => {
    if (!myTeamId || !nameDirty || !league.id) return;
    await renameTeam({
      variables: {
        teamId: myTeamId,
        leagueId: league.id,
        newName: trimmedName,
      },
    });
    setConfirmOpen(false);
    setSavedFlash('name');
    setTimeout(() => setSavedFlash(null), 1500);
  };
  const onSaveBranding = async () => {
    if (!myTeamId || !league.id) return;
    await updateBranding({
      variables: {
        teamId: myTeamId,
        leagueId: league.id,
        primaryColor,
        secondaryColor,
        logoUrl: logoUrl || null,
      },
    });
    setSavedFlash('branding');
    setTimeout(() => setSavedFlash(null), 1500);
  };

  useEffect(() => {
    setSavedFlash(null);
  }, [myTeamId]);

  if (!myTeamId) {
    return (
      <Empty
        icon={<I.User size={32} />}
        title="No team yet"
        sub="Join this league to manage your team profile."
      />
    );
  }

  const displayName = trimmedName || currentTeamName || 'My Team';
  const previewInitials = initialsFromName(displayName);
  const starterCount = teamMembers.filter((m) => m.positionId != null).length;
  const benchCount = teamMembers.filter((m) => m.positionId == null).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Section
        title="Team Identity"
        sub="How your team appears in standings, chat, and the draft room."
      >
        <div className="ls-field">
          <label htmlFor="team-name-input">Team Name</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              id="team-name-input"
              type="text"
              className="ls-input text"
              style={{
                flex: 1,
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 700,
              }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  requestRename();
                }
              }}
              placeholder="Enter a memorable name"
              maxLength={40}
            />
            <button
              type="button"
              className={`ls-btn ${savedFlash === 'name' ? 'ls-btn-gold' : 'ls-btn-primary'}`}
              onClick={requestRename}
              disabled={Boolean(renaming || !nameDirty)}
            >
              {savedFlash === 'name' ? (
                <>
                  <I.Check size={12} /> Saved
                </>
              ) : (
                <>
                  <I.Edit size={12} /> {renaming ? 'Saving…' : 'Save Name'}
                </>
              )}
            </button>
          </div>
          <span className="hint">
            Up to 40 characters · visible to your league.
          </span>
        </div>
      </Section>

      <Section
        title="Team Branding"
        sub="Pick the colors and logo your team wears all season."
      >
        <div className="ls-settings-grid">
          <div>
            <label
              className="eyebrow"
              style={{ display: 'block', marginBottom: 12 }}
            >
              Logo Preview
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                className={`ls-avatar xl ${colorFromString(displayName)}`}
                style={{ background: primaryColor }}
              >
                {previewInitials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: 15,
                    color: 'var(--fg1)',
                  }}
                >
                  {displayName}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    color: 'var(--fg3)',
                    marginTop: 2,
                  }}
                >
                  This is how your logo appears in standings.
                </div>
                <div
                  className="mono-item"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--fg4)',
                    marginTop: 8,
                  }}
                >
                  {starterCount} starters · {benchCount} bench
                </div>
              </div>
            </div>

            <div className="ls-field" style={{ marginTop: 20 }}>
              <label htmlFor="team-logo-input">Logo URL</label>
              <input
                id="team-logo-input"
                className="ls-input"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://…"
              />
              <span className="hint">Square image, served over HTTPS.</span>
            </div>
          </div>

          <div>
            <label
              className="eyebrow"
              style={{ display: 'block', marginBottom: 12 }}
            >
              Colors
            </label>
            <div className="ls-field">
              <label>Primary Color</label>
              <div className="ls-color-row">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Pick primary color ${c}`}
                    className={`ls-color-swatch ${primaryColor === c ? 'on' : ''}`}
                    style={{ background: c }}
                    onClick={() => setPrimaryColor(c)}
                  />
                ))}
              </div>
            </div>
            <div className="ls-field">
              <label>Secondary Color</label>
              <div className="ls-color-row">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Pick secondary color ${c}`}
                    className={`ls-color-swatch ${secondaryColor === c ? 'on' : ''}`}
                    style={{ background: c }}
                    onClick={() => setSecondaryColor(c)}
                  />
                ))}
              </div>
            </div>

            <div
              aria-label="Branding preview"
              style={{
                marginTop: 18,
                padding: 14,
                borderRadius: 'var(--radius-3)',
                background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}CC 60%, ${secondaryColor}22 100%)`,
                border: `1px solid ${secondaryColor}55`,
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: 12,
                  letterSpacing: '.12em',
                  textTransform: 'uppercase',
                  color: secondaryColor,
                }}
              >
                Preview
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: 24,
                  color: '#fff',
                  marginTop: 6,
                }}
              >
                {displayName}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'rgba(255,255,255,.7)',
                  marginTop: 4,
                }}
              >
                {starterCount} starters · {teamMembers.length} total
              </div>
            </div>

            <button
              type="button"
              className="ls-btn ls-btn-gold block"
              style={{ marginTop: 14 }}
              onClick={() => {
                void onSaveBranding();
              }}
              disabled={savingBranding}
            >
              {savedFlash === 'branding' ? (
                <>
                  <I.Check size={12} /> Saved
                </>
              ) : (
                <>
                  <I.Check size={12} />{' '}
                  {savingBranding ? 'Saving…' : 'Save Branding'}
                </>
              )}
            </button>
          </div>
        </div>
      </Section>

      {confirmOpen && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="rename-team-title"
          aria-describedby="rename-team-description"
          data-testid="rename-team-confirm"
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !renaming)
              setConfirmOpen(false);
          }}
        >
          <div
            style={{
              background: 'var(--bg1, #14202c)',
              border: '1px solid var(--fg5, #2a3a4c)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 480,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div
              id="rename-team-title"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--fg1-strong, #fff)',
              }}
            >
              Rename team?
            </div>
            <div
              id="rename-team-description"
              style={{ color: 'var(--fg2)', lineHeight: 1.5 }}
            >
              Rename <strong>{currentTeamName || 'this team'}</strong> to{' '}
              <strong>{trimmedName}</strong>?
            </div>
            <div
              style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}
            >
              <button
                type="button"
                className="ls-btn ls-btn-ghost"
                onClick={() => setConfirmOpen(false)}
                disabled={renaming}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ls-btn ls-btn-primary"
                onClick={() => {
                  void onSaveName();
                }}
                disabled={renaming}
              >
                {renaming ? 'Renaming…' : 'Rename'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

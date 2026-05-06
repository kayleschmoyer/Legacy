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

  // Initial values come from teamMembers data context — these mutations are best-effort
  const onSaveName = async () => {
    if (!myTeamId || !name.trim() || !league.id) return;
    await renameTeam({
      variables: {
        teamId: myTeamId,
        leagueId: league.id,
        newName: name.trim(),
      },
    });
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
    // Reset flash on tab navigation
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="ls-settings-grid">
        <Section
          title="Team Identity"
          sub="Your team name and manager identity"
        >
          <div className="ls-field">
            <label htmlFor="team-name-input">Team Name</label>
            <input
              id="team-name-input"
              type="text"
              className="ls-input text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a memorable name"
              maxLength={40}
            />
            <span className="hint">
              Up to 40 characters · visible to your league.
            </span>
          </div>
          <button
            type="button"
            className={`ls-btn ${savedFlash === 'name' ? 'ls-btn-gold' : 'ls-btn-primary'}`}
            onClick={() => {
              void onSaveName();
            }}
            disabled={Boolean(renaming || !name.trim())}
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
        </Section>

        <Section
          title="Roster Snapshot"
          sub={`${teamMembers.length} of ${league.maxRosterSize ?? '?'} players`}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              className={`ls-avatar xl ${colorFromString(name)}`}
              style={{ background: primaryColor }}
            >
              {initialsFromName(name || 'My Team')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="eyebrow">Active Roster</div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 28,
                  fontWeight: 800,
                  color: 'var(--fg1-strong)',
                }}
              >
                {teamMembers.filter((m) => m.positionId != null).length}
                <span style={{ color: 'var(--fg4)', fontSize: 16 }}>
                  {' '}
                  starters
                </span>
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  color: 'var(--fg3)',
                }}
              >
                {teamMembers.filter((m) => m.positionId == null).length} bench
              </div>
            </div>
          </div>
        </Section>
      </div>

      <Section
        title="Team Branding"
        sub="Pick the colors and logo your team wears all season"
      >
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
        <div className="ls-field">
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
        <button
          type="button"
          className={`ls-btn ${savedFlash === 'branding' ? 'ls-btn-gold' : 'ls-btn-primary'}`}
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
              <I.Settings size={12} />{' '}
              {savingBranding ? 'Saving…' : 'Save Branding'}
            </>
          )}
        </button>
      </Section>
    </div>
  );
};

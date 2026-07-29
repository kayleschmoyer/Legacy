import React, { useEffect, useRef, useState } from 'react';
import { useTeamBranding } from '@legacy-sports/shared-components';
import { KeeperDesignationPanel } from '@legacy-sports/shared-components/leagues';
import {
  type LeagueFragment,
  RosterContinuity,
  type TeamFragment,
  useGetTeamMembersQuery,
} from '@legacy-sports/graphql';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import { colorFromString, Empty, initialsFromName, Section } from '../Shared';
import { I } from '../Icons';
import { PremiumGate } from '../../../../components/PremiumGate';
import { useHasEntitlement } from '../../../../hooks/useIsPremium';
import { env } from '../../../../config/environment';
import { getCsrfToken } from '../../../../lib/csrf';
import { BRAND_SEAM_RED } from '../../../../constants/colors';

const ALLOWED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

interface ColorInputGroupProps {
  label: string;
  value: string;
  presetColors: readonly string[];
  onChange: (color: string) => void;
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

const ColorInputGroup: React.FC<ColorInputGroupProps> = ({
  label,
  value,
  presetColors,
  onChange,
}) => {
  const [hexInput, setHexInput] = useState(value);

  useEffect(() => {
    setHexInput(value);
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.startsWith('#')
      ? e.target.value
      : `#${e.target.value}`;
    setHexInput(v);
    if (HEX_RE.test(v)) onChange(v);
  };

  return (
    <div className="ls-field">
      <label>{label}</label>
      <div className="ls-color-row">
        {presetColors.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Pick ${label.toLowerCase()} ${c}`}
            className={`ls-color-swatch ${value === c ? 'on' : ''}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}
      >
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={HEX_RE.test(value) ? value : '#000000'}
          onChange={(e) => {
            onChange(e.target.value);
            setHexInput(e.target.value);
          }}
          style={{
            width: 32,
            height: 32,
            padding: 0,
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            background: 'none',
          }}
        />
        <input
          type="text"
          aria-label={`${label} hex`}
          className="ls-input"
          value={hexInput}
          onChange={handleTextChange}
          placeholder="#000000"
          maxLength={7}
          style={{ width: 100, fontFamily: 'var(--font-mono)', fontSize: 13 }}
        />
      </div>
    </div>
  );
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

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const canUploadLogo = useHasEntitlement(ENTITLEMENTS.logo_upload);
  const [keeperMessage, setKeeperMessage] = useState<string | null>(null);
  const [keeperError, setKeeperError] = useState<string | null>(null);

  // Save wiring (form state, dirty tracking, rename/branding mutations, saved
  // flash) is shared cross-platform via useTeamBranding (LS-7809); this tab
  // keeps its bespoke editorial markup.
  const {
    name,
    setName,
    primaryColor,
    setPrimaryColor,
    secondaryColor,
    setSecondaryColor,
    logoUrl,
    setLogoUrl,
    logoUrlError,
    currentTeamName,
    trimmedName,
    nameDirty,
    brandingDirty,
    renaming,
    savingBranding,
    savedFlash,
    presetColors,
    saveName,
    saveBranding,
    resetBranding,
  } = useTeamBranding({
    teamId: myTeamId,
    leagueId: league.id ?? null,
    team: myTeam,
    onSaved: () => setSaveError(null),
    onError: (err) => setSaveError(err.message),
  });

  const handleLogoFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file || !myTeamId || !league.id) return;

    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      setLogoUploadError(
        `Unsupported file type. Please upload a PNG, JPEG, or WebP image.`,
      );
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      setLogoUploadError(
        `Image is too large (${sizeMb} MB). Maximum allowed size is 2 MB.`,
      );
      return;
    }

    setLogoUploadError(null);
    setLogoUploading(true);
    try {
      if (!env.imageUploadUrl) {
        throw new Error(
          'Image uploads are not configured (VITE_IMAGE_UPLOAD_URL missing).',
        );
      }
      const uploadUrl = `${env.imageUploadUrl}/images/upload?teamId=${myTeamId}&imageType=avatar`;
      const csrfToken = getCsrfToken();
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: file,
        credentials: 'include',
      });
      const json = (await response.json()) as { url?: string; error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? `Upload failed (${response.status})`);
      }
      if (!json.url) {
        throw new Error('Upload succeeded but no URL was returned.');
      }
      setLogoUrl(json.url);
    } catch (err: unknown) {
      setLogoUploadError(
        err instanceof Error ? err.message : 'Upload failed. Please try again.',
      );
    } finally {
      setLogoUploading(false);
      if (logoFileInputRef.current) logoFileInputRef.current.value = '';
    }
  };

  const requestRename = () => {
    if (!myTeamId || !nameDirty || !league.id) return;
    setConfirmOpen(true);
  };

  const onSaveName = async () => {
    await saveName();
    setConfirmOpen(false);
  };

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
      {saveError ? (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            background: 'rgba(196, 30, 58, 0.1)',
            border: '1px solid rgba(196, 30, 58, 0.4)',
            borderRadius: 8,
            padding: 12,
            color: '#c41e3a',
            fontWeight: 600,
          }}
        >
          Error saving team: {saveError}
        </div>
      ) : null}
      {keeperError ? (
        <div
          role="alert"
          aria-live="assertive"
          className="ls-banner ls-banner-error"
        >
          {keeperError}
        </div>
      ) : null}
      {keeperMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="ls-banner ls-banner-success"
        >
          {keeperMessage}
        </div>
      ) : null}
      {league.rosterContinuity === RosterContinuity.Keeper &&
        league.keeperSettings && (
          <KeeperDesignationPanel
            leagueId={league.id ?? 0}
            keeperSettings={league.keeperSettings}
            draftStatus={league.draftStatus}
            onSuccess={(msg) => {
              setKeeperMessage(msg);
              setKeeperError(null);
            }}
            onError={(err) => {
              setKeeperError(err.message);
              setKeeperMessage(null);
            }}
          />
        )}
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
              {logoUrlError ? (
                <span className="hint" style={{ color: 'var(--red-9)' }}>
                  {logoUrlError}
                </span>
              ) : (
                <span className="hint">Square image, served over HTTPS.</span>
              )}
            </div>

            <PremiumGate
              isPremium={canUploadLogo}
              featureName="Logo Upload"
              featureDescription="Upload a logo image directly from your device — available on the Premium plan."
            >
              <div style={{ marginTop: 12 }}>
                {logoUploadError ? (
                  <div
                    role="alert"
                    style={{
                      color: BRAND_SEAM_RED,
                      fontSize: 12,
                      marginBottom: 6,
                    }}
                  >
                    {logoUploadError}
                  </div>
                ) : null}
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    void handleLogoFileChange(e);
                  }}
                />
                <button
                  type="button"
                  className="ls-btn ls-btn-ghost"
                  disabled={logoUploading}
                  onClick={() => logoFileInputRef.current?.click()}
                >
                  <I.Upload size={12} />{' '}
                  {logoUploading ? 'Uploading…' : 'Upload Logo'}
                </button>
                <span className="hint" style={{ marginLeft: 8 }}>
                  PNG, JPEG, or WebP · max 2 MB
                </span>
              </div>
            </PremiumGate>
          </div>

          <div>
            <label
              className="eyebrow"
              style={{ display: 'block', marginBottom: 12 }}
            >
              Colors
            </label>
            <ColorInputGroup
              label="Primary Color"
              value={primaryColor}
              presetColors={presetColors}
              onChange={setPrimaryColor}
            />
            <ColorInputGroup
              label="Secondary Color"
              value={secondaryColor}
              presetColors={presetColors}
              onChange={setSecondaryColor}
            />

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

            <div
              style={{
                marginTop: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <button
                type="button"
                className="ls-btn ls-btn-gold block"
                onClick={() => {
                  void saveBranding();
                }}
                disabled={savingBranding || !!logoUrlError}
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
              {brandingDirty && !savingBranding && (
                <button
                  type="button"
                  className="ls-btn ls-btn-ghost"
                  data-testid="discard-branding"
                  onClick={resetBranding}
                >
                  Discard changes
                </button>
              )}
            </div>
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

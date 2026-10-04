// ---------------------------------------------------------------------------
// Pick inspector data model (LS-10163)
//
// The design opens a pick inspector when a grid cell, timeline row, or phone
// round tile is tapped — one popup, three states (design source:
// docs/design/B8P9BQz8s6NZ9Q-FqWI_yA/legacy-sports-draft-board/project/
// styles/adaptive.css:102-117, scripts/draft.js:157-252,432-440). This module
// owns the data shape and the state → copy mapping so `DraftPickInspector`
// (the popup itself) stays purely presentational and each board only has to
// translate its own already-computed pick state into a `PickInspectorInput`.
// ---------------------------------------------------------------------------

/** One `Team` / `Position` / `Pick` / `Status` row in the inspector body. */
export interface PickInspectorRow {
  label: string;
  value: string;
}

export interface PickInspectorData {
  /** `"Pick {round}.{slot} · Round {round}"`. */
  eyebrow: string;
  /** The player's name, or the on-the-clock / not-yet-made copy. */
  title: string;
  meta: string | null;
  /** Team/Position/Pick/Status rows — empty for the `upcoming` variant. */
  rows: PickInspectorRow[];
  /** Populated only for the `upcoming` variant, in place of `rows`. */
  empty: string | null;
}

/** Which of the design's three pick-inspector variants applies. */
export type PickInspectorState = 'made' | 'on-the-clock' | 'upcoming';

export interface PickInspectorInput {
  round: number;
  /** `"{round}.{slot}"`, zero-padded slot — callers already compute this
   *  (`DraftRoundBoard`'s `RoundTile.pickLabel`, or `pickInRoundForColumn` /
   *  `pick.pickNumber` elsewhere) since the slot numbering rule differs by
   *  surface (fixed team columns on the grid vs. snake order on the phone
   *  tiles and timeline). */
  pickLabel: string;
  teamName: string;
  state: PickInspectorState;
  /** Required when `state === 'made'`. */
  playerName?: string | null;
  /** Required when `state === 'made'`. */
  position?: string | null;
  /** The viewer's own team — drives the "your pick" / "on your roster" copy. */
  isMine?: boolean;
}

/**
 * Maps a board's own pick state into the inspector's copy for one of the
 * three variants. Pure and view-independent so each variant is assertable
 * without rendering.
 */
export function buildPickInspectorData({
  round,
  pickLabel,
  teamName,
  state,
  playerName,
  position,
  isMine = false,
}: PickInspectorInput): PickInspectorData {
  const eyebrow = `Pick ${pickLabel} · Round ${round}`;

  if (state === 'on-the-clock') {
    return {
      eyebrow,
      title: 'On the clock',
      meta: teamName,
      rows: [
        { label: 'Team', value: teamName },
        { label: 'Pick', value: pickLabel },
        {
          label: 'Status',
          value: isMine ? 'Choosing now — your pick' : 'Choosing now',
        },
      ],
      empty: null,
    };
  }

  if (state === 'upcoming') {
    return {
      eyebrow,
      title: 'Not yet made',
      meta: teamName,
      rows: [],
      empty: `${teamName} is on the board at ${pickLabel}.`,
    };
  }

  const resolvedPosition = position ?? null;
  return {
    eyebrow,
    title: playerName ?? 'Unknown player',
    meta: resolvedPosition
      ? `${resolvedPosition} · drafted by ${teamName}`
      : `Drafted by ${teamName}`,
    rows: [
      { label: 'Team', value: teamName },
      { label: 'Position', value: resolvedPosition ?? '—' },
      { label: 'Pick', value: pickLabel },
      { label: 'Status', value: isMine ? 'On your roster' : 'Rostered' },
    ],
    empty: null,
  };
}

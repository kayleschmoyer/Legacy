import { computeDefenseScore } from './DefenseScoring';
import {
  DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS,
  DEFAULT_DEFENSE_SCORING,
} from './DefaultScoring';

describe('computeDefenseScore', () => {
  it('applies pts_0 band bonus when pts_allowed is 0', () => {
    const result = computeDefenseScore(
      {
        sacks: 0,
        int: 0,
        fumbles_rec: 0,
        def_td: 0,
        safeties: 0,
        pts_allowed: 0,
      },
      DEFAULT_DEFENSE_SCORING,
      DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS,
    );
    // flat score = 0, pts_0 band = 10
    expect(result).toBe(10);
  });

  it('applies correct band for pts_allowed 1-6', () => {
    const result = computeDefenseScore(
      { pts_allowed: 6 },
      DEFAULT_DEFENSE_SCORING,
      DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS,
    );
    expect(result).toBe(7);
  });

  it('applies correct band for pts_allowed 7-13', () => {
    const result = computeDefenseScore(
      { pts_allowed: 10 },
      DEFAULT_DEFENSE_SCORING,
      DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS,
    );
    expect(result).toBe(4);
  });

  it('applies correct band for pts_allowed 14-17', () => {
    const result = computeDefenseScore(
      { pts_allowed: 17 },
      DEFAULT_DEFENSE_SCORING,
      DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS,
    );
    expect(result).toBe(1);
  });

  it('applies correct band for pts_allowed 18-27 (zero bonus)', () => {
    const result = computeDefenseScore(
      { pts_allowed: 21 },
      DEFAULT_DEFENSE_SCORING,
      DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS,
    );
    expect(result).toBe(0);
  });

  it('applies negative band for pts_allowed 28-34', () => {
    const result = computeDefenseScore(
      { pts_allowed: 30 },
      DEFAULT_DEFENSE_SCORING,
      DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS,
    );
    expect(result).toBe(-1);
  });

  it('applies most negative band for pts_allowed 35+', () => {
    const result = computeDefenseScore(
      { pts_allowed: 42 },
      DEFAULT_DEFENSE_SCORING,
      DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS,
    );
    expect(result).toBe(-4);
  });

  it('combines flat stat score with band bonus', () => {
    const result = computeDefenseScore(
      {
        sacks: 2,
        int: 1,
        fumbles_rec: 1,
        def_td: 0,
        safeties: 0,
        pts_allowed: 0,
      },
      DEFAULT_DEFENSE_SCORING,
      DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS,
    );
    // flat: 2*1 + 1*2 + 1*2 = 6, band pts_0: 10 → 16
    expect(result).toBe(16);
  });

  it('omits band score when pts_allowed is null', () => {
    const result = computeDefenseScore(
      { sacks: 3 },
      DEFAULT_DEFENSE_SCORING,
      DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS,
    );
    // flat: 3*1 = 3, no band
    expect(result).toBe(3);
  });
});

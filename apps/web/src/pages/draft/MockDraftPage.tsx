import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AMBER,
  AMBER_LIGHT,
  BLACK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_SEAM_RED,
  EMERALD,
  EMERALD_LIGHT,
  EMERALD_LIGHTER,
  getPositionColor,
  GRADIENT_BOARD_BG,
  GRADIENT_GOLD,
  GRADIENT_SEAM_RED,
  GRADIENT_SUCCESS,
  GRADIENT_WHITE_CARD,
  GRAY,
  GREEN,
  INJURY_HEALTHY,
  INJURY_OUT,
  INJURY_QUESTIONABLE,
  OVERLAY_WHITE_05,
  OVERLAY_WHITE_10,
  SLATE_300,
  SLATE_400,
  SLATE_500,
  VIOLET,
  withAlpha,
} from '../../constants/colors';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MockPlayer {
  id: number;
  name: string;
  position: string;
  team: string;
  adp: number;
  /** Projected fantasy points for the current season */
  projected: number;
  /** Career average projected fantasy points per season */
  careerProjected: number;
  avg: number;
  hr: number;
  rbi: number;
  runs: number;
  sb: number;
  // Pitcher-specific stats (defined for position === 'P')
  era?: number;
  whip?: number;
  wins?: number;
  k?: number;
  sv?: number;
  trend: 'up' | 'down' | 'stable';
  injury: 'healthy' | 'questionable' | 'doubtful' | 'out';
}

interface MockDraftSettings {
  numTeams: number;
  rosterSize: number;
  userPickPosition: number;
}

type DraftStage = 'setup' | 'drafting' | 'results';

// ─── Player Pool ──────────────────────────────────────────────────────────────

const PLAYER_POOL: MockPlayer[] = [
  {
    id: 1,
    name: 'Ronald Acuña Jr.',
    position: 'OF',
    team: 'ATL',
    adp: 1,
    projected: 28.4,
    careerProjected: 30.7,
    avg: 0.337,
    hr: 41,
    rbi: 106,
    runs: 149,
    sb: 73,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 2,
    name: 'Mookie Betts',
    position: 'OF',
    team: 'LAD',
    adp: 2,
    projected: 26.8,
    careerProjected: 28.9,
    avg: 0.307,
    hr: 39,
    rbi: 107,
    runs: 122,
    sb: 16,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 3,
    name: 'Jose Altuve',
    position: '2B',
    team: 'HOU',
    adp: 3,
    projected: 25.9,
    careerProjected: 28,
    avg: 0.31,
    hr: 17,
    rbi: 69,
    runs: 95,
    sb: 18,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 4,
    name: 'Yordan Alvarez',
    position: '1B',
    team: 'HOU',
    adp: 4,
    projected: 25.2,
    careerProjected: 27.2,
    avg: 0.293,
    hr: 31,
    rbi: 97,
    runs: 95,
    sb: 0,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 5,
    name: 'Freddie Freeman',
    position: '1B',
    team: 'LAD',
    adp: 5,
    projected: 24.8,
    careerProjected: 26.8,
    avg: 0.331,
    hr: 29,
    rbi: 102,
    runs: 121,
    sb: 13,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 6,
    name: 'Juan Soto',
    position: 'OF',
    team: 'SD',
    adp: 6,
    projected: 24.1,
    careerProjected: 26,
    avg: 0.275,
    hr: 35,
    rbi: 109,
    runs: 132,
    sb: 3,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 7,
    name: 'Trea Turner',
    position: 'SS',
    team: 'PHI',
    adp: 7,
    projected: 23.4,
    careerProjected: 25.3,
    avg: 0.266,
    hr: 26,
    rbi: 62,
    runs: 103,
    sb: 30,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 8,
    name: 'Corey Seager',
    position: 'SS',
    team: 'TEX',
    adp: 8,
    projected: 23.1,
    careerProjected: 24.9,
    avg: 0.327,
    hr: 33,
    rbi: 96,
    runs: 105,
    sb: 2,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 9,
    name: 'Austin Riley',
    position: '3B',
    team: 'ATL',
    adp: 9,
    projected: 22.6,
    careerProjected: 24.4,
    avg: 0.267,
    hr: 37,
    rbi: 97,
    runs: 85,
    sb: 1,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 10,
    name: 'Mike Trout',
    position: 'OF',
    team: 'LAA',
    adp: 10,
    projected: 22.8,
    careerProjected: 24.6,
    avg: 0.263,
    hr: 18,
    rbi: 44,
    runs: 44,
    sb: 1,
    trend: 'down',
    injury: 'questionable',
  },
  {
    id: 11,
    name: 'Vladimir Guerrero Jr.',
    position: '1B',
    team: 'TOR',
    adp: 11,
    projected: 22.5,
    careerProjected: 24.3,
    avg: 0.264,
    hr: 26,
    rbi: 94,
    runs: 81,
    sb: 2,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 12,
    name: 'Spencer Strider',
    position: 'P',
    team: 'ATL',
    adp: 12,
    projected: 21.2,
    careerProjected: 22.9,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 3.86,
    whip: 1.01,
    wins: 20,
    k: 281,
    trend: 'down',
    injury: 'doubtful',
  },
  {
    id: 13,
    name: 'Gerrit Cole',
    position: 'P',
    team: 'NYY',
    adp: 13,
    projected: 21.8,
    careerProjected: 23.5,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 2.63,
    whip: 0.97,
    wins: 15,
    k: 222,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 14,
    name: 'Max Scherzer',
    position: 'P',
    team: 'TEX',
    adp: 14,
    projected: 20.4,
    careerProjected: 22,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 3.77,
    whip: 1.07,
    wins: 9,
    k: 144,
    trend: 'down',
    injury: 'questionable',
  },
  {
    id: 15,
    name: 'Kyle Tucker',
    position: 'OF',
    team: 'HOU',
    adp: 15,
    projected: 21.6,
    careerProjected: 23.3,
    avg: 0.284,
    hr: 29,
    rbi: 112,
    runs: 91,
    sb: 30,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 16,
    name: 'Francisco Lindor',
    position: 'SS',
    team: 'NYM',
    adp: 16,
    projected: 21.4,
    careerProjected: 23.1,
    avg: 0.254,
    hr: 31,
    rbi: 98,
    runs: 99,
    sb: 18,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 17,
    name: 'Manny Machado',
    position: '3B',
    team: 'SD',
    adp: 17,
    projected: 21.0,
    careerProjected: 22.7,
    avg: 0.263,
    hr: 30,
    rbi: 105,
    runs: 87,
    sb: 8,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 18,
    name: 'Pete Alonso',
    position: '1B',
    team: 'NYM',
    adp: 18,
    projected: 20.8,
    careerProjected: 22.5,
    avg: 0.217,
    hr: 46,
    rbi: 118,
    runs: 93,
    sb: 2,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 19,
    name: 'Julio Rodríguez',
    position: 'OF',
    team: 'SEA',
    adp: 19,
    projected: 20.6,
    careerProjected: 22.2,
    avg: 0.275,
    hr: 32,
    rbi: 103,
    runs: 94,
    sb: 37,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 20,
    name: 'Adley Rutschman',
    position: 'C',
    team: 'BAL',
    adp: 20,
    projected: 20.2,
    careerProjected: 21.8,
    avg: 0.277,
    hr: 25,
    rbi: 90,
    runs: 79,
    sb: 0,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 21,
    name: 'Sandy Alcantara',
    position: 'P',
    team: 'MIA',
    adp: 21,
    projected: 20.1,
    careerProjected: 21.7,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 2.28,
    whip: 0.98,
    wins: 14,
    k: 207,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 22,
    name: 'Bobby Witt Jr.',
    position: 'SS',
    team: 'KC',
    adp: 22,
    projected: 19.9,
    careerProjected: 21.5,
    avg: 0.276,
    hr: 30,
    rbi: 97,
    runs: 90,
    sb: 35,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 23,
    name: 'Shane Bieber',
    position: 'P',
    team: 'CLE',
    adp: 23,
    projected: 19.7,
    careerProjected: 21.3,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 2.61,
    whip: 0.87,
    wins: 13,
    k: 198,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 24,
    name: 'Nolan Arenado',
    position: '3B',
    team: 'STL',
    adp: 24,
    projected: 19.5,
    careerProjected: 21.1,
    avg: 0.273,
    hr: 26,
    rbi: 93,
    runs: 75,
    sb: 2,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 25,
    name: 'Zac Gallen',
    position: 'P',
    team: 'ARI',
    adp: 25,
    projected: 19.4,
    careerProjected: 21,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 3.47,
    whip: 1.12,
    wins: 16,
    k: 220,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 26,
    name: 'Marcus Semien',
    position: '2B',
    team: 'TEX',
    adp: 26,
    projected: 19.2,
    careerProjected: 20.7,
    avg: 0.264,
    hr: 29,
    rbi: 88,
    runs: 101,
    sb: 17,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 27,
    name: 'Luis Castillo',
    position: 'P',
    team: 'SEA',
    adp: 27,
    projected: 19.0,
    careerProjected: 20.5,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 2.67,
    whip: 1.02,
    wins: 13,
    k: 210,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 28,
    name: 'Rafael Devers',
    position: '3B',
    team: 'BOS',
    adp: 28,
    projected: 18.8,
    careerProjected: 20.3,
    avg: 0.281,
    hr: 33,
    rbi: 106,
    runs: 94,
    sb: 4,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 29,
    name: 'Nolan Gorman',
    position: '2B',
    team: 'STL',
    adp: 29,
    projected: 18.5,
    careerProjected: 20,
    avg: 0.244,
    hr: 35,
    rbi: 93,
    runs: 78,
    sb: 2,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 30,
    name: 'Joc Pederson',
    position: 'OF',
    team: 'SF',
    adp: 30,
    projected: 18.3,
    careerProjected: 19.8,
    avg: 0.249,
    hr: 30,
    rbi: 83,
    runs: 75,
    sb: 2,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 31,
    name: 'Michael Harris II',
    position: 'OF',
    team: 'ATL',
    adp: 31,
    projected: 18.1,
    careerProjected: 19.5,
    avg: 0.267,
    hr: 19,
    rbi: 75,
    runs: 83,
    sb: 20,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 32,
    name: 'Dansby Swanson',
    position: 'SS',
    team: 'CHC',
    adp: 32,
    projected: 17.9,
    careerProjected: 19.3,
    avg: 0.244,
    hr: 22,
    rbi: 80,
    runs: 84,
    sb: 13,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 33,
    name: 'Corbin Carroll',
    position: 'OF',
    team: 'ARI',
    adp: 33,
    projected: 17.8,
    careerProjected: 19.2,
    avg: 0.285,
    hr: 25,
    rbi: 76,
    runs: 100,
    sb: 54,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 34,
    name: 'William Contreras',
    position: 'C',
    team: 'MIL',
    adp: 34,
    projected: 17.6,
    careerProjected: 19,
    avg: 0.272,
    hr: 25,
    rbi: 83,
    runs: 61,
    sb: 3,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 35,
    name: 'Gunnar Henderson',
    position: 'SS',
    team: 'BAL',
    adp: 35,
    projected: 17.5,
    careerProjected: 18.9,
    avg: 0.255,
    hr: 28,
    rbi: 82,
    runs: 90,
    sb: 16,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 36,
    name: 'J.T. Realmuto',
    position: 'C',
    team: 'PHI',
    adp: 36,
    projected: 17.3,
    careerProjected: 18.7,
    avg: 0.274,
    hr: 22,
    rbi: 88,
    runs: 73,
    sb: 13,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 37,
    name: 'Andrew McCutchen',
    position: 'OF',
    team: 'PIT',
    adp: 37,
    projected: 17.1,
    careerProjected: 18.5,
    avg: 0.264,
    hr: 17,
    rbi: 69,
    runs: 83,
    sb: 9,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 38,
    name: 'Jazz Chisholm Jr.',
    position: '2B',
    team: 'MIA',
    adp: 38,
    projected: 16.9,
    careerProjected: 18.3,
    avg: 0.243,
    hr: 18,
    rbi: 57,
    runs: 73,
    sb: 23,
    trend: 'up',
    injury: 'questionable',
  },
  {
    id: 39,
    name: 'Xander Bogaerts',
    position: 'SS',
    team: 'SD',
    adp: 39,
    projected: 16.7,
    careerProjected: 18,
    avg: 0.285,
    hr: 22,
    rbi: 88,
    runs: 80,
    sb: 5,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 40,
    name: 'Jose Abreu',
    position: '1B',
    team: 'HOU',
    adp: 40,
    projected: 16.5,
    careerProjected: 17.8,
    avg: 0.278,
    hr: 19,
    rbi: 88,
    runs: 76,
    sb: 0,
    trend: 'down',
    injury: 'healthy',
  },
  {
    id: 41,
    name: 'Teoscar Hernandez',
    position: 'OF',
    team: 'TOR',
    adp: 41,
    projected: 16.3,
    careerProjected: 17.6,
    avg: 0.257,
    hr: 26,
    rbi: 77,
    runs: 72,
    sb: 12,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 42,
    name: 'Max Fried',
    position: 'P',
    team: 'ATL',
    adp: 42,
    projected: 16.1,
    careerProjected: 17.4,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 3.81,
    whip: 1.18,
    wins: 14,
    k: 165,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 43,
    name: 'Brandon Woodruff',
    position: 'P',
    team: 'MIL',
    adp: 43,
    projected: 15.9,
    careerProjected: 17.2,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 3.05,
    whip: 1.09,
    wins: 13,
    k: 190,
    trend: 'stable',
    injury: 'questionable',
  },
  {
    id: 44,
    name: 'Ha-Seong Kim',
    position: 'SS',
    team: 'SD',
    adp: 44,
    projected: 15.8,
    careerProjected: 17.1,
    avg: 0.26,
    hr: 17,
    rbi: 78,
    runs: 85,
    sb: 38,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 45,
    name: 'Framber Valdez',
    position: 'P',
    team: 'HOU',
    adp: 45,
    projected: 15.6,
    careerProjected: 16.8,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 3.21,
    whip: 1.14,
    wins: 17,
    k: 189,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 46,
    name: 'Wander Franco',
    position: 'SS',
    team: 'TB',
    adp: 46,
    projected: 15.4,
    careerProjected: 16.6,
    avg: 0.281,
    hr: 17,
    rbi: 58,
    runs: 74,
    sb: 12,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 47,
    name: 'Christian Yelich',
    position: 'OF',
    team: 'MIL',
    adp: 47,
    projected: 15.2,
    careerProjected: 16.4,
    avg: 0.232,
    hr: 31,
    rbi: 89,
    runs: 86,
    sb: 22,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 48,
    name: 'Cal Raleigh',
    position: 'C',
    team: 'SEA',
    adp: 48,
    projected: 15.0,
    careerProjected: 16.2,
    avg: 0.232,
    hr: 30,
    rbi: 75,
    runs: 61,
    sb: 2,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 49,
    name: 'Starling Marte',
    position: 'OF',
    team: 'NYM',
    adp: 49,
    projected: 14.8,
    careerProjected: 16,
    avg: 0.268,
    hr: 8,
    rbi: 46,
    runs: 63,
    sb: 26,
    trend: 'stable',
    injury: 'questionable',
  },
  {
    id: 50,
    name: 'Paul Goldschmidt',
    position: '1B',
    team: 'STL',
    adp: 50,
    projected: 14.6,
    careerProjected: 15.8,
    avg: 0.268,
    hr: 26,
    rbi: 97,
    runs: 95,
    sb: 7,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 51,
    name: 'Kevin Gausman',
    position: 'P',
    team: 'TOR',
    adp: 51,
    projected: 14.5,
    careerProjected: 15.7,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 3.16,
    whip: 1.05,
    wins: 15,
    k: 237,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 52,
    name: 'Anthony Volpe',
    position: 'SS',
    team: 'NYY',
    adp: 52,
    projected: 14.3,
    careerProjected: 15.4,
    avg: 0.238,
    hr: 21,
    rbi: 73,
    runs: 84,
    sb: 24,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 53,
    name: 'Cody Bellinger',
    position: 'OF',
    team: 'CHC',
    adp: 53,
    projected: 14.1,
    careerProjected: 15.2,
    avg: 0.307,
    hr: 26,
    rbi: 97,
    runs: 95,
    sb: 20,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 54,
    name: 'Anthony Santander',
    position: 'OF',
    team: 'BAL',
    adp: 54,
    projected: 13.9,
    careerProjected: 15,
    avg: 0.236,
    hr: 33,
    rbi: 77,
    runs: 68,
    sb: 3,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 55,
    name: 'Bryce Harper',
    position: '1B',
    team: 'PHI',
    adp: 55,
    projected: 13.8,
    careerProjected: 14.9,
    avg: 0.304,
    hr: 21,
    rbi: 84,
    runs: 86,
    sb: 14,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 56,
    name: 'Shohei Ohtani',
    position: 'P',
    team: 'LAA',
    adp: 56,
    projected: 13.6,
    careerProjected: 14.7,
    avg: 0.304,
    hr: 44,
    rbi: 95,
    runs: 102,
    sb: 20,
    era: 3.14,
    whip: 1.06,
    wins: 10,
    k: 167,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 57,
    name: 'Dylan Cease',
    position: 'P',
    team: 'SD',
    adp: 57,
    projected: 13.5,
    careerProjected: 14.6,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 3.91,
    whip: 1.19,
    wins: 15,
    k: 279,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 58,
    name: 'Taylor Ward',
    position: 'OF',
    team: 'LAA',
    adp: 58,
    projected: 13.3,
    careerProjected: 14.4,
    avg: 0.261,
    hr: 23,
    rbi: 82,
    runs: 82,
    sb: 7,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 59,
    name: 'Nathaniel Lowe',
    position: '1B',
    team: 'TEX',
    adp: 59,
    projected: 13.1,
    careerProjected: 14.1,
    avg: 0.302,
    hr: 17,
    rbi: 86,
    runs: 76,
    sb: 8,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 60,
    name: 'Alexis Díaz',
    position: 'P',
    team: 'CIN',
    adp: 60,
    projected: 12.9,
    careerProjected: 13.9,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 3.07,
    whip: 1.22,
    wins: 3,
    k: 88,
    sv: 37,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 61,
    name: 'Andrew Vaughn',
    position: '1B',
    team: 'CWS',
    adp: 61,
    projected: 12.8,
    careerProjected: 13.8,
    avg: 0.271,
    hr: 17,
    rbi: 76,
    runs: 65,
    sb: 2,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 62,
    name: 'Isaac Paredes',
    position: '3B',
    team: 'TB',
    adp: 62,
    projected: 12.6,
    careerProjected: 13.6,
    avg: 0.249,
    hr: 31,
    rbi: 89,
    runs: 85,
    sb: 2,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 63,
    name: 'Josh Hader',
    position: 'P',
    team: 'SD',
    adp: 63,
    projected: 12.5,
    careerProjected: 13.5,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 1.28,
    whip: 0.83,
    wins: 4,
    k: 126,
    sv: 33,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 64,
    name: 'Zack Wheeler',
    position: 'P',
    team: 'PHI',
    adp: 64,
    projected: 12.3,
    careerProjected: 13.3,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 3.07,
    whip: 1.02,
    wins: 13,
    k: 212,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 65,
    name: 'Ryan Helsley',
    position: 'P',
    team: 'STL',
    adp: 65,
    projected: 12.1,
    careerProjected: 13.1,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 2.44,
    whip: 0.88,
    wins: 4,
    k: 87,
    sv: 26,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 66,
    name: 'Royce Lewis',
    position: '3B',
    team: 'MIN',
    adp: 66,
    projected: 12.0,
    careerProjected: 13,
    avg: 0.283,
    hr: 19,
    rbi: 63,
    runs: 70,
    sb: 14,
    trend: 'up',
    injury: 'questionable',
  },
  {
    id: 67,
    name: 'Jonathan India',
    position: '2B',
    team: 'CIN',
    adp: 67,
    projected: 11.8,
    careerProjected: 12.7,
    avg: 0.265,
    hr: 16,
    rbi: 70,
    runs: 88,
    sb: 10,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 68,
    name: 'Merrill Kelly',
    position: 'P',
    team: 'ARI',
    adp: 68,
    projected: 11.7,
    careerProjected: 12.6,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 3.29,
    whip: 1.11,
    wins: 12,
    k: 148,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 69,
    name: 'Emmanuel Clase',
    position: 'P',
    team: 'CLE',
    adp: 69,
    projected: 11.5,
    careerProjected: 12.4,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 2.44,
    whip: 1.12,
    wins: 6,
    k: 87,
    sv: 42,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 70,
    name: 'Jarred Kelenic',
    position: 'OF',
    team: 'ATL',
    adp: 70,
    projected: 11.3,
    careerProjected: 12.2,
    avg: 0.239,
    hr: 22,
    rbi: 62,
    runs: 75,
    sb: 15,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 71,
    name: 'Lane Thomas',
    position: 'OF',
    team: 'WSH',
    adp: 71,
    projected: 11.2,
    careerProjected: 12.1,
    avg: 0.258,
    hr: 28,
    rbi: 73,
    runs: 83,
    sb: 15,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 72,
    name: 'Chris Sale',
    position: 'P',
    team: 'ATL',
    adp: 72,
    projected: 11.0,
    careerProjected: 11.9,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 3.19,
    whip: 1.03,
    wins: 13,
    k: 198,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 73,
    name: 'Alex Bregman',
    position: '3B',
    team: 'HOU',
    adp: 73,
    projected: 10.9,
    careerProjected: 11.8,
    avg: 0.262,
    hr: 23,
    rbi: 91,
    runs: 90,
    sb: 3,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 74,
    name: 'Grayson Rodriguez',
    position: 'P',
    team: 'BAL',
    adp: 74,
    projected: 10.7,
    careerProjected: 11.6,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 4.31,
    whip: 1.19,
    wins: 12,
    k: 148,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 75,
    name: 'Nick Lodolo',
    position: 'P',
    team: 'CIN',
    adp: 75,
    projected: 10.5,
    careerProjected: 11.3,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 4.19,
    whip: 1.29,
    wins: 9,
    k: 130,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 76,
    name: 'Jordan Montgomery',
    position: 'P',
    team: 'STL',
    adp: 76,
    projected: 10.4,
    careerProjected: 11.2,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 3.2,
    whip: 1.11,
    wins: 16,
    k: 181,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 77,
    name: 'Cedric Mullins',
    position: 'OF',
    team: 'BAL',
    adp: 77,
    projected: 10.2,
    careerProjected: 11,
    avg: 0.236,
    hr: 19,
    rbi: 64,
    runs: 84,
    sb: 31,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 78,
    name: 'C.J. Cron',
    position: '1B',
    team: 'COL',
    adp: 78,
    projected: 10.0,
    careerProjected: 10.8,
    avg: 0.266,
    hr: 28,
    rbi: 102,
    runs: 72,
    sb: 0,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 79,
    name: 'Carlos Correa',
    position: 'SS',
    team: 'MIN',
    adp: 79,
    projected: 9.9,
    careerProjected: 10.7,
    avg: 0.284,
    hr: 22,
    rbi: 77,
    runs: 71,
    sb: 3,
    trend: 'down',
    injury: 'questionable',
  },
  {
    id: 80,
    name: 'Salvador Perez',
    position: 'C',
    team: 'KC',
    adp: 80,
    projected: 9.7,
    careerProjected: 10.5,
    avg: 0.252,
    hr: 23,
    rbi: 85,
    runs: 62,
    sb: 0,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 81,
    name: 'Andrés Giménez',
    position: '2B',
    team: 'CLE',
    adp: 81,
    projected: 9.6,
    careerProjected: 10.4,
    avg: 0.279,
    hr: 12,
    rbi: 60,
    runs: 68,
    sb: 16,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 82,
    name: 'Triston McKenzie',
    position: 'P',
    team: 'CLE',
    adp: 82,
    projected: 9.4,
    careerProjected: 10.2,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 4.47,
    whip: 1.19,
    wins: 10,
    k: 154,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 83,
    name: 'Bailey Ober',
    position: 'P',
    team: 'MIN',
    adp: 83,
    projected: 9.2,
    careerProjected: 9.9,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 3.43,
    whip: 1.05,
    wins: 12,
    k: 157,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 84,
    name: 'Eduardo Escobar',
    position: '3B',
    team: 'NYM',
    adp: 84,
    projected: 9.1,
    careerProjected: 9.8,
    avg: 0.232,
    hr: 20,
    rbi: 60,
    runs: 58,
    sb: 3,
    trend: 'down',
    injury: 'healthy',
  },
  {
    id: 85,
    name: 'TJ Friedl',
    position: 'OF',
    team: 'CIN',
    adp: 85,
    projected: 9.0,
    careerProjected: 9.7,
    avg: 0.268,
    hr: 12,
    rbi: 48,
    runs: 75,
    sb: 24,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 86,
    name: 'Tyler Glasnow',
    position: 'P',
    team: 'TB',
    adp: 86,
    projected: 8.8,
    careerProjected: 9.5,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 2.54,
    whip: 0.92,
    wins: 10,
    k: 178,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 87,
    name: 'Kyle Schwarber',
    position: 'OF',
    team: 'PHI',
    adp: 87,
    projected: 8.7,
    careerProjected: 9.4,
    avg: 0.197,
    hr: 47,
    rbi: 104,
    runs: 100,
    sb: 7,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 88,
    name: 'Nico Hoerner',
    position: '2B',
    team: 'CHC',
    adp: 88,
    projected: 8.5,
    careerProjected: 9.2,
    avg: 0.282,
    hr: 8,
    rbi: 54,
    runs: 81,
    sb: 22,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 89,
    name: 'Matt Olson',
    position: '1B',
    team: 'ATL',
    adp: 89,
    projected: 8.4,
    careerProjected: 9.1,
    avg: 0.222,
    hr: 54,
    rbi: 139,
    runs: 103,
    sb: 3,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 90,
    name: 'Tony Gonsolin',
    position: 'P',
    team: 'LAD',
    adp: 90,
    projected: 8.2,
    careerProjected: 8.9,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 3.96,
    whip: 1.25,
    wins: 9,
    k: 97,
    trend: 'down',
    injury: 'questionable',
  },
  {
    id: 91,
    name: 'Christian Walker',
    position: '1B',
    team: 'ARI',
    adp: 91,
    projected: 8.1,
    careerProjected: 8.7,
    avg: 0.242,
    hr: 33,
    rbi: 94,
    runs: 86,
    sb: 5,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 92,
    name: 'Jackson Holliday',
    position: 'SS',
    team: 'BAL',
    adp: 92,
    projected: 8.0,
    careerProjected: 8.6,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 93,
    name: 'Joe Ryan',
    position: 'P',
    team: 'MIN',
    adp: 93,
    projected: 7.8,
    careerProjected: 8.4,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 3.39,
    whip: 1,
    wins: 11,
    k: 133,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 94,
    name: 'Seiya Suzuki',
    position: 'OF',
    team: 'CHC',
    adp: 94,
    projected: 7.7,
    careerProjected: 8.3,
    avg: 0.285,
    hr: 20,
    rbi: 74,
    runs: 65,
    sb: 7,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 95,
    name: 'Steven Kwan',
    position: 'OF',
    team: 'CLE',
    adp: 95,
    projected: 7.6,
    careerProjected: 8.2,
    avg: 0.298,
    hr: 7,
    rbi: 52,
    runs: 89,
    sb: 19,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 96,
    name: 'Rhys Hoskins',
    position: '1B',
    team: 'PHI',
    adp: 96,
    projected: 7.4,
    careerProjected: 8,
    avg: 0.236,
    hr: 26,
    rbi: 79,
    runs: 75,
    sb: 5,
    trend: 'down',
    injury: 'questionable',
  },
  {
    id: 97,
    name: 'DJ LeMahieu',
    position: '2B',
    team: 'NYY',
    adp: 97,
    projected: 7.3,
    careerProjected: 7.9,
    avg: 0.261,
    hr: 16,
    rbi: 65,
    runs: 78,
    sb: 4,
    trend: 'down',
    injury: 'questionable',
  },
  {
    id: 98,
    name: 'Justin Verlander',
    position: 'P',
    team: 'HOU',
    adp: 98,
    projected: 7.1,
    careerProjected: 7.7,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 3.22,
    whip: 1.09,
    wins: 13,
    k: 175,
    trend: 'down',
    injury: 'healthy',
  },
  {
    id: 99,
    name: 'Robbie Ray',
    position: 'P',
    team: 'TOR',
    adp: 99,
    projected: 7.0,
    careerProjected: 7.6,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 4.38,
    whip: 1.36,
    wins: 12,
    k: 192,
    trend: 'down',
    injury: 'questionable',
  },
  {
    id: 100,
    name: 'Tommy Edman',
    position: '2B',
    team: 'STL',
    adp: 100,
    projected: 6.9,
    careerProjected: 7.5,
    avg: 0.254,
    hr: 11,
    rbi: 70,
    runs: 91,
    sb: 28,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 101,
    name: 'Mark Vientos',
    position: '3B',
    team: 'NYM',
    adp: 101,
    projected: 6.8,
    careerProjected: 7.3,
    avg: 0.267,
    hr: 17,
    rbi: 55,
    runs: 53,
    sb: 2,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 102,
    name: "Tyler O'Neill",
    position: 'OF',
    team: 'STL',
    adp: 102,
    projected: 6.6,
    careerProjected: 7.1,
    avg: 0.228,
    hr: 31,
    rbi: 77,
    runs: 79,
    sb: 9,
    trend: 'down',
    injury: 'questionable',
  },
  {
    id: 103,
    name: 'Clarke Schmidt',
    position: 'P',
    team: 'NYY',
    adp: 103,
    projected: 6.5,
    careerProjected: 7,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 4.54,
    whip: 1.23,
    wins: 11,
    k: 152,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 104,
    name: 'José Berríos',
    position: 'P',
    team: 'TOR',
    adp: 104,
    projected: 6.4,
    careerProjected: 6.9,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 3.65,
    whip: 1.21,
    wins: 14,
    k: 177,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 105,
    name: 'Ryan McMahon',
    position: '2B',
    team: 'COL',
    adp: 105,
    projected: 6.2,
    careerProjected: 6.7,
    avg: 0.264,
    hr: 22,
    rbi: 78,
    runs: 81,
    sb: 6,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 106,
    name: 'Jake Fraley',
    position: 'OF',
    team: 'CIN',
    adp: 106,
    projected: 6.0,
    careerProjected: 6.5,
    avg: 0.246,
    hr: 20,
    rbi: 71,
    runs: 75,
    sb: 17,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 107,
    name: 'Jake Meyers',
    position: 'OF',
    team: 'HOU',
    adp: 107,
    projected: 5.9,
    careerProjected: 6.4,
    avg: 0.253,
    hr: 13,
    rbi: 55,
    runs: 67,
    sb: 14,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 108,
    name: 'Hunter Brown',
    position: 'P',
    team: 'HOU',
    adp: 108,
    projected: 5.8,
    careerProjected: 6.3,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 4.22,
    whip: 1.2,
    wins: 11,
    k: 171,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 109,
    name: 'Bryan Reynolds',
    position: 'OF',
    team: 'PIT',
    adp: 109,
    projected: 5.6,
    careerProjected: 6,
    avg: 0.262,
    hr: 24,
    rbi: 92,
    runs: 76,
    sb: 14,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 110,
    name: 'Ian Happ',
    position: 'OF',
    team: 'CHC',
    adp: 110,
    projected: 5.5,
    careerProjected: 5.9,
    avg: 0.265,
    hr: 20,
    rbi: 72,
    runs: 82,
    sb: 4,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 111,
    name: 'Taijuan Walker',
    position: 'P',
    team: 'PHI',
    adp: 111,
    projected: 5.3,
    careerProjected: 5.7,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 4.01,
    whip: 1.26,
    wins: 8,
    k: 117,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 112,
    name: 'George Springer',
    position: 'OF',
    team: 'TOR',
    adp: 112,
    projected: 5.2,
    careerProjected: 5.6,
    avg: 0.244,
    hr: 21,
    rbi: 72,
    runs: 83,
    sb: 7,
    trend: 'down',
    injury: 'questionable',
  },
  {
    id: 113,
    name: 'Will Smith',
    position: 'C',
    team: 'LAD',
    adp: 113,
    projected: 5.0,
    careerProjected: 5.4,
    avg: 0.268,
    hr: 19,
    rbi: 80,
    runs: 72,
    sb: 1,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 114,
    name: 'Alejandro Kirk',
    position: 'C',
    team: 'TOR',
    adp: 114,
    projected: 4.8,
    careerProjected: 5.2,
    avg: 0.253,
    hr: 14,
    rbi: 63,
    runs: 47,
    sb: 1,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 115,
    name: 'Michael Kopech',
    position: 'P',
    team: 'CWS',
    adp: 115,
    projected: 4.7,
    careerProjected: 5.1,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 3.96,
    whip: 1.28,
    wins: 10,
    k: 144,
    trend: 'down',
    injury: 'questionable',
  },
  {
    id: 116,
    name: 'Brendan Donovan',
    position: '2B',
    team: 'STL',
    adp: 116,
    projected: 4.5,
    careerProjected: 4.9,
    avg: 0.287,
    hr: 10,
    rbi: 59,
    runs: 66,
    sb: 7,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 117,
    name: 'Jose Miranda',
    position: '3B',
    team: 'MIN',
    adp: 117,
    projected: 4.4,
    careerProjected: 4.8,
    avg: 0.249,
    hr: 19,
    rbi: 68,
    runs: 56,
    sb: 1,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 118,
    name: 'Nick Castellanos',
    position: 'OF',
    team: 'PHI',
    adp: 118,
    projected: 4.2,
    careerProjected: 4.5,
    avg: 0.271,
    hr: 29,
    rbi: 100,
    runs: 79,
    sb: 4,
    trend: 'stable',
    injury: 'healthy',
  },
  {
    id: 119,
    name: 'Ryan Jeffers',
    position: 'C',
    team: 'MIN',
    adp: 119,
    projected: 4.1,
    careerProjected: 4.4,
    avg: 0.251,
    hr: 18,
    rbi: 55,
    runs: 44,
    sb: 1,
    trend: 'up',
    injury: 'healthy',
  },
  {
    id: 120,
    name: 'Tucker Davidson',
    position: 'P',
    team: 'LAA',
    adp: 120,
    projected: 4.0,
    careerProjected: 4.3,
    avg: 0.0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    era: 4.68,
    whip: 1.35,
    wins: 7,
    k: 101,
    trend: 'stable',
    injury: 'healthy',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Snake draft: given pick number (1-based) and numTeams, return team index (0-based) */
function getTeamForPick(pickNumber: number, numTeams: number): number {
  const round = Math.ceil(pickNumber / numTeams);
  const positionInRound = pickNumber - (round - 1) * numTeams;
  if (round % 2 === 1) {
    return positionInRound - 1;
  }
  return numTeams - positionInRound;
}

function getAvailableByADP(draftedIds: Set<number>): MockPlayer[] {
  return PLAYER_POOL.filter((p) => !draftedIds.has(p.id)).sort(
    (a, b) => a.adp - b.adp,
  );
}

function getRound(pickNumber: number, numTeams: number): number {
  return Math.ceil(pickNumber / numTeams);
}

function getTeamGrade(projected: number): { grade: string; color: string } {
  if (projected >= 18) return { grade: 'A+', color: EMERALD };
  if (projected >= 16) return { grade: 'A', color: EMERALD_LIGHT };
  if (projected >= 14) return { grade: 'B+', color: GREEN };
  if (projected >= 12) return { grade: 'B', color: AMBER_LIGHT };
  if (projected >= 10) return { grade: 'C', color: AMBER };
  return { grade: 'D', color: BRAND_SEAM_RED };
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────

interface SetupScreenProps {
  onStart: (settings: MockDraftSettings) => void;
}

function SetupScreen({ onStart }: SetupScreenProps): React.JSX.Element {
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
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleStart}
              style={{
                flex: 1,
                padding: '16px',
                borderRadius: '12px',
                border: 'none',
                background: GRADIENT_SEAM_RED,
                color: '#ffffff',
                fontSize: '17px',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: `0 8px 24px ${withAlpha(BRAND_SEAM_RED, 0.4)}`,
                transition: 'transform 0.1s ease, box-shadow 0.1s ease',
              }}
              onMouseOver={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform =
                  'translateY(-1px)';
              }}
              onMouseOut={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = '';
              }}
            >
              <span role="img" aria-label="Start">
                🚀
              </span>{' '}
              Start Mock Draft
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

// ─── Draft Board Screen ───────────────────────────────────────────────────────

interface DraftBoardScreenProps {
  settings: MockDraftSettings;
  onComplete: (myTeam: MockPlayer[]) => void;
}

function DraftBoardScreen({
  settings,
  onComplete,
}: DraftBoardScreenProps): React.JSX.Element {
  const { numTeams, rosterSize, userPickPosition } = settings;
  const totalPicks = numTeams * rosterSize;
  const userPickIndex = userPickPosition - 1; // 0-based

  const [draftedIds, setDraftedIds] = React.useState<Set<number>>(new Set());
  const [allPicks, setAllPicks] = React.useState<
    Array<{ playerId: number; teamIndex: number }>
  >([]);
  const [currentPick, setCurrentPick] = React.useState(1);
  const [selectedPosition, setSelectedPosition] = React.useState('ALL');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [aiThinking, setAiThinking] = React.useState(false);
  const [lastPickedName, setLastPickedName] = React.useState<string | null>(
    null,
  );
  const [liveMessage, setLiveMessage] = React.useState<string>('');
  const [urgentMessage, setUrgentMessage] = React.useState<string>('');

  const isDraftComplete = currentPick > totalPicks;
  const currentTeamIndex = !isDraftComplete
    ? getTeamForPick(currentPick, numTeams)
    : -1;
  const isMyPick = currentTeamIndex === userPickIndex;
  const currentRound = getRound(currentPick, numTeams);

  const myTeam = allPicks
    .filter((pick) => pick.teamIndex === userPickIndex)
    .map((pick) => PLAYER_POOL.find((p) => p.id === pick.playerId))
    .filter((p): p is MockPlayer => p !== undefined);

  const positions = ['ALL', 'C', '1B', '2B', '3B', 'SS', 'OF', 'P'];

  const availablePlayers = getAvailableByADP(draftedIds).filter((p) => {
    const matchesPos =
      selectedPosition === 'ALL' || p.position === selectedPosition;
    const matchesSearch = p.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    return matchesPos && matchesSearch;
  });

  const executePick = React.useCallback(
    (player: MockPlayer) => {
      const team = getTeamForPick(currentPick, numTeams);
      setDraftedIds((prev) => new Set([...prev, player.id]));
      setAllPicks((prev) => [
        ...prev,
        { playerId: player.id, teamIndex: team },
      ]);
      setLastPickedName(player.name);
      setLiveMessage(
        `Pick #${currentPick}: ${player.name} drafted by ${team === userPickIndex ? 'you' : `Team ${team + 1}`}`,
      );
      setCurrentPick((prev) => prev + 1);
    },
    [currentPick, numTeams, userPickIndex],
  );

  // AI auto-pick
  React.useEffect(() => {
    if (isDraftComplete || isMyPick || aiThinking) return;

    setAiThinking(true);
    const delay = 900 + Math.random() * 700; // 0.9–1.6 s
    const timer = setTimeout(() => {
      const available = getAvailableByADP(draftedIds);
      if (available.length > 0) {
        // AI strategy: occasionally skip best ADP for positional need (simple heuristic)
        const top5 = available.slice(0, Math.min(5, available.length));
        const aiPick =
          top5[Math.floor(Math.random() * Math.min(2, top5.length))];
        executePick(aiPick);
      }
      setAiThinking(false);
    }, delay);

    return () => clearTimeout(timer);
  }, [
    currentPick,
    isMyPick,
    isDraftComplete,
    draftedIds,
    aiThinking,
    executePick,
  ]);

  // Complete the draft when all picks are done
  React.useEffect(() => {
    if (isDraftComplete) {
      onComplete(myTeam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraftComplete]);

  // Announce turn changes
  React.useEffect(() => {
    if (!isDraftComplete) {
      setLiveMessage(
        isMyPick
          ? "It's your pick."
          : `Waiting for Team ${currentTeamIndex + 1}…`,
      );
    }
  }, [isMyPick, currentPick, isDraftComplete, currentTeamIndex]);

  const handlePickPlayer = (player: MockPlayer) => {
    if (!isMyPick || isDraftComplete) return;
    executePick(player);
    setUrgentMessage('');
  };

  const teamColors = [
    BRAND_SEAM_RED,
    EMERALD,
    AMBER,
    VIOLET,
    BRAND_GOLD,
    BRAND_NAVY,
    SLATE_300,
    EMERALD_LIGHTER,
    withAlpha(BRAND_SEAM_RED, 0.7),
    withAlpha(EMERALD, 0.7),
    withAlpha(AMBER, 0.7),
    withAlpha(VIOLET, 0.7),
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: GRADIENT_BOARD_BG,
        color: '#ffffff',
        fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Screen-reader live regions */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMessage}
      </div>
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {urgentMessage}
      </div>

      {/* ── Header ── */}
      <header
        style={{
          background: GRADIENT_SEAM_RED,
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: `0 4px 16px ${withAlpha(BLACK, 0.4)}`,
          flexShrink: 0,
        }}
      >
        <div>
          <div
            style={{
              fontSize: '11px',
              opacity: 0.8,
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
          >
            Mock Draft Simulator
          </div>
          <div style={{ fontSize: '20px', fontWeight: '800' }}>
            <span role="img" aria-label="Baseball">
              ⚾
            </span>{' '}
            DRAFT BOARD
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: '800' }}>
            #{currentPick}
          </div>
          <div style={{ fontSize: '11px', opacity: 0.8 }}>
            Round {currentRound} • Pick {currentPick}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: '700',
              color: isMyPick ? EMERALD_LIGHT : AMBER_LIGHT,
              textShadow: `0 0 12px ${isMyPick ? withAlpha(EMERALD, 0.7) : withAlpha(AMBER, 0.7)}`,
            }}
            role="status"
            aria-live="polite"
          >
            {isDraftComplete
              ? 'Draft Complete!'
              : isMyPick
                ? '⬇ YOUR PICK'
                : aiThinking
                  ? '🤔 AI Thinking…'
                  : '⏳ Waiting…'}
          </div>
          <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '2px' }}>
            {totalPicks - currentPick + 1} picks remaining
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 300px',
          gap: '0',
          overflow: 'hidden',
          maxHeight: 'calc(100vh - 80px)',
        }}
      >
        {/* Left: Player Pool */}
        <main
          id="main-content"
          tabIndex={-1}
          style={{
            overflowY: 'auto',
            padding: '20px',
            borderRight: `1px solid ${OVERLAY_WHITE_10}`,
          }}
        >
          {/* Pick status banner */}
          <div
            style={{
              background: isMyPick
                ? withAlpha(EMERALD, 0.12)
                : withAlpha(AMBER, 0.08),
              border: `1px solid ${isMyPick ? withAlpha(EMERALD, 0.3) : withAlpha(AMBER, 0.2)}`,
              borderRadius: '12px',
              padding: '12px 16px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span style={{ fontSize: '20px' }}>{isMyPick ? '🎯' : '⏳'}</span>
            <div>
              <div
                style={{
                  fontWeight: '700',
                  fontSize: '14px',
                  color: isMyPick ? EMERALD_LIGHT : AMBER_LIGHT,
                }}
              >
                {isMyPick
                  ? "It's your pick! Choose a player below."
                  : `Team ${currentTeamIndex + 1} is on the clock…`}
              </div>
              {lastPickedName && (
                <div
                  style={{
                    fontSize: '12px',
                    color: SLATE_400,
                    marginTop: '2px',
                  }}
                >
                  Last pick: {lastPickedName}
                </div>
              )}
            </div>
          </div>

          {/* Search & Filter */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '16px',
              flexWrap: 'wrap',
            }}
          >
            <input
              type="search"
              aria-label="Search players"
              placeholder="Search players…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: '1',
                minWidth: '160px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: `1px solid ${OVERLAY_WHITE_10}`,
                background: OVERLAY_WHITE_05,
                color: '#ffffff',
                fontSize: '14px',
                outline: 'none',
              }}
            />
            <div
              role="group"
              aria-label="Filter by position"
              style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}
            >
              {positions.map((pos) => (
                <button
                  key={pos}
                  aria-pressed={selectedPosition === pos}
                  onClick={() => setSelectedPosition(pos)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${selectedPosition === pos ? getPositionColor(pos) : OVERLAY_WHITE_10}`,
                    background:
                      selectedPosition === pos
                        ? withAlpha(getPositionColor(pos), 0.2)
                        : 'transparent',
                    color: selectedPosition === pos ? '#ffffff' : SLATE_400,
                    fontSize: '12px',
                    fontWeight: selectedPosition === pos ? '700' : '400',
                    cursor: 'pointer',
                  }}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>

          {/* Player List */}
          <div
            role="list"
            aria-label={`Available players (${availablePlayers.length})`}
          >
            {availablePlayers.map((player) => {
              const posColor = getPositionColor(player.position);
              const injuryColor =
                player.injury === 'healthy'
                  ? INJURY_HEALTHY
                  : player.injury === 'out'
                    ? INJURY_OUT
                    : INJURY_QUESTIONABLE;

              return (
                <div
                  role="listitem"
                  key={player.id}
                  onClick={() => handlePickPlayer(player)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handlePickPlayer(player);
                    }
                  }}
                  tabIndex={isMyPick ? 0 : -1}
                  aria-label={`Draft ${player.name}, ${player.position}, ${player.team}, ADP ${player.adp}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    marginBottom: '6px',
                    background: OVERLAY_WHITE_05,
                    border: `1px solid ${OVERLAY_WHITE_10}`,
                    cursor: isMyPick ? 'pointer' : 'default',
                    opacity: isMyPick ? 1 : 0.6,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseOver={(e) => {
                    if (isMyPick) {
                      (e.currentTarget as HTMLDivElement).style.background =
                        withAlpha(BRAND_SEAM_RED, 0.12);
                      (e.currentTarget as HTMLDivElement).style.borderColor =
                        withAlpha(BRAND_SEAM_RED, 0.3);
                    }
                  }}
                  onMouseOut={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background =
                      OVERLAY_WHITE_05;
                    (e.currentTarget as HTMLDivElement).style.borderColor =
                      OVERLAY_WHITE_10;
                  }}
                >
                  {/* ADP rank */}
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: withAlpha(GRAY, 0.3),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: '700',
                      color: SLATE_300,
                      flexShrink: 0,
                    }}
                  >
                    {player.adp}
                  </div>

                  {/* Position badge */}
                  <div
                    style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      background: withAlpha(posColor, 0.2),
                      border: `1px solid ${withAlpha(posColor, 0.4)}`,
                      fontSize: '11px',
                      fontWeight: '700',
                      color: posColor,
                      flexShrink: 0,
                      minWidth: '36px',
                      textAlign: 'center',
                    }}
                  >
                    {player.position}
                  </div>

                  {/* Name + team */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: '600',
                        fontSize: '14px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {player.name}
                    </div>
                    <div style={{ fontSize: '11px', color: SLATE_400 }}>
                      {player.team} •{' '}
                      <span
                        style={{
                          color: injuryColor,
                          textTransform: 'capitalize',
                        }}
                      >
                        {player.injury}
                      </span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div
                    style={{
                      display: 'flex',
                      gap: '12px',
                      fontSize: '11px',
                      color: SLATE_500,
                      flexShrink: 0,
                    }}
                  >
                    {player.position !== 'P' ? (
                      <>
                        <span title="Batting Average">
                          {player.avg.toFixed(3)}
                        </span>
                        <span title="Home Runs">{player.hr} HR</span>
                        <span title="RBI">{player.rbi} RBI</span>
                      </>
                    ) : (
                      <>
                        <span title="ERA">{player.era?.toFixed(2)} ERA</span>
                        <span title="WHIP">{player.whip?.toFixed(2)} WHIP</span>
                        {(player.sv ?? 0) > 0 ? (
                          <span title="Saves">{player.sv} SV</span>
                        ) : (
                          <span title="Wins">{player.wins} W</span>
                        )}
                        <span title="Strikeouts">{player.k} K</span>
                      </>
                    )}
                    <span
                      title="Career Projected Score"
                      style={{ color: AMBER_LIGHT, fontWeight: '600' }}
                    >
                      {player.careerProjected.toFixed(1)} pts
                    </span>
                  </div>

                  {/* Trend */}
                  <div
                    style={{
                      fontSize: '14px',
                      flexShrink: 0,
                    }}
                    aria-label={`Trend: ${player.trend}`}
                  >
                    {player.trend === 'up'
                      ? '📈'
                      : player.trend === 'down'
                        ? '📉'
                        : '➡️'}
                  </div>

                  {/* Draft button */}
                  {isMyPick && (
                    <div
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        background: GRADIENT_SEAM_RED,
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: '700',
                        flexShrink: 0,
                      }}
                    >
                      Draft
                    </div>
                  )}
                </div>
              );
            })}
            {availablePlayers.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px',
                  color: SLATE_500,
                }}
              >
                No players match your filter.
              </div>
            )}
          </div>
        </main>

        {/* Right sidebar: My Team */}
        <aside
          aria-label="My drafted team"
          style={{
            overflowY: 'auto',
            padding: '20px',
            background: withAlpha(BLACK, 0.2),
          }}
        >
          <h2
            style={{
              margin: '0 0 16px 0',
              fontSize: '16px',
              fontWeight: '700',
              color: BRAND_SEAM_RED,
            }}
          >
            <span role="img" aria-label="Trophy">
              🏆
            </span>{' '}
            My Team ({myTeam.length}/{rosterSize})
          </h2>

          {/* Progress bar */}
          <div
            style={{
              background: OVERLAY_WHITE_10,
              borderRadius: '4px',
              height: '4px',
              marginBottom: '16px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(myTeam.length / rosterSize) * 100}%`,
                height: '100%',
                background: GRADIENT_SUCCESS,
                transition: 'width 0.3s ease',
              }}
              role="progressbar"
              aria-valuenow={myTeam.length}
              aria-valuemin={0}
              aria-valuemax={rosterSize}
              aria-label={`${myTeam.length} of ${rosterSize} roster spots filled`}
            />
          </div>

          {myTeam.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '32px 16px',
                color: SLATE_500,
                fontSize: '13px',
              }}
            >
              Your picks will appear here
            </div>
          ) : (
            <div role="list">
              {myTeam.map((player, idx) => (
                <div
                  role="listitem"
                  key={player.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px',
                    borderRadius: '8px',
                    marginBottom: '6px',
                    background: OVERLAY_WHITE_05,
                  }}
                >
                  <div
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: teamColors[userPickIndex % teamColors.length],
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: '700',
                      flexShrink: 0,
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '12px',
                        fontWeight: '600',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {player.name}
                    </div>
                    <div style={{ fontSize: '10px', color: SLATE_500 }}>
                      {player.position} • {player.team}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: '10px',
                      color: SLATE_400,
                      flexShrink: 0,
                    }}
                  >
                    Rd {Math.ceil(idx + 1)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Draft order quick view */}
          <div style={{ marginTop: '24px' }}>
            <h3
              style={{
                margin: '0 0 10px 0',
                fontSize: '12px',
                fontWeight: '600',
                color: SLATE_400,
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              Recent Picks
            </h3>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
            >
              {allPicks
                .slice(-6)
                .reverse()
                .map((pick, idx) => {
                  const player = PLAYER_POOL.find(
                    (p) => p.id === pick.playerId,
                  );
                  if (!player) return null;
                  const isUser = pick.teamIndex === userPickIndex;
                  return (
                    <div
                      key={idx}
                      style={{
                        fontSize: '11px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: isUser
                          ? withAlpha(EMERALD, 0.1)
                          : 'transparent',
                        color: isUser ? EMERALD_LIGHT : SLATE_500,
                        border: isUser
                          ? `1px solid ${withAlpha(EMERALD, 0.2)}`
                          : 'none',
                      }}
                    >
                      {isUser ? '✓ You' : `T${pick.teamIndex + 1}`}:{' '}
                      {player.name} ({player.position})
                    </div>
                  );
                })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── Results Screen ───────────────────────────────────────────────────────────

interface ResultsScreenProps {
  myTeam: MockPlayer[];
  settings: MockDraftSettings;
  onDraftAgain: () => void;
}

function ResultsScreen({
  myTeam,
  settings,
  onDraftAgain,
}: ResultsScreenProps): React.JSX.Element {
  const navigate = useNavigate();

  const totalProjected = myTeam.reduce((sum, p) => sum + p.projected, 0);
  const avgProjected = myTeam.length > 0 ? totalProjected / myTeam.length : 0;
  const gradeInfo = getTeamGrade(avgProjected);

  const totalHR = myTeam
    .filter((p) => p.position !== 'P')
    .reduce((s, p) => s + p.hr, 0);
  const totalRBI = myTeam
    .filter((p) => p.position !== 'P')
    .reduce((s, p) => s + p.rbi, 0);
  const totalRuns = myTeam
    .filter((p) => p.position !== 'P')
    .reduce((s, p) => s + p.runs, 0);
  const totalSB = myTeam
    .filter((p) => p.position !== 'P')
    .reduce((s, p) => s + p.sb, 0);
  const avgBatAvg =
    myTeam.filter((p) => p.position !== 'P' && p.avg > 0).length > 0
      ? myTeam
          .filter((p) => p.position !== 'P' && p.avg > 0)
          .reduce((s, p) => s + p.avg, 0) /
        myTeam.filter((p) => p.position !== 'P' && p.avg > 0).length
      : 0;

  const statItems = [
    { label: 'HR', value: totalHR, icon: '💥' },
    { label: 'RBI', value: totalRBI, icon: '🏃' },
    { label: 'Runs', value: totalRuns, icon: '🔥' },
    { label: 'SB', value: totalSB, icon: '⚡' },
    { label: 'AVG', value: avgBatAvg.toFixed(3), icon: '🎯' },
    { label: 'Proj Pts', value: totalProjected.toFixed(1), icon: '📊' },
  ];

  const positionGroups: Record<string, MockPlayer[]> = {};
  myTeam.forEach((p) => {
    const group = p.position === 'P' ? 'Pitchers' : 'Batters';
    positionGroups[group] = positionGroups[group] || [];
    positionGroups[group].push(p);
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        background: GRADIENT_BOARD_BG,
        color: '#ffffff',
        fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
        padding: '32px 24px',
      }}
    >
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '56px', marginBottom: '12px' }}>
            <span role="img" aria-label="Trophy">
              🏆
            </span>
          </div>
          <h1
            style={{
              margin: '0 0 8px 0',
              fontSize: '32px',
              fontWeight: '800',
              background: GRADIENT_GOLD,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Mock Draft Complete!
          </h1>
          <p style={{ margin: 0, color: SLATE_400, fontSize: '15px' }}>
            {settings.numTeams} teams • {settings.rosterSize} rounds • Pick #
            {settings.userPickPosition}
          </p>
        </div>

        {/* Grade card */}
        <div
          style={{
            background: GRADIENT_WHITE_CARD,
            borderRadius: '20px',
            padding: '28px',
            marginBottom: '24px',
            border: `1px solid ${OVERLAY_WHITE_10}`,
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
          }}
        >
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '16px',
              background: withAlpha(gradeInfo.color, 0.2),
              border: `2px solid ${withAlpha(gradeInfo.color, 0.5)}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              fontWeight: '800',
              color: gradeInfo.color,
              flexShrink: 0,
            }}
            role="img"
            aria-label={`Team grade: ${gradeInfo.grade}`}
          >
            {gradeInfo.grade}
          </div>
          <div>
            <div
              style={{
                fontSize: '13px',
                color: SLATE_400,
                marginBottom: '4px',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              Team Grade
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: '700',
                color: gradeInfo.color,
              }}
            >
              {gradeInfo.grade === 'A+' || gradeInfo.grade === 'A'
                ? 'Championship Contender!'
                : gradeInfo.grade === 'B+' || gradeInfo.grade === 'B'
                  ? 'Solid Playoff Team'
                  : gradeInfo.grade === 'C'
                    ? 'Needs Improvement'
                    : 'Rebuild Recommended'}
            </div>
            <div
              style={{ fontSize: '14px', color: SLATE_500, marginTop: '4px' }}
            >
              Avg projected value per player: {avgProjected.toFixed(1)} pts
            </div>
          </div>
        </div>

        {/* Stats */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
            marginBottom: '24px',
          }}
        >
          {statItems.map((stat) => (
            <div
              key={stat.label}
              style={{
                background: GRADIENT_WHITE_CARD,
                borderRadius: '12px',
                padding: '16px',
                textAlign: 'center',
                border: `1px solid ${OVERLAY_WHITE_10}`,
              }}
            >
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>
                {stat.icon}
              </div>
              <div style={{ fontSize: '22px', fontWeight: '800' }}>
                {stat.value}
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: SLATE_400,
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Roster */}
        {Object.entries(positionGroups).map(([group, players]) => (
          <div
            key={group}
            style={{
              background: GRADIENT_WHITE_CARD,
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '16px',
              border: `1px solid ${OVERLAY_WHITE_10}`,
            }}
          >
            <h2
              style={{
                margin: '0 0 14px 0',
                fontSize: '14px',
                fontWeight: '700',
                color: SLATE_300,
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              {group} ({players.length})
            </h2>
            <div
              role="list"
              style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
            >
              {players.map((player, idx) => {
                const posColor = getPositionColor(player.position);
                return (
                  <div
                    role="listitem"
                    key={player.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: OVERLAY_WHITE_05,
                    }}
                  >
                    <span
                      style={{
                        color: SLATE_500,
                        fontSize: '12px',
                        width: '20px',
                        textAlign: 'right',
                      }}
                    >
                      {idx + 1}.
                    </span>
                    <div
                      style={{
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: withAlpha(posColor, 0.2),
                        border: `1px solid ${withAlpha(posColor, 0.4)}`,
                        fontSize: '11px',
                        fontWeight: '700',
                        color: posColor,
                        minWidth: '34px',
                        textAlign: 'center',
                      }}
                    >
                      {player.position}
                    </div>
                    <div
                      style={{ flex: 1, fontWeight: '600', fontSize: '14px' }}
                    >
                      {player.name}
                    </div>
                    <div style={{ fontSize: '12px', color: SLATE_400 }}>
                      {player.team}
                    </div>
                    <div style={{ fontSize: '12px', color: EMERALD_LIGHT }}>
                      {player.projected.toFixed(1)} pts
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button
            onClick={onDraftAgain}
            style={{
              flex: 1,
              padding: '16px',
              borderRadius: '12px',
              border: 'none',
              background: GRADIENT_SEAM_RED,
              color: '#ffffff',
              fontSize: '16px',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: `0 8px 24px ${withAlpha(BRAND_SEAM_RED, 0.4)}`,
            }}
          >
            <span role="img" aria-label="Reload">
              🔄
            </span>{' '}
            Draft Again
          </button>
          <button
            onClick={() => navigate('/baseball')}
            style={{
              flex: 1,
              padding: '16px',
              borderRadius: '12px',
              border: `1px solid ${OVERLAY_WHITE_10}`,
              background: GRADIENT_SUCCESS,
              color: '#ffffff',
              fontSize: '16px',
              fontWeight: '700',
              cursor: 'pointer',
            }}
          >
            <span role="img" aria-label="Real league">
              ⚾
            </span>{' '}
            Start Real League
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function MockDraftPage(): React.JSX.Element {
  const [stage, setStage] = React.useState<DraftStage>('setup');
  const [settings, setSettings] = React.useState<MockDraftSettings | null>(
    null,
  );
  const [completedTeam, setCompletedTeam] = React.useState<MockPlayer[]>([]);

  const handleStart = (s: MockDraftSettings) => {
    setSettings(s);
    setStage('drafting');
  };

  const handleDraftComplete = (team: MockPlayer[]) => {
    setCompletedTeam(team);
    setStage('results');
  };

  const handleDraftAgain = () => {
    setCompletedTeam([]);
    setStage('setup');
  };

  if (stage === 'setup') {
    return <SetupScreen onStart={handleStart} />;
  }

  if (stage === 'drafting' && settings) {
    return (
      <DraftBoardScreen
        key={`draft-${settings.numTeams}-${settings.rosterSize}-${settings.userPickPosition}`}
        settings={settings}
        onComplete={handleDraftComplete}
      />
    );
  }

  if (stage === 'results' && settings) {
    return (
      <ResultsScreen
        myTeam={completedTeam}
        settings={settings}
        onDraftAgain={handleDraftAgain}
      />
    );
  }

  return <SetupScreen onStart={handleStart} />;
}

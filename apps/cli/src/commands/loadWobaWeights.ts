/**
 * CLI command: load-woba-weights
 *
 * Loads FanGraphs Guts! season-level wOBA linear weights into the
 * woba_season_weights table.  These constants power the season-aware
 * oWAR calculation.
 *
 * Source: https://www.fangraphs.com/guts.aspx?type=cn
 *
 * Usage:
 *   ls-cli load-woba-weights           # insert all seasons 1871-2025
 *   ls-cli load-woba-weights --upsert  # overwrite existing rows
 */

import { LOGGER } from '@legacy-sports/logging';
import { getDbOptions } from '@legacy-sports/utils';
import { runWithPublicClient } from '@legacy-sports/db-client';
import type { PublicDb } from '@legacy-sports/db-client';

// ────────────────────────────────────────────────────────────────────────────
// Embedded dataset — FanGraphs Guts! wOBA & FIP Constants
// Columns: season, lgwOBA, wOBAScale, wBB, wHBP, w1B, w2B, w3B, wHR,
//          runSB, runCS, R/PA, RPW, cFIP
// ────────────────────────────────────────────────────────────────────────────

interface WobaRow {
  season: number;
  lgWoba: number;
  wobaScale: number;
  wBb: number;
  wHbp: number;
  w1b: number;
  w2b: number;
  w3b: number;
  wHr: number;
  runSb: number;
  runCs: number;
  rPa: number;
  rpw: number;
  cFip: number;
}

/* prettier-ignore */
const GUTS_DATA: WobaRow[] = [
  { season: 2025, lgWoba: 0.313, wobaScale: 1.232, wBb: 0.691, wHbp: 0.722, w1b: 0.882, w2b: 1.252, w3b: 1.584, wHr: 2.037, runSb: 0.200, runCs: -0.410, rPa: 0.118, rpw: 9.774, cFip: 3.135 },
  { season: 2024, lgWoba: 0.310, wobaScale: 1.242, wBb: 0.689, wHbp: 0.720, w1b: 0.882, w2b: 1.254, w3b: 1.590, wHr: 2.050, runSb: 0.200, runCs: -0.405, rPa: 0.117, rpw: 9.683, cFip: 3.166 },
  { season: 2023, lgWoba: 0.318, wobaScale: 1.204, wBb: 0.696, wHbp: 0.726, w1b: 0.883, w2b: 1.244, w3b: 1.569, wHr: 2.004, runSb: 0.200, runCs: -0.422, rPa: 0.122, rpw: 10.028, cFip: 3.255 },
  { season: 2022, lgWoba: 0.310, wobaScale: 1.259, wBb: 0.689, wHbp: 0.720, w1b: 0.884, w2b: 1.261, w3b: 1.601, wHr: 2.072, runSb: 0.200, runCs: -0.397, rPa: 0.114, rpw: 9.524, cFip: 3.112 },
  { season: 2021, lgWoba: 0.314, wobaScale: 1.209, wBb: 0.692, wHbp: 0.722, w1b: 0.879, w2b: 1.242, w3b: 1.568, wHr: 2.007, runSb: 0.200, runCs: -0.419, rPa: 0.121, rpw: 9.973, cFip: 3.170 },
  { season: 2020, lgWoba: 0.320, wobaScale: 1.185, wBb: 0.699, wHbp: 0.728, w1b: 0.883, w2b: 1.238, w3b: 1.558, wHr: 1.979, runSb: 0.200, runCs: -0.435, rPa: 0.125, rpw: 10.282, cFip: 3.191 },
  { season: 2019, lgWoba: 0.320, wobaScale: 1.157, wBb: 0.690, wHbp: 0.719, w1b: 0.870, w2b: 1.217, w3b: 1.529, wHr: 1.940, runSb: 0.200, runCs: -0.435, rPa: 0.126, rpw: 10.296, cFip: 3.214 },
  { season: 2018, lgWoba: 0.315, wobaScale: 1.226, wBb: 0.690, wHbp: 0.720, w1b: 0.880, w2b: 1.247, w3b: 1.578, wHr: 2.031, runSb: 0.200, runCs: -0.407, rPa: 0.117, rpw: 9.714, cFip: 3.160 },
  { season: 2017, lgWoba: 0.321, wobaScale: 1.185, wBb: 0.693, wHbp: 0.723, w1b: 0.877, w2b: 1.232, w3b: 1.552, wHr: 1.980, runSb: 0.200, runCs: -0.423, rPa: 0.122, rpw: 10.048, cFip: 3.158 },
  { season: 2016, lgWoba: 0.318, wobaScale: 1.212, wBb: 0.691, wHbp: 0.721, w1b: 0.878, w2b: 1.242, w3b: 1.569, wHr: 2.015, runSb: 0.200, runCs: -0.410, rPa: 0.118, rpw: 9.778, cFip: 3.147 },
  { season: 2015, lgWoba: 0.313, wobaScale: 1.251, wBb: 0.687, wHbp: 0.718, w1b: 0.881, w2b: 1.256, w3b: 1.594, wHr: 2.065, runSb: 0.200, runCs: -0.392, rPa: 0.112, rpw: 9.421, cFip: 3.134 },
  { season: 2014, lgWoba: 0.310, wobaScale: 1.304, wBb: 0.689, wHbp: 0.722, w1b: 0.892, w2b: 1.283, w3b: 1.635, wHr: 2.135, runSb: 0.200, runCs: -0.377, rPa: 0.107, rpw: 9.117, cFip: 3.132 },
  { season: 2013, lgWoba: 0.314, wobaScale: 1.277, wBb: 0.690, wHbp: 0.722, w1b: 0.888, w2b: 1.271, w3b: 1.616, wHr: 2.101, runSb: 0.200, runCs: -0.384, rPa: 0.110, rpw: 9.264, cFip: 3.048 },
  { season: 2012, lgWoba: 0.315, wobaScale: 1.245, wBb: 0.691, wHbp: 0.722, w1b: 0.884, w2b: 1.257, w3b: 1.593, wHr: 2.058, runSb: 0.200, runCs: -0.398, rPa: 0.114, rpw: 9.544, cFip: 3.094 },
  { season: 2011, lgWoba: 0.316, wobaScale: 1.264, wBb: 0.694, wHbp: 0.726, w1b: 0.890, w2b: 1.270, w3b: 1.611, wHr: 2.086, runSb: 0.200, runCs: -0.394, rPa: 0.112, rpw: 9.454, cFip: 3.025 },
  { season: 2010, lgWoba: 0.321, wobaScale: 1.251, wBb: 0.701, wHbp: 0.732, w1b: 0.895, w2b: 1.270, w3b: 1.608, wHr: 2.072, runSb: 0.200, runCs: -0.403, rPa: 0.115, rpw: 9.643, cFip: 3.078 },
  { season: 2009, lgWoba: 0.329, wobaScale: 1.210, wBb: 0.707, wHbp: 0.737, w1b: 0.895, w2b: 1.258, w3b: 1.585, wHr: 2.023, runSb: 0.200, runCs: -0.420, rPa: 0.120, rpw: 9.994, cFip: 3.097 },
  { season: 2008, lgWoba: 0.328, wobaScale: 1.211, wBb: 0.708, wHbp: 0.739, w1b: 0.896, w2b: 1.259, w3b: 1.587, wHr: 2.024, runSb: 0.200, runCs: -0.422, rPa: 0.120, rpw: 10.032, cFip: 3.132 },
  { season: 2007, lgWoba: 0.331, wobaScale: 1.192, wBb: 0.711, wHbp: 0.741, w1b: 0.896, w2b: 1.253, w3b: 1.575, wHr: 1.999, runSb: 0.200, runCs: -0.433, rPa: 0.124, rpw: 10.250, cFip: 3.240 },
  { season: 2006, lgWoba: 0.332, wobaScale: 1.170, wBb: 0.708, wHbp: 0.737, w1b: 0.890, w2b: 1.241, w3b: 1.557, wHr: 1.970, runSb: 0.200, runCs: -0.439, rPa: 0.125, rpw: 10.365, cFip: 3.147 },
  { season: 2005, lgWoba: 0.326, wobaScale: 1.208, wBb: 0.703, wHbp: 0.733, w1b: 0.890, w2b: 1.252, w3b: 1.578, wHr: 2.017, runSb: 0.200, runCs: -0.419, rPa: 0.120, rpw: 9.971, cFip: 3.020 },
  { season: 2004, lgWoba: 0.330, wobaScale: 1.180, wBb: 0.707, wHbp: 0.737, w1b: 0.890, w2b: 1.244, w3b: 1.563, wHr: 1.983, runSb: 0.200, runCs: -0.434, rPa: 0.124, rpw: 10.272, cFip: 3.049 },
  { season: 2003, lgWoba: 0.328, wobaScale: 1.194, wBb: 0.706, wHbp: 0.736, w1b: 0.891, w2b: 1.249, w3b: 1.572, wHr: 2.000, runSb: 0.200, runCs: -0.428, rPa: 0.123, rpw: 10.158, cFip: 3.032 },
  { season: 2002, lgWoba: 0.326, wobaScale: 1.211, wBb: 0.704, wHbp: 0.735, w1b: 0.892, w2b: 1.255, w3b: 1.582, wHr: 2.021, runSb: 0.200, runCs: -0.420, rPa: 0.120, rpw: 9.991, cFip: 2.962 },
  { season: 2001, lgWoba: 0.327, wobaScale: 1.182, wBb: 0.704, wHbp: 0.733, w1b: 0.887, w2b: 1.242, w3b: 1.561, wHr: 1.982, runSb: 0.200, runCs: -0.432, rPa: 0.124, rpw: 10.235, cFip: 3.049 },
  { season: 2000, lgWoba: 0.341, wobaScale: 1.147, wBb: 0.722, wHbp: 0.751, w1b: 0.900, w2b: 1.244, w3b: 1.554, wHr: 1.947, runSb: 0.200, runCs: -0.460, rPa: 0.131, rpw: 10.795, cFip: 3.134 },
  { season: 1999, lgWoba: 0.341, wobaScale: 1.156, wBb: 0.723, wHbp: 0.752, w1b: 0.902, w2b: 1.249, w3b: 1.561, wHr: 1.959, runSb: 0.200, runCs: -0.456, rPa: 0.130, rpw: 10.714, cFip: 3.134 },
  { season: 1998, lgWoba: 0.331, wobaScale: 1.197, wBb: 0.713, wHbp: 0.742, w1b: 0.898, w2b: 1.257, w3b: 1.580, wHr: 2.007, runSb: 0.200, runCs: -0.432, rPa: 0.124, rpw: 10.232, cFip: 3.139 },
  { season: 1997, lgWoba: 0.332, wobaScale: 1.201, wBb: 0.714, wHbp: 0.744, w1b: 0.900, w2b: 1.260, w3b: 1.585, wHr: 2.013, runSb: 0.200, runCs: -0.431, rPa: 0.123, rpw: 10.210, cFip: 3.109 },
  { season: 1996, lgWoba: 0.335, wobaScale: 1.171, wBb: 0.719, wHbp: 0.748, w1b: 0.901, w2b: 1.252, w3b: 1.568, wHr: 1.975, runSb: 0.200, runCs: -0.450, rPa: 0.129, rpw: 10.599, cFip: 3.172 },
  { season: 1995, lgWoba: 0.333, wobaScale: 1.199, wBb: 0.718, wHbp: 0.748, w1b: 0.903, w2b: 1.263, w3b: 1.587, wHr: 2.011, runSb: 0.200, runCs: -0.437, rPa: 0.125, rpw: 10.326, cFip: 3.103 },
  { season: 1994, lgWoba: 0.333, wobaScale: 1.182, wBb: 0.716, wHbp: 0.745, w1b: 0.899, w2b: 1.254, w3b: 1.573, wHr: 1.988, runSb: 0.200, runCs: -0.442, rPa: 0.127, rpw: 10.439, cFip: 3.131 },
  { season: 1993, lgWoba: 0.327, wobaScale: 1.240, wBb: 0.713, wHbp: 0.744, w1b: 0.905, w2b: 1.278, w3b: 1.613, wHr: 2.063, runSb: 0.200, runCs: -0.418, rPa: 0.120, rpw: 9.953, cFip: 2.988 },
  { season: 1992, lgWoba: 0.317, wobaScale: 1.330, wBb: 0.706, wHbp: 0.739, w1b: 0.912, w2b: 1.311, w3b: 1.670, wHr: 2.178, runSb: 0.200, runCs: -0.381, rPa: 0.108, rpw: 9.188, cFip: 2.783 },
  { season: 1991, lgWoba: 0.318, wobaScale: 1.297, wBb: 0.707, wHbp: 0.739, w1b: 0.908, w2b: 1.297, w3b: 1.647, wHr: 2.133, runSb: 0.200, runCs: -0.395, rPa: 0.113, rpw: 9.479, cFip: 2.856 },
  { season: 1990, lgWoba: 0.319, wobaScale: 1.299, wBb: 0.707, wHbp: 0.739, w1b: 0.908, w2b: 1.298, w3b: 1.648, wHr: 2.137, runSb: 0.200, runCs: -0.393, rPa: 0.112, rpw: 9.440, cFip: 2.808 },
  { season: 1989, lgWoba: 0.313, wobaScale: 1.329, wBb: 0.704, wHbp: 0.737, w1b: 0.910, w2b: 1.308, w3b: 1.667, wHr: 2.174, runSb: 0.200, runCs: -0.383, rPa: 0.109, rpw: 9.230, cFip: 2.763 },
  { season: 1988, lgWoba: 0.312, wobaScale: 1.322, wBb: 0.700, wHbp: 0.733, w1b: 0.905, w2b: 1.302, w3b: 1.659, wHr: 2.162, runSb: 0.200, runCs: -0.383, rPa: 0.109, rpw: 9.229, cFip: 2.769 },
  { season: 1987, lgWoba: 0.326, wobaScale: 1.206, wBb: 0.707, wHbp: 0.737, w1b: 0.894, w2b: 1.256, w3b: 1.582, wHr: 2.014, runSb: 0.200, runCs: -0.428, rPa: 0.123, rpw: 10.144, cFip: 2.871 },
  { season: 1986, lgWoba: 0.320, wobaScale: 1.267, wBb: 0.706, wHbp: 0.737, w1b: 0.902, w2b: 1.282, w3b: 1.624, wHr: 2.094, runSb: 0.200, runCs: -0.403, rPa: 0.115, rpw: 9.645, cFip: 2.771 },
  { season: 1985, lgWoba: 0.317, wobaScale: 1.280, wBb: 0.703, wHbp: 0.735, w1b: 0.901, w2b: 1.285, w3b: 1.631, wHr: 2.109, runSb: 0.200, runCs: -0.397, rPa: 0.114, rpw: 9.530, cFip: 2.684 },
  { season: 1984, lgWoba: 0.317, wobaScale: 1.302, wBb: 0.706, wHbp: 0.738, w1b: 0.908, w2b: 1.298, w3b: 1.650, wHr: 2.140, runSb: 0.200, runCs: -0.392, rPa: 0.112, rpw: 9.417, cFip: 2.768 },
  { season: 1983, lgWoba: 0.319, wobaScale: 1.289, wBb: 0.706, wHbp: 0.738, w1b: 0.906, w2b: 1.293, w3b: 1.640, wHr: 2.123, runSb: 0.200, runCs: -0.396, rPa: 0.113, rpw: 9.499, cFip: 2.755 },
  { season: 1982, lgWoba: 0.318, wobaScale: 1.291, wBb: 0.705, wHbp: 0.737, w1b: 0.905, w2b: 1.293, w3b: 1.641, wHr: 2.126, runSb: 0.200, runCs: -0.394, rPa: 0.112, rpw: 9.454, cFip: 2.717 },
  { season: 1981, lgWoba: 0.314, wobaScale: 1.361, wBb: 0.706, wHbp: 0.740, w1b: 0.917, w2b: 1.325, w3b: 1.693, wHr: 2.219, runSb: 0.200, runCs: -0.371, rPa: 0.105, rpw: 8.997, cFip: 2.600 },
  { season: 1980, lgWoba: 0.320, wobaScale: 1.298, wBb: 0.708, wHbp: 0.741, w1b: 0.909, w2b: 1.299, w3b: 1.649, wHr: 2.137, runSb: 0.200, runCs: -0.393, rPa: 0.112, rpw: 9.437, cFip: 2.752 },
  { season: 1979, lgWoba: 0.324, wobaScale: 1.263, wBb: 0.711, wHbp: 0.743, w1b: 0.907, w2b: 1.286, w3b: 1.627, wHr: 2.092, runSb: 0.200, runCs: -0.408, rPa: 0.117, rpw: 9.741, cFip: 2.732 },
  { season: 1978, lgWoba: 0.318, wobaScale: 1.327, wBb: 0.707, wHbp: 0.740, w1b: 0.913, w2b: 1.311, w3b: 1.669, wHr: 2.176, runSb: 0.200, runCs: -0.382, rPa: 0.108, rpw: 9.211, cFip: 2.585 },
  { season: 1977, lgWoba: 0.324, wobaScale: 1.255, wBb: 0.708, wHbp: 0.739, w1b: 0.902, w2b: 1.279, w3b: 1.618, wHr: 2.081, runSb: 0.200, runCs: -0.407, rPa: 0.116, rpw: 9.726, cFip: 2.738 },
  { season: 1976, lgWoba: 0.315, wobaScale: 1.381, wBb: 0.712, wHbp: 0.747, w1b: 0.926, w2b: 1.340, w3b: 1.713, wHr: 2.248, runSb: 0.200, runCs: -0.371, rPa: 0.105, rpw: 8.988, cFip: 2.633 },
  { season: 1975, lgWoba: 0.321, wobaScale: 1.331, wBb: 0.716, wHbp: 0.749, w1b: 0.922, w2b: 1.322, w3b: 1.681, wHr: 2.185, runSb: 0.200, runCs: -0.388, rPa: 0.110, rpw: 9.335, cFip: 2.587 },
  { season: 1974, lgWoba: 0.318, wobaScale: 1.349, wBb: 0.713, wHbp: 0.747, w1b: 0.922, w2b: 1.327, w3b: 1.691, wHr: 2.206, runSb: 0.200, runCs: -0.381, rPa: 0.108, rpw: 9.199, cFip: 2.578 },
  { season: 1973, lgWoba: 0.319, wobaScale: 1.318, wBb: 0.710, wHbp: 0.743, w1b: 0.914, w2b: 1.309, w3b: 1.665, wHr: 2.164, runSb: 0.200, runCs: -0.388, rPa: 0.110, rpw: 9.338, cFip: 2.565 },
  { season: 1972, lgWoba: 0.304, wobaScale: 1.411, wBb: 0.694, wHbp: 0.729, w1b: 0.913, w2b: 1.336, w3b: 1.717, wHr: 2.279, runSb: 0.200, runCs: -0.348, rPa: 0.098, rpw: 8.532, cFip: 2.399 },
  { season: 1971, lgWoba: 0.310, wobaScale: 1.370, wBb: 0.700, wHbp: 0.734, w1b: 0.912, w2b: 1.323, w3b: 1.693, wHr: 2.228, runSb: 0.200, runCs: -0.364, rPa: 0.103, rpw: 8.853, cFip: 2.451 },
  { season: 1970, lgWoba: 0.319, wobaScale: 1.290, wBb: 0.708, wHbp: 0.740, w1b: 0.908, w2b: 1.295, w3b: 1.644, wHr: 2.126, runSb: 0.200, runCs: -0.398, rPa: 0.113, rpw: 9.537, cFip: 2.638 },
  { season: 1969, lgWoba: 0.313, wobaScale: 1.344, wBb: 0.705, wHbp: 0.739, w1b: 0.913, w2b: 1.316, w3b: 1.679, wHr: 2.195, runSb: 0.200, runCs: -0.378, rPa: 0.107, rpw: 9.133, cFip: 2.509 },
  { season: 1968, lgWoba: 0.291, wobaScale: 1.461, wBb: 0.681, wHbp: 0.718, w1b: 0.908, w2b: 1.346, w3b: 1.740, wHr: 2.337, runSb: 0.200, runCs: -0.328, rPa: 0.092, rpw: 8.130, cFip: 2.385 },
  { season: 1967, lgWoba: 0.299, wobaScale: 1.389, wBb: 0.687, wHbp: 0.722, w1b: 0.902, w2b: 1.319, w3b: 1.694, wHr: 2.244, runSb: 0.200, runCs: -0.354, rPa: 0.100, rpw: 8.648, cFip: 2.539 },
  { season: 1966, lgWoba: 0.303, wobaScale: 1.327, wBb: 0.686, wHbp: 0.719, w1b: 0.891, w2b: 1.289, w3b: 1.648, wHr: 2.161, runSb: 0.200, runCs: -0.371, rPa: 0.106, rpw: 8.996, cFip: 2.554 },
  { season: 1965, lgWoba: 0.304, wobaScale: 1.339, wBb: 0.690, wHbp: 0.723, w1b: 0.897, w2b: 1.299, w3b: 1.660, wHr: 2.178, runSb: 0.200, runCs: -0.371, rPa: 0.105, rpw: 8.989, cFip: 2.517 },
  { season: 1964, lgWoba: 0.307, wobaScale: 1.322, wBb: 0.690, wHbp: 0.723, w1b: 0.895, w2b: 1.292, w3b: 1.649, wHr: 2.158, runSb: 0.200, runCs: -0.375, rPa: 0.107, rpw: 9.080, cFip: 2.605 },
  { season: 1963, lgWoba: 0.304, wobaScale: 1.341, wBb: 0.688, wHbp: 0.721, w1b: 0.895, w2b: 1.298, w3b: 1.660, wHr: 2.181, runSb: 0.200, runCs: -0.368, rPa: 0.104, rpw: 8.928, cFip: 2.479 },
  { season: 1962, lgWoba: 0.322, wobaScale: 1.266, wBb: 0.709, wHbp: 0.741, w1b: 0.905, w2b: 1.285, w3b: 1.627, wHr: 2.094, runSb: 0.200, runCs: -0.407, rPa: 0.116, rpw: 9.731, cFip: 2.617 },
  { season: 1961, lgWoba: 0.324, wobaScale: 1.249, wBb: 0.710, wHbp: 0.741, w1b: 0.904, w2b: 1.278, w3b: 1.616, wHr: 2.072, runSb: 0.200, runCs: -0.414, rPa: 0.118, rpw: 9.864, cFip: 2.574 },
  { season: 1960, lgWoba: 0.319, wobaScale: 1.290, wBb: 0.706, wHbp: 0.738, w1b: 0.905, w2b: 1.292, w3b: 1.641, wHr: 2.124, runSb: 0.200, runCs: -0.395, rPa: 0.113, rpw: 9.484, cFip: 2.527 },
  { season: 1959, lgWoba: 0.319, wobaScale: 1.272, wBb: 0.705, wHbp: 0.737, w1b: 0.902, w2b: 1.284, w3b: 1.627, wHr: 2.100, runSb: 0.200, runCs: -0.402, rPa: 0.115, rpw: 9.630, cFip: 2.543 },
  { season: 1958, lgWoba: 0.320, wobaScale: 1.278, wBb: 0.703, wHbp: 0.735, w1b: 0.901, w2b: 1.284, w3b: 1.629, wHr: 2.109, runSb: 0.200, runCs: -0.395, rPa: 0.112, rpw: 9.476, cFip: 2.475 },
  { season: 1957, lgWoba: 0.319, wobaScale: 1.286, wBb: 0.703, wHbp: 0.735, w1b: 0.902, w2b: 1.288, w3b: 1.635, wHr: 2.119, runSb: 0.200, runCs: -0.392, rPa: 0.112, rpw: 9.426, cFip: 2.456 },
  { season: 1956, lgWoba: 0.326, wobaScale: 1.261, wBb: 0.712, wHbp: 0.743, w1b: 0.907, w2b: 1.285, w3b: 1.626, wHr: 2.090, runSb: 0.200, runCs: -0.408, rPa: 0.116, rpw: 9.740, cFip: 2.369 },
  { season: 1955, lgWoba: 0.327, wobaScale: 1.266, wBb: 0.716, wHbp: 0.748, w1b: 0.913, w2b: 1.292, w3b: 1.634, wHr: 2.099, runSb: 0.200, runCs: -0.410, rPa: 0.116, rpw: 9.789, cFip: 2.368 },
  { season: 1954, lgWoba: 0.333, wobaScale: 1.289, wBb: 0.724, wHbp: 0.756, w1b: 0.924, w2b: 1.311, w3b: 1.659, wHr: 2.138, runSb: 0.200, runCs: -0.401, rPa: 0.113, rpw: 9.606, cFip: 2.398 },
  { season: 1953, lgWoba: 0.336, wobaScale: 1.248, wBb: 0.726, wHbp: 0.758, w1b: 0.920, w2b: 1.294, w3b: 1.631, wHr: 2.084, runSb: 0.200, runCs: -0.421, rPa: 0.120, rpw: 10.001, cFip: 2.591 },
  { season: 1952, lgWoba: 0.327, wobaScale: 1.340, wBb: 0.722, wHbp: 0.756, w1b: 0.930, w2b: 1.332, w3b: 1.694, wHr: 2.202, runSb: 0.200, runCs: -0.386, rPa: 0.109, rpw: 9.292, cFip: 2.391 },
  { season: 1951, lgWoba: 0.336, wobaScale: 1.280, wBb: 0.732, wHbp: 0.764, w1b: 0.930, w2b: 1.314, w3b: 1.660, wHr: 2.128, runSb: 0.200, runCs: -0.413, rPa: 0.117, rpw: 9.850, cFip: 2.479 },
  { season: 1950, lgWoba: 0.346, wobaScale: 1.224, wBb: 0.740, wHbp: 0.771, w1b: 0.930, w2b: 1.297, w3b: 1.628, wHr: 2.060, runSb: 0.200, runCs: -0.439, rPa: 0.125, rpw: 10.381, cFip: 2.584 },
  { season: 1949, lgWoba: 0.344, wobaScale: 1.277, wBb: 0.743, wHbp: 0.775, w1b: 0.941, w2b: 1.324, w3b: 1.669, wHr: 2.132, runSb: 0.200, runCs: -0.421, rPa: 0.119, rpw: 9.997, cFip: 2.511 },
  { season: 1948, lgWoba: 0.340, wobaScale: 1.282, wBb: 0.744, wHbp: 0.776, w1b: 0.942, w2b: 1.327, w3b: 1.673, wHr: 2.135, runSb: 0.200, runCs: -0.425, rPa: 0.120, rpw: 10.085, cFip: 2.754 },
  { season: 1947, lgWoba: 0.337, wobaScale: 1.297, wBb: 0.739, wHbp: 0.772, w1b: 0.940, w2b: 1.329, w3b: 1.680, wHr: 2.152, runSb: 0.200, runCs: -0.416, rPa: 0.118, rpw: 9.905, cFip: 2.669 },
  { season: 1946, lgWoba: 0.329, wobaScale: 1.366, wBb: 0.735, wHbp: 0.769, w1b: 0.946, w2b: 1.356, w3b: 1.725, wHr: 2.241, runSb: 0.200, runCs: -0.389, rPa: 0.109, rpw: 9.359, cFip: 2.579 },
  { season: 1945, lgWoba: 0.329, wobaScale: 1.367, wBb: 0.739, wHbp: 0.774, w1b: 0.951, w2b: 1.361, w3b: 1.731, wHr: 2.243, runSb: 0.200, runCs: -0.396, rPa: 0.112, rpw: 9.500, cFip: 2.690 },
  { season: 1944, lgWoba: 0.326, wobaScale: 1.365, wBb: 0.733, wHbp: 0.767, w1b: 0.945, w2b: 1.355, w3b: 1.723, wHr: 2.237, runSb: 0.200, runCs: -0.392, rPa: 0.111, rpw: 9.414, cFip: 2.674 },
  { season: 1943, lgWoba: 0.324, wobaScale: 1.406, wBb: 0.736, wHbp: 0.771, w1b: 0.954, w2b: 1.376, w3b: 1.755, wHr: 2.292, runSb: 0.200, runCs: -0.381, rPa: 0.108, rpw: 9.196, cFip: 2.654 },
  { season: 1942, lgWoba: 0.322, wobaScale: 1.388, wBb: 0.734, wHbp: 0.768, w1b: 0.949, w2b: 1.365, w3b: 1.740, wHr: 2.266, runSb: 0.200, runCs: -0.388, rPa: 0.110, rpw: 9.332, cFip: 2.471 },
  { season: 1941, lgWoba: 0.331, wobaScale: 1.306, wBb: 0.736, wHbp: 0.769, w1b: 0.939, w2b: 1.330, w3b: 1.683, wHr: 2.159, runSb: 0.200, runCs: -0.416, rPa: 0.118, rpw: 9.900, cFip: 2.669 },
  { season: 1940, lgWoba: 0.334, wobaScale: 1.253, wBb: 0.735, wHbp: 0.766, w1b: 0.929, w2b: 1.305, w3b: 1.643, wHr: 2.089, runSb: 0.200, runCs: -0.434, rPa: 0.124, rpw: 10.269, cFip: 2.878 },
  { season: 1939, lgWoba: 0.342, wobaScale: 1.239, wBb: 0.743, wHbp: 0.774, w1b: 0.935, w2b: 1.307, w3b: 1.641, wHr: 2.076, runSb: 0.200, runCs: -0.443, rPa: 0.126, rpw: 10.448, cFip: 2.979 },
  { season: 1938, lgWoba: 0.342, wobaScale: 1.228, wBb: 0.745, wHbp: 0.776, w1b: 0.936, w2b: 1.304, w3b: 1.636, wHr: 2.062, runSb: 0.200, runCs: -0.452, rPa: 0.129, rpw: 10.639, cFip: 3.049 },
  { season: 1937, lgWoba: 0.343, wobaScale: 1.217, wBb: 0.744, wHbp: 0.774, w1b: 0.933, w2b: 1.298, w3b: 1.626, wHr: 2.047, runSb: 0.200, runCs: -0.454, rPa: 0.130, rpw: 10.685, cFip: 3.200 },
  { season: 1936, lgWoba: 0.350, wobaScale: 1.193, wBb: 0.752, wHbp: 0.782, w1b: 0.937, w2b: 1.295, w3b: 1.617, wHr: 2.020, runSb: 0.200, runCs: -0.469, rPa: 0.134, rpw: 10.987, cFip: 3.314 },
  { season: 1935, lgWoba: 0.343, wobaScale: 1.216, wBb: 0.743, wHbp: 0.774, w1b: 0.932, w2b: 1.297, w3b: 1.625, wHr: 2.045, runSb: 0.200, runCs: -0.454, rPa: 0.129, rpw: 10.672, cFip: 3.182 },
  { season: 1934, lgWoba: 0.341, wobaScale: 1.237, wBb: 0.742, wHbp: 0.773, w1b: 0.934, w2b: 1.305, w3b: 1.639, wHr: 2.072, runSb: 0.200, runCs: -0.445, rPa: 0.127, rpw: 10.484, cFip: 3.181 },
  { season: 1933, lgWoba: 0.330, wobaScale: 1.296, wBb: 0.732, wHbp: 0.765, w1b: 0.933, w2b: 1.322, w3b: 1.672, wHr: 2.144, runSb: 0.200, runCs: -0.416, rPa: 0.119, rpw: 9.909, cFip: 2.900 },
  { season: 1932, lgWoba: 0.334, wobaScale: 1.242, wBb: 0.736, wHbp: 0.767, w1b: 0.928, w2b: 1.301, w3b: 1.636, wHr: 2.073, runSb: 0.200, runCs: -0.442, rPa: 0.126, rpw: 10.424, cFip: 3.009 },
  { season: 1931, lgWoba: 0.339, wobaScale: 1.251, wBb: 0.741, wHbp: 0.773, w1b: 0.935, w2b: 1.311, w3b: 1.648, wHr: 2.090, runSb: 0.200, runCs: -0.439, rPa: 0.125, rpw: 10.367, cFip: 3.136 },
  { season: 1930, lgWoba: 0.352, wobaScale: 1.138, wBb: 0.749, wHbp: 0.777, w1b: 0.925, w2b: 1.266, w3b: 1.573, wHr: 1.945, runSb: 0.200, runCs: -0.492, rPa: 0.142, rpw: 11.449, cFip: 3.488 },
  { season: 1929, lgWoba: 0.354, wobaScale: 1.167, wBb: 0.752, wHbp: 0.782, w1b: 0.933, w2b: 1.284, w3b: 1.599, wHr: 1.988, runSb: 0.200, runCs: -0.478, rPa: 0.139, rpw: 11.162, cFip: 3.229 },
  { season: 1928, lgWoba: 0.342, wobaScale: 1.241, wBb: 0.742, wHbp: 0.773, w1b: 0.934, w2b: 1.306, w3b: 1.641, wHr: 2.080, runSb: 0.200, runCs: -0.438, rPa: 0.126, rpw: 10.355, cFip: 3.027 },
  { season: 1927, lgWoba: 0.344, wobaScale: 1.245, wBb: 0.746, wHbp: 0.777, w1b: 0.939, w2b: 1.313, w3b: 1.649, wHr: 2.087, runSb: 0.200, runCs: -0.441, rPa: 0.127, rpw: 10.403, cFip: 2.989 },
  { season: 1926, lgWoba: 0.346, wobaScale: 1.248, wBb: 0.749, wHbp: 0.780, w1b: 0.943, w2b: 1.317, w3b: 1.654, wHr: 2.093, runSb: 0.200, runCs: -0.442, rPa: 0.127, rpw: 10.424, cFip: 3.028 },
  { season: 1925, lgWoba: 0.350, wobaScale: 1.189, wBb: 0.751, wHbp: 0.781, w1b: 0.935, w2b: 1.292, w3b: 1.613, wHr: 2.014, runSb: 0.200, runCs: -0.470, rPa: 0.136, rpw: 11.003, cFip: 3.333 },
  { season: 1924, lgWoba: 0.343, wobaScale: 1.249, wBb: 0.749, wHbp: 0.780, w1b: 0.943, w2b: 1.318, w3b: 1.655, wHr: 2.093, runSb: 0.200, runCs: -0.444, rPa: 0.128, rpw: 10.479, cFip: 3.148 },
  { season: 1923, lgWoba: 0.346, wobaScale: 1.236, wBb: 0.751, wHbp: 0.781, w1b: 0.942, w2b: 1.313, w3b: 1.647, wHr: 2.077, runSb: 0.200, runCs: -0.450, rPa: 0.130, rpw: 10.596, cFip: 3.038 },
  { season: 1922, lgWoba: 0.347, wobaScale: 1.226, wBb: 0.748, wHbp: 0.778, w1b: 0.938, w2b: 1.305, w3b: 1.636, wHr: 2.063, runSb: 0.200, runCs: -0.449, rPa: 0.130, rpw: 10.569, cFip: 3.150 },
  { season: 1921, lgWoba: 0.344, wobaScale: 1.245, wBb: 0.745, wHbp: 0.776, w1b: 0.938, w2b: 1.312, w3b: 1.648, wHr: 2.086, runSb: 0.200, runCs: -0.440, rPa: 0.127, rpw: 10.396, cFip: 3.136 },
  { season: 1920, lgWoba: 0.333, wobaScale: 1.346, wBb: 0.741, wHbp: 0.774, w1b: 0.949, w2b: 1.353, w3b: 1.717, wHr: 2.217, runSb: 0.200, runCs: -0.401, rPa: 0.115, rpw: 9.608, cFip: 2.803 },
  { season: 1919, lgWoba: 0.322, wobaScale: 1.432, wBb: 0.728, wHbp: 0.764, w1b: 0.950, w2b: 1.380, w3b: 1.766, wHr: 2.326, runSb: 0.200, runCs: -0.363, rPa: 0.103, rpw: 8.826, cFip: 2.486 },
  { season: 1918, lgWoba: 0.317, wobaScale: 1.521, wBb: 0.733, wHbp: 0.771, w1b: 0.969, w2b: 1.425, w3b: 1.835, wHr: 2.446, runSb: 0.200, runCs: -0.342, rPa: 0.097, rpw: 8.417, cFip: 2.229 },
  { season: 1917, lgWoba: 0.311, wobaScale: 1.521, wBb: 0.726, wHbp: 0.764, w1b: 0.962, w2b: 1.418, w3b: 1.829, wHr: 2.441, runSb: 0.200, runCs: -0.340, rPa: 0.097, rpw: 8.366, cFip: 2.261 },
  { season: 1916, lgWoba: 0.312, wobaScale: 1.518, wBb: 0.725, wHbp: 0.762, w1b: 0.960, w2b: 1.415, w3b: 1.825, wHr: 2.437, runSb: 0.200, runCs: -0.338, rPa: 0.096, rpw: 8.328, cFip: 2.315 },
  { season: 1915, lgWoba: 0.318, wobaScale: 1.471, wBb: 0.733, wHbp: 0.770, w1b: 0.961, w2b: 1.402, w3b: 1.799, wHr: 2.377, runSb: 0.200, runCs: -0.359, rPa: 0.103, rpw: 8.758, cFip: 2.409 },
  { season: 1914, lgWoba: 0.321, wobaScale: 1.453, wBb: 0.734, wHbp: 0.771, w1b: 0.960, w2b: 1.395, w3b: 1.788, wHr: 2.355, runSb: 0.200, runCs: -0.364, rPa: 0.105, rpw: 8.850, cFip: 2.436 },
  { season: 1913, lgWoba: 0.325, wobaScale: 1.418, wBb: 0.737, wHbp: 0.773, w1b: 0.957, w2b: 1.383, w3b: 1.766, wHr: 2.311, runSb: 0.200, runCs: -0.376, rPa: 0.109, rpw: 9.104, cFip: 2.556 },
  { season: 1912, lgWoba: 0.337, wobaScale: 1.342, wBb: 0.752, wHbp: 0.786, w1b: 0.960, w2b: 1.363, w3b: 1.725, wHr: 2.215, runSb: 0.200, runCs: -0.414, rPa: 0.120, rpw: 9.870, cFip: 2.849 },
  { season: 1911, lgWoba: 0.336, wobaScale: 1.347, wBb: 0.752, wHbp: 0.786, w1b: 0.961, w2b: 1.365, w3b: 1.728, wHr: 2.222, runSb: 0.200, runCs: -0.412, rPa: 0.119, rpw: 9.828, cFip: 2.768 },
  { season: 1910, lgWoba: 0.318, wobaScale: 1.486, wBb: 0.738, wHbp: 0.776, w1b: 0.969, w2b: 1.415, w3b: 1.816, wHr: 2.398, runSb: 0.200, runCs: -0.361, rPa: 0.103, rpw: 8.788, cFip: 2.322 },
  { season: 1909, lgWoba: 0.306, wobaScale: 1.554, wBb: 0.729, wHbp: 0.768, w1b: 0.970, w2b: 1.437, w3b: 1.856, wHr: 2.483, runSb: 0.200, runCs: -0.339, rPa: 0.097, rpw: 8.352, cFip: 2.215 },
  { season: 1908, lgWoba: 0.297, wobaScale: 1.586, wBb: 0.719, wHbp: 0.758, w1b: 0.964, w2b: 1.440, w3b: 1.869, wHr: 2.518, runSb: 0.200, runCs: -0.327, rPa: 0.093, rpw: 8.099, cFip: 2.101 },
  { season: 1907, lgWoba: 0.305, wobaScale: 1.558, wBb: 0.730, wHbp: 0.769, w1b: 0.972, w2b: 1.439, w3b: 1.860, wHr: 2.486, runSb: 0.200, runCs: -0.341, rPa: 0.097, rpw: 8.392, cFip: 2.178 },
  { season: 1906, lgWoba: 0.306, wobaScale: 1.533, wBb: 0.730, wHbp: 0.768, w1b: 0.968, w2b: 1.427, w3b: 1.841, wHr: 2.452, runSb: 0.200, runCs: -0.348, rPa: 0.099, rpw: 8.525, cFip: 2.366 },
  { season: 1905, lgWoba: 0.307, wobaScale: 1.477, wBb: 0.730, wHbp: 0.767, w1b: 0.959, w2b: 1.402, w3b: 1.801, wHr: 2.376, runSb: 0.200, runCs: -0.367, rPa: 0.105, rpw: 8.923, cFip: 2.522 },
  { season: 1904, lgWoba: 0.301, wobaScale: 1.493, wBb: 0.720, wHbp: 0.758, w1b: 0.952, w2b: 1.399, w3b: 1.802, wHr: 2.391, runSb: 0.200, runCs: -0.357, rPa: 0.102, rpw: 8.711, cFip: 2.418 },
  { season: 1903, lgWoba: 0.317, wobaScale: 1.365, wBb: 0.738, wHbp: 0.772, w1b: 0.949, w2b: 1.359, w3b: 1.727, wHr: 2.228, runSb: 0.200, runCs: -0.411, rPa: 0.118, rpw: 9.809, cFip: 2.755 },
  { season: 1902, lgWoba: 0.322, wobaScale: 1.377, wBb: 0.745, wHbp: 0.779, w1b: 0.958, w2b: 1.371, w3b: 1.743, wHr: 2.249, runSb: 0.200, runCs: -0.410, rPa: 0.117, rpw: 9.775, cFip: 2.665 },
  { season: 1901, lgWoba: 0.327, wobaScale: 1.289, wBb: 0.751, wHbp: 0.783, w1b: 0.950, w2b: 1.337, w3b: 1.685, wHr: 2.132, runSb: 0.200, runCs: -0.453, rPa: 0.130, rpw: 10.646, cFip: 2.924 },
  { season: 1900, lgWoba: 0.339, wobaScale: 1.255, wBb: 0.765, wHbp: 0.796, w1b: 0.959, w2b: 1.336, w3b: 1.674, wHr: 2.095, runSb: 0.200, runCs: -0.474, rPa: 0.136, rpw: 11.078, cFip: 2.827 },
  { season: 1899, lgWoba: 0.343, wobaScale: 1.248, wBb: 0.771, wHbp: 0.803, w1b: 0.965, w2b: 1.339, w3b: 1.676, wHr: 2.090, runSb: 0.200, runCs: -0.481, rPa: 0.138, rpw: 11.219, cFip: 2.935 },
  { season: 1898, lgWoba: 0.334, wobaScale: 1.311, wBb: 0.768, wHbp: 0.800, w1b: 0.971, w2b: 1.364, w3b: 1.718, wHr: 2.169, runSb: 0.200, runCs: -0.456, rPa: 0.130, rpw: 10.725, cFip: 2.766 },
  { season: 1897, lgWoba: 0.354, wobaScale: 1.162, wBb: 0.781, wHbp: 0.810, w1b: 0.961, w2b: 1.309, w3b: 1.623, wHr: 1.981, runSb: 0.200, runCs: -0.529, rPa: 0.151, rpw: 12.201, cFip: 3.323 },
  { season: 1896, lgWoba: 0.354, wobaScale: 1.152, wBb: 0.782, wHbp: 0.811, w1b: 0.961, w2b: 1.306, w3b: 1.617, wHr: 1.967, runSb: 0.200, runCs: -0.538, rPa: 0.154, rpw: 12.373, cFip: 3.425 },
  { season: 1895, lgWoba: 0.361, wobaScale: 1.091, wBb: 0.791, wHbp: 0.818, w1b: 0.960, w2b: 1.287, w3b: 1.582, wHr: 1.888, runSb: 0.200, runCs: -0.583, rPa: 0.165, rpw: 13.289, cFip: 3.727 },
  { season: 1894, lgWoba: 0.379, wobaScale: 0.996, wBb: 0.801, wHbp: 0.825, w1b: 0.955, w2b: 1.254, w3b: 1.523, wHr: 1.773, runSb: 0.200, runCs: -0.642, rPa: 0.184, rpw: 14.483, cFip: 3.929 },
  { season: 1893, lgWoba: 0.356, wobaScale: 1.129, wBb: 0.794, wHbp: 0.823, w1b: 0.969, w2b: 1.308, w3b: 1.613, wHr: 1.937, runSb: 0.200, runCs: -0.571, rPa: 0.162, rpw: 13.044, cFip: 3.374 },
  { season: 1892, lgWoba: 0.317, wobaScale: 1.332, wBb: 0.762, wHbp: 0.795, w1b: 0.969, w2b: 1.368, w3b: 1.728, wHr: 2.182, runSb: 0.200, runCs: -0.464, rPa: 0.133, rpw: 10.869, cFip: 2.530 },
  { season: 1891, lgWoba: 0.332, wobaScale: 1.250, wBb: 0.778, wHbp: 0.809, w1b: 0.971, w2b: 1.347, w3b: 1.684, wHr: 2.082, runSb: 0.200, runCs: -0.508, rPa: 0.146, rpw: 11.776, cFip: 2.679 },
  { season: 1890, lgWoba: 0.337, wobaScale: 1.210, wBb: 0.784, wHbp: 0.814, w1b: 0.971, w2b: 1.334, w3b: 1.661, wHr: 2.031, runSb: 0.200, runCs: -0.533, rPa: 0.153, rpw: 12.283, cFip: 2.968 },
  { season: 1889, lgWoba: 0.333, wobaScale: 1.204, wBb: 0.776, wHbp: 0.806, w1b: 0.963, w2b: 1.324, w3b: 1.649, wHr: 2.019, runSb: 0.200, runCs: -0.530, rPa: 0.154, rpw: 12.219, cFip: 3.080 },
  { season: 1888, lgWoba: 0.291, wobaScale: 1.363, wBb: 0.732, wHbp: 0.766, w1b: 0.943, w2b: 1.352, w3b: 1.721, wHr: 2.199, runSb: 0.200, runCs: -0.443, rPa: 0.131, rpw: 10.445, cFip: 2.659 },
  { season: 1887, lgWoba: 0.332, wobaScale: 1.146, wBb: 0.771, wHbp: 0.800, w1b: 0.949, w2b: 1.293, w3b: 1.602, wHr: 1.936, runSb: 0.200, runCs: -0.562, rPa: 0.165, rpw: 12.860, cFip: 3.277 },
  { season: 1886, lgWoba: 0.303, wobaScale: 1.282, wBb: 0.751, wHbp: 0.783, w1b: 0.950, w2b: 1.335, w3b: 1.681, wHr: 2.097, runSb: 0.200, runCs: -0.495, rPa: 0.146, rpw: 11.506, cFip: 3.101 },
  { season: 1885, lgWoba: 0.288, wobaScale: 1.320, wBb: 0.733, wHbp: 0.766, w1b: 0.937, w2b: 1.333, w3b: 1.690, wHr: 2.136, runSb: 0.200, runCs: -0.469, rPa: 0.140, rpw: 10.980, cFip: 2.881 },
  { season: 1884, lgWoba: 0.279, wobaScale: 1.288, wBb: 0.725, wHbp: 0.757, w1b: 0.925, w2b: 1.311, w3b: 1.659, wHr: 2.082, runSb: 0.200, runCs: -0.487, rPa: 0.146, rpw: 11.352, cFip: 3.269 },
  { season: 1883, lgWoba: 0.286, wobaScale: 1.235, wBb: 0.727, wHbp: 0.758, w1b: 0.918, w2b: 1.289, w3b: 1.622, wHr: 2.015, runSb: 0.200, runCs: -0.509, rPa: 0.151, rpw: 11.786, cFip: 3.256 },
  { season: 1882, lgWoba: 0.276, wobaScale: 1.296, wBb: 0.717, wHbp: 0.749, w1b: 0.918, w2b: 1.307, w3b: 1.657, wHr: 2.091, runSb: 0.200, runCs: -0.475, rPa: 0.141, rpw: 11.106, cFip: 2.764 },
  { season: 1881, lgWoba: 0.290, wobaScale: 1.314, wBb: 0.725, wHbp: 0.757, w1b: 0.928, w2b: 1.322, w3b: 1.677, wHr: 2.129, runSb: 0.200, runCs: -0.456, rPa: 0.135, rpw: 10.725, cFip: 2.688 },
  { season: 1880, lgWoba: 0.267, wobaScale: 1.371, wBb: 0.701, wHbp: 0.735, w1b: 0.913, w2b: 1.324, w3b: 1.694, wHr: 2.186, runSb: 0.200, runCs: -0.428, rPa: 0.127, rpw: 10.143, cFip: 2.533 },
  { season: 1879, lgWoba: 0.271, wobaScale: 1.309, wBb: 0.711, wHbp: 0.743, w1b: 0.913, w2b: 1.306, w3b: 1.659, wHr: 2.103, runSb: 0.200, runCs: -0.467, rPa: 0.138, rpw: 10.939, cFip: 2.739 },
  { season: 1878, lgWoba: 0.279, wobaScale: 1.353, wBb: 0.726, wHbp: 0.760, w1b: 0.936, w2b: 1.342, w3b: 1.707, wHr: 2.173, runSb: 0.200, runCs: -0.457, rPa: 0.136, rpw: 10.733, cFip: 2.536 },
  { season: 1877, lgWoba: 0.289, wobaScale: 1.275, wBb: 0.735, wHbp: 0.767, w1b: 0.933, w2b: 1.315, w3b: 1.660, wHr: 2.074, runSb: 0.200, runCs: -0.495, rPa: 0.146, rpw: 11.497, cFip: 2.839 },
  { season: 1876, lgWoba: 0.277, wobaScale: 1.292, wBb: 0.737, wHbp: 0.769, w1b: 0.937, w2b: 1.325, w3b: 1.674, wHr: 2.087, runSb: 0.200, runCs: -0.506, rPa: 0.150, rpw: 11.722, cFip: 2.233 },
  { season: 1875, lgWoba: 0.261, wobaScale: 1.274, wBb: 0.730, wHbp: 0.761, w1b: 0.927, w2b: 1.309, w3b: 1.654, wHr: 2.045, runSb: 0.200, runCs: -0.531, rPa: 0.156, rpw: 12.231, cFip: 2.370 },
  { season: 1874, lgWoba: 0.282, wobaScale: 1.145, wBb: 0.760, wHbp: 0.789, w1b: 0.938, w2b: 1.281, w3b: 1.591, wHr: 1.886, runSb: 0.200, runCs: -0.629, rPa: 0.179, rpw: 14.227, cFip: 2.808 },
  { season: 1873, lgWoba: 0.303, wobaScale: 1.025, wBb: 0.788, wHbp: 0.814, w1b: 0.947, w2b: 1.255, w3b: 1.531, wHr: 1.739, runSb: 0.200, runCs: -0.741, rPa: 0.207, rpw: 16.482, cFip: 2.932 },
  { season: 1872, lgWoba: 0.297, wobaScale: 1.020, wBb: 0.791, wHbp: 0.816, w1b: 0.949, w2b: 1.255, w3b: 1.530, wHr: 1.725, runSb: 0.200, runCs: -0.763, rPa: 0.213, rpw: 16.926, cFip: 3.508 },
  { season: 1871, lgWoba: 0.312, wobaScale: 0.909, wBb: 0.797, wHbp: 0.820, w1b: 0.938, w2b: 1.211, w3b: 1.456, wHr: 1.584, runSb: 0.200, runCs: -0.863, rPa: 0.237, rpw: 18.954, cFip: 3.580 },
];

// ────────────────────────────────────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────────────────────────────────────

export async function handleLoadWobaWeights(options: {
  upsert?: boolean;
}): Promise<void> {
  const { upsert = false } = options;

  LOGGER.info(
    `Loading ${GUTS_DATA.length} seasons of wOBA weights (upsert=${String(upsert)})…`,
  );

  const opts = getDbOptions();
  await runWithPublicClient(opts, async (db: PublicDb) => {
    const batchSize = 50;
    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < GUTS_DATA.length; i += batchSize) {
      const batch = GUTS_DATA.slice(i, i + batchSize);
      const values = batch
        .map(
          (r) =>
            `(${r.season}, ${r.lgWoba}, ${r.wobaScale}, ${r.wBb}, ${r.wHbp}, ${r.w1b}, ${r.w2b}, ${r.w3b}, ${r.wHr}, ${r.runSb}, ${r.runCs}, ${r.rPa}, ${r.rpw}, ${r.cFip})`,
        )
        .join(',\n');

      const onConflict = upsert
        ? `ON CONFLICT (season) DO UPDATE SET
             lg_woba    = EXCLUDED.lg_woba,
             woba_scale = EXCLUDED.woba_scale,
             w_bb       = EXCLUDED.w_bb,
             w_hbp      = EXCLUDED.w_hbp,
             w_1b       = EXCLUDED.w_1b,
             w_2b       = EXCLUDED.w_2b,
             w_3b       = EXCLUDED.w_3b,
             w_hr       = EXCLUDED.w_hr,
             run_sb     = EXCLUDED.run_sb,
             run_cs     = EXCLUDED.run_cs,
             r_pa       = EXCLUDED.r_pa,
             rpw        = EXCLUDED.rpw,
             c_fip      = EXCLUDED.c_fip`
        : 'ON CONFLICT (season) DO NOTHING';

      const sql = `
        INSERT INTO public.woba_season_weights
          (season, lg_woba, woba_scale, w_bb, w_hbp, w_1b, w_2b, w_3b, w_hr, run_sb, run_cs, r_pa, rpw, c_fip)
        VALUES ${values}
        ${onConflict}
      `;

      const result = await db.execute(sql);
      const rowsAffected =
        typeof result === 'object' && result !== null && 'rowCount' in result
          ? (result.rowCount as number)
          : batch.length;

      inserted += rowsAffected;
      skipped += batch.length - rowsAffected;
    }

    LOGGER.info(
      `✅ Done — ${inserted} rows inserted/updated, ${skipped} skipped (already existed).`,
    );
  });
}

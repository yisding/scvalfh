/**
 * The site's one vocabulary for a position. In field hockey and soccer: Forward, Midfield, Defense,
 * Goalkeeper. In basketball: Guard, Forward, Center and the five numbered spots' names, so MaxPreps' "G" is
 * a guard there and never a goalkeeper.
 * The roster prints MaxPreps' codes with it (components/teams/roster-view.ts) and the 2025-26
 * archive prints the all-league documents' free text with it (components/history/history-view.ts),
 * so "D", "Defender" and "Defense" all read "Defense" wherever a position appears.
 *
 * Server-side: it reads the build's sport (lib/sports/current.ts `Sport.stats.model`).
 */

import { SPORT } from '../../lib/sports/current';

/** MaxPreps' field hockey (and soccer) position codes. */
const GOAL_SPORT_POSITION_WORDS: Readonly<Record<string, string>> = {
  F: 'Forward',
  M: 'Midfield',
  D: 'Defense',
  G: 'Goalkeeper',
};

/**
 * MaxPreps' basketball position codes: G, F and C on the 2026-27 boys rosters read 2026-11-10 (Lynbrook, Los
 * Altos: "G", "F", "C", "G, F", "F, C"); the five numbered spots are MaxPreps' other basketball choices.
 */
const BASKETBALL_POSITION_WORDS: Readonly<Record<string, string>> = {
  G: 'Guard',
  F: 'Forward',
  C: 'Center',
  PG: 'Point guard',
  SG: 'Shooting guard',
  SF: 'Small forward',
  PF: 'Power forward',
};

/**
 * MaxPreps' volleyball position codes: OH, DS, MB, OPP, S, L, MH and RS on the 2026 girls rosters read
 * 2026-11-14. MB and MH are one position (middle blocker, middle hitter) under two codes, each printed in its
 * own words; OPP and RS are the opposite, or right-side, hitter the same way.
 */
const VOLLEYBALL_POSITION_WORDS: Readonly<Record<string, string>> = {
  OH: 'Outside hitter',
  MB: 'Middle blocker',
  MH: 'Middle hitter',
  OPP: 'Opposite',
  RS: 'Right side',
  S: 'Setter',
  L: 'Libero',
  DS: 'Defensive specialist',
};

const BASKETBALL = SPORT.stats.model === 'basketball';
const VOLLEYBALL = SPORT.stats.model === 'volleyball';

/** The build's sport's position codes, in words. */
export const POSITION_WORDS: Readonly<Record<string, string>> = BASKETBALL
  ? BASKETBALL_POSITION_WORDS
  : VOLLEYBALL
    ? VOLLEYBALL_POSITION_WORDS
    : GOAL_SPORT_POSITION_WORDS;

/**
 * Every spelling the all-league documents use for one position, lower-cased, with its code. "Mid
 * Center" and "Center Left" are midfield spots (center mid, left mid). A spelling not listed here is
 * printed as the document wrote it.
 */
const SPELLINGS: Readonly<Record<string, string>> = BASKETBALL
  ? {
      g: 'G', guard: 'G', f: 'F', forward: 'F', wing: 'F', c: 'C', center: 'C', post: 'C',
      pg: 'PG', 'point guard': 'PG', sg: 'SG', 'shooting guard': 'SG',
      sf: 'SF', 'small forward': 'SF', pf: 'PF', 'power forward': 'PF',
    }
  : VOLLEYBALL
  ? {
      // The 2025-26 SCVAL all-league documents' spellings: "Lib", "Libero", "LIB", "OP", "Opp", "M", "Setter" ("Pin", a pin hitter, is kept as written).
      oh: 'OH', outside: 'OH', 'outside hitter': 'OH', mb: 'MB', m: 'MB', middle: 'MB', 'middle blocker': 'MB',
      mh: 'MH', 'middle hitter': 'MH', opp: 'OPP', op: 'OPP', opposite: 'OPP', rs: 'RS', 'right side': 'RS',
      s: 'S', setter: 'S', l: 'L', lib: 'L', libero: 'L', ds: 'DS', 'defensive specialist': 'DS',
    }
  : {
      f: 'F', forward: 'F', attack: 'F',
      m: 'M', mid: 'M', midfield: 'M', midfielder: 'M', midfiled: 'M', 'mid center': 'M', 'center left': 'M',
      d: 'D', defense: 'D', defender: 'D',
      g: 'G', gk: 'G', goalie: 'G', goalkeeper: 'G',
    };

/** Positions joined the way the roster joins them: "Forward / Midfield". */
export function positionWords(codes: readonly string[]): string {
  return codes.map((c) => POSITION_WORDS[c] ?? c).join(' / ');
}

/**
 * A document's free-text position in the site's words: "Defender" → "Defense", "GK" → "Goalkeeper",
 * "F, M" → "Forward / Midfield", "Forward/ D" → "Forward / Defense". A part it does not know is kept
 * as written. null (an empty cell) stays null.
 */
export function positionFromText(raw: string | null): string | null {
  if (raw === null) return null;
  const parts = raw
    .split(/\s*[,/]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const words = parts.map((p) => {
    const code = SPELLINGS[p.toLowerCase()];
    return code ? POSITION_WORDS[code] : p;
  });
  return [...new Set(words)].join(' / ');
}

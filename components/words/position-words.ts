/**
 * The site's one vocabulary for a field hockey position: Forward, Midfield, Defense, Goalkeeper.
 * The roster prints MaxPreps' codes with it (components/teams/roster-view.ts) and the 2025-26
 * archive prints the all-league documents' free text with it (components/history/history-view.ts),
 * so "D", "Defender" and "Defense" all read "Defense" wherever a position appears.
 */

/** MaxPreps' field hockey position codes. */
export const POSITION_WORDS: Readonly<Record<string, string>> = {
  F: 'Forward',
  M: 'Midfield',
  D: 'Defense',
  G: 'Goalkeeper',
};

/**
 * Every spelling the all-league documents use for one position, lower-cased, with its code. "Mid
 * Center" and "Center Left" are midfield spots (center mid, left mid). A spelling not listed here is
 * printed as the document wrote it.
 */
const SPELLINGS: Readonly<Record<string, keyof typeof POSITION_WORDS>> = {
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

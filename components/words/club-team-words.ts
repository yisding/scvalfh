/**
 * How a club page names the club team a player is on (an affiliation's `clubTeam`), in soccer.
 *
 * `clubTeam` holds whatever its source wrote ("Force (CA) ECNL G2008/09", "09G ECNL-RL", "Ecnl rl",
 * "2009G RL-ECNL", "Bay Area Surf ECNL"), so the same team read six ways across clubs. A club page
 * prints one shape instead: the team's own name, if it has one, then its league, as the leagues
 * name their teams themselves:
 *
 *   Juventus ECNL   Madrid ECNL   Quicksilver Green GA   Gold   ECNL RL   GA and NPL 1
 *
 *   - the league in one spelling each: ECNL, ECNL RL, GA (Girls Academy), DPL, NPL, State Premier;
 *     two leagues are joined with "and";
 *   - no club name (the page is the club's; a row can also name a partner club, "SVSA"), no "(CA)";
 *   - no age group or birth year (G2008/09, 09G, '07, U17, 10g): the row prints the player's grade
 *     beside it, and the sources give the team's age in five shapes or not at all;
 *   - what is left is the team's own name ("Juventus", "Quicksilver Green", "Gold"), with each
 *     word capitalized;
 *   - null when nothing is left ("2009G", "AFC", "Bay Area Surf 09G"): the row prints no team.
 *
 * The data file keeps its own wording: this is display only, so a source's spelling is still there
 * for a maintainer, and a tie added by hand later is printed in the same shape without an edit.
 * tests/ui/club-team-words.test.ts pins what every `clubTeam` in data/soccer/clubs.json reads as.
 */

/** A league, as matched in a source's wording, and how a page names it. Order matters: RL before ECNL. */
const LEAGUES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:ECNL[\s-]*RL|RL[\s-]*ECNL|ECRL)\b/i, 'ECNL RL'],
  [/\bECNL\b/i, 'ECNL'],
  [/\b(?:GA|Girls Academy)(?:\s+(II))?\b/i, 'GA'],
  [/\bDPL\b/i, 'DPL'],
  [/\bNPL\s*(1)?\b/i, 'NPL'],
  [/\bState Premier\b/i, 'State Premier'],
];

/**
 * An age group or a birth year, in each shape the sources use: 2009, 2009/10, G2008/09, 2010G, 09G,
 * 10g, G10, 08/07, '07, U17, U-16, 16u, and "Girls"/"G" standing alone.
 */
const AGE = new RegExp(
  [
    String.raw`\bG?(?:19|20)\d{2}(?:/\d{2,4})?G?\b`,
    String.raw`\bG?\d{2}(?:/\d{2})?G?\b`,
    String.raw`'\d{2}\b`,
    String.raw`\bU-?\d{2}\b`,
    String.raw`\b\d{2}U\b`,
    String.raw`\bGirls\b`,
    String.raw`\bG\b`,
  ].join('|'),
  'gi',
);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The first letter of each word upper-cased, the rest left as written ("Quicksilver green" → "Quicksilver Green"). */
const titled = (s: string) => s.replace(/(^|\s)(\p{Ll})/gu, (_, sp: string, c: string) => sp + c.toUpperCase());

/**
 * A soccer `clubTeam` as a club page prints it, or null when it names no team beyond its club and
 * age. `clubNames` holds every name a club goes by (each club's `name`, `shortName` and `aliases`),
 * each removed where it stands as whole words, longest first.
 */
export function soccerClubTeamWords(clubTeam: string, clubNames: readonly string[]): string | null {
  // "N1NPL" is two words run together: "N1", then the league.
  let s = ` ${clubTeam} `.replace(/\bN1NPL\b/gi, 'N1 NPL');

  // Leagues first, before any club name goes: some aliases carry one ("MVLA ECNL", "Force ECNL").
  // Kept in the order the source wrote them ("Girls Academy, ECNL RL" reads "GA and ECNL RL").
  const found: Array<{ at: number; words: string }> = [];
  for (const [pattern, label] of LEAGUES) {
    const m = pattern.exec(s);
    if (!m) continue;
    found.push({ at: m.index, words: m[1] ? `${label} ${m[1]}` : label });
    s = s.slice(0, m.index) + ' '.repeat(m[0].length) + s.slice(m.index + m[0].length);
  }
  const leagues = [...new Set(found.sort((x, y) => x.at - y.at).map((f) => f.words))];

  const names = [...new Set(clubNames)].filter((n) => n.trim().length > 0).sort((a, b) => b.length - a.length);
  for (const name of names) {
    s = s.replace(new RegExp(`(?<![\\w])${escape(name)}(?![\\w])`, 'gi'), ' ');
  }
  s = s.replace(/\(CA\)/gi, ' ');

  const rest = titled(
    s
      .replace(AGE, ' ')
      .replace(/\(\s*\)/g, ' ')
      .replace(/(?:^|\s)(?:and|&)(?=\s|$)/gi, ' ')
      .replace(/[,&()–-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );

  const words = [rest, leagues.join(' and ')].filter((w) => w.length > 0).join(' ');
  return words.length > 0 ? words : null;
}

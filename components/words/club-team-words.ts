/**
 * How a club page names the club team a player is on (an affiliation's `clubTeam`), in soccer.
 *
 * `clubTeam` holds whatever its source wrote ("Force (CA) ECNL G2008/09", "09G ECNL-RL", "Ecnl rl",
 * "2009G RL-ECNL", "Bay Area Surf ECNL"), so the same team read six ways across clubs. A club page
 * prints one shape instead: the team's own name, if it has one, then its league, then its birth
 * years, as the leagues name their teams themselves:
 *
 *   ECNL RL G2008/09   Juventus ECNL G2010   Madrid ECNL   Quicksilver Green GA G2009   Gold G2011
 *
 *   - the league in one spelling each: ECNL, ECNL RL, GA (Girls Academy), N1 (the National 1 League,
 *     which sources also write "National 1" and "N1NPL"), DPL, NPL, State Premier; two leagues are
 *     joined with "and";
 *   - the birth years when the source gives them, in the leagues' own form whatever shape the source
 *     used (G2008/09, 2009/10G, 09G, 10g, G10, '07, "Girls 09"): G and the year, G2009, or two years,
 *     the earlier first, G2008/09; two teams' years are joined with "and". An age group (U17, U-16,
 *     16u, U15G) is not a birth year (it moves with the season) and is left out, as is a birth year the
 *     source does not give: nothing is worked out from the player's grade;
 *   - no club name (the page is the club's; a row can also name a partner club, "SVSA"), no "(CA)";
 *   - what is left is the team's own name ("Juventus", "Quicksilver Green", "Gold"), with each
 *     word capitalized;
 *   - null when nothing is left ("AFC", "Bay Area Surf"): the row prints no team.
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
  // N1 before NPL: "N1NPL" is the National 1 League, not two leagues.
  [/\b(?:N1(?:NPL)?|National 1(?: League)?)\b/i, 'N1'],
  [/\bDPL\b/i, 'DPL'],
  [/\bNPL\s*(1)?\b/i, 'NPL'],
  [/\bState Premier\b/i, 'State Premier'],
];

/**
 * A birth year or a pair of them, in each shape the sources use: 2009, 2009/10, G2008/09, 2010G,
 * 09G, 10g, G10, 08/07, '07. Two digits, standing alone or with a G or an apostrophe; never part of
 * a longer word (U17, 16u, N1).
 */
const BIRTH_YEARS = /(?<![\w/'])(?:G|')?((?:19|20)?\d{2})(?:\/((?:19|20)?\d{2}))?G?(?![\w/])/gi;

/** What else marks a team's age and is not printed: an age group (U17, U15G), and "Girls"/"G" standing alone. */
const AGE_WORDS = /\bU-?\d{2}G?\b|\b\d{2}U\b|\bGirls\b|\bG\b/gi;

const fullYear = (y: string) => (y.length === 4 ? Number(y) : 2000 + Number(y));

/** "G2009", or "G2008/09" for a pair, the earlier year first. */
function birthYearWords(first: string, second: string | undefined): string {
  const a = fullYear(first);
  if (second === undefined) return `G${a}`;
  const b = fullYear(second);
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return lo === hi ? `G${lo}` : `G${lo}/${String(hi).slice(2)}`;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The first letter of each word upper-cased, the rest left as written ("Quicksilver green" → "Quicksilver Green"). */
const titled = (s: string) => s.replace(/(^|\s)(\p{Ll})/gu, (_, sp: string, c: string) => sp + c.toUpperCase());

/**
 * A soccer `clubTeam` as a club page prints it, or null when it names no team beyond its club.
 * `clubNames` holds every name a club goes by (each club's `name`, `shortName` and `aliases`), each
 * removed where it stands as whole words, longest first.
 */
export function soccerClubTeamWords(clubTeam: string, clubNames: readonly string[]): string | null {
  let s = ` ${clubTeam} `;

  // Leagues first, before any club name goes: some aliases carry one ("MVLA ECNL", "Force ECNL").
  // Kept in the order the source wrote them ("Girls Academy, ECNL RL" reads "GA and ECNL RL").
  // Every occurrence, so a second "ECNL RL" is not read again as "ECNL".
  const found: Array<{ at: number; words: string }> = [];
  for (const [pattern, label] of LEAGUES) {
    for (const m of [...s.matchAll(new RegExp(pattern.source, 'gi'))]) {
      found.push({ at: m.index, words: m[1] ? `${label} ${m[1]}` : label });
      s = s.slice(0, m.index) + ' '.repeat(m[0].length) + s.slice(m.index + m[0].length);
    }
  }
  const leagues = [...new Set(found.sort((x, y) => x.at - y.at).map((f) => f.words))];

  const names = [...new Set(clubNames)].filter((n) => n.trim().length > 0).sort((a, b) => b.length - a.length);
  for (const name of names) {
    s = s.replace(new RegExp(`(?<![\\w])${escape(name)}(?![\\w])`, 'gi'), ' ');
  }
  s = s.replace(/\(CA\)/gi, ' ');

  // Age groups before birth years: the 16 of "U-16" is not a birth year.
  s = s.replace(AGE_WORDS, ' ');
  const years: string[] = [];
  s = s.replace(BIRTH_YEARS, (_, first: string, second: string | undefined) => {
    const words = birthYearWords(first, second);
    if (!years.includes(words)) years.push(words);
    return ' ';
  });

  const rest = titled(
    s
      .replace(/\(\s*\)/g, ' ')
      .replace(/(?:^|\s)(?:and|&)(?=\s|$)/gi, ' ')
      .replace(/[,&()–-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );

  const words = [rest, leagues.join(' and '), years.join(' and ')].filter((w) => w.length > 0).join(' ');
  return words.length > 0 ? words : null;
}

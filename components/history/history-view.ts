/**
 * The 2025-26 archive's award lines in the site's own words (DESIGN §3.9). data/history-2025-26.json
 * keeps every document's text as written (it is provenance, rebuilt byte for byte by
 * scripts/build-history.ts); this is where the page turns it into one consistent form:
 *
 * - a school is its registry name (lib/history.ts historySchoolName), linked to its team page;
 * - a position is the roster's vocabulary (components/ui/position-words.ts): "Defender", "D" and
 *   "Defense" all read "Defense", "GK" and "Goalie" read "Goalkeeper";
 * - an award title says "of the Year" the same way in both leagues ("GK of the Year" and "Goalie of
 *   the Year" are both "Goalkeeper of the Year");
 * - an overall award ("St Ignatius- Olivia Van de Braak", "Leaya Cleary Los Gatos 12", "Trishna
 *   Sinha, Goalie, Lynbrook", "Elle Obenour, Leigh, Midfield") is split into the same player,
 *   position, grade and school a team-list line has, so it reads and links like one.
 *
 * Splitting an overall award is not guesswork: the school is the one spelling of a school in the
 * league (its registry name or an alias, the longest match, as whole words), a lone 9-12 is the
 * grade, and what is left is the player and, when there is one more part, the position. A grade or
 * position the line leaves out comes from the same document first: the player's own line in that
 * division's team lists, else what the award itself means (a "Senior of the Year" is in 12th
 * grade, a "Goalkeeper of the Year" is a goalkeeper). A grade still missing comes from the player's
 * row on this season's roster at the same school, by the same name, a season back (a junior now
 * was a sophomore then): a class year does not change between seasons. A position does not come
 * from this season's roster, since a player can change position; it stays unshown. A value that
 * does not split that way is printed as written.
 *
 * Every line then prints the way the rest of the site prints a player (the roster, /clubs,
 * /commits, /leaders): the school, then the grade in words ("Senior"), then the position.
 */

import {
  getHistorySeason,
  historySchoolName,
  type HistoryAwards,
  type HistoryPlayer,
} from '../../lib/history';
import { getEnrichedTeamRoster, getRosters } from '../../lib/rosters';
import { teamsInLeague } from '../../lib/teams';
import type { LeagueId, TeamSlug } from '../../lib/types';
import { positionFromText } from '../ui/position-words';

/** One award winner or team-list player, as the page prints them. */
export interface AwardLine {
  player: string;
  /** In the site's words; null when the document gives none. */
  position: string | null;
  /** 9-12; null when neither the document nor this season's roster gives one. */
  year: number | null;
  /** The registry name, or the document's spelling for a school the registry does not have. */
  school: string;
  slug: TeamSlug | null;
}

export interface OverallAwardView {
  /** The award's title in the site's words ("Goalkeeper of the Year"). */
  award: string;
  /** null: the value did not split, so the page prints `value` as written. */
  winner: AwardLine | null;
  /** The document's own text, verbatim. */
  value: string;
}

/** The titles the two leagues write differently, in one form. Any other title is printed as written. */
const AWARD_TITLES: Readonly<Record<string, string>> = {
  'Offensive Player': 'Offensive Player of the Year',
  'Defensive Player': 'Defensive Player of the Year',
  'GK of the Year': 'Goalkeeper of the Year',
  'Goalie of the Year': 'Goalkeeper of the Year',
};

const CLASS_YEAR: Readonly<Record<string, number>> = { Senior: 12, Junior: 11, Sophomore: 10, Freshman: 9 };

export function awardTitle(raw: string): string {
  return AWARD_TITLES[raw] ?? raw;
}

const sameName = (a: string, b: string) =>
  a.toLowerCase().replace(/\s+/g, ' ').trim() === b.toLowerCase().replace(/\s+/g, ' ').trim();

/** The first year of a season, from "2025-26" or "26-27". */
function seasonStart(season: string): number {
  const m = /^(\d{2}|\d{4})-\d{2}$/.exec(season);
  if (!m) throw new Error(`components/history/history-view.ts: cannot read season "${season}"`);
  return m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
}

/** How many seasons this season's roster is past the archive's (1: "26-27" after "2025-26"). */
const SEASONS_SINCE = seasonStart(getRosters().season) - seasonStart(getHistorySeason());

/**
 * The archive season's grade of the player this season's roster lists at `slug` by the same name,
 * or null: no such row, no grade on it, or one that would put the player outside 9-12 then.
 */
export function rosterYear(slug: TeamSlug | null, player: string): number | null {
  if (slug === null) return null;
  const row = getEnrichedTeamRoster(slug)?.players.find((p) => sameName(p.fullName, player));
  if (!row || row.grade === null) return null;
  const then = row.grade - SEASONS_SINCE;
  return then >= 9 && then <= 12 ? then : null;
}

/** A team-list line in the site's words. */
export function awardLine(p: HistoryPlayer): AwardLine {
  return {
    player: p.player,
    position: positionFromText(p.position),
    year: p.year,
    school: historySchoolName(p.slug, p.school),
    slug: p.slug,
  };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The longest spelling of one of the league's schools in `text`, as whole words, case for case. */
function findSchool(leagueId: LeagueId, text: string): { slug: TeamSlug; start: number; end: number } | null {
  const spellings = teamsInLeague(leagueId)
    .flatMap((t) => [t.name, t.shortName, ...t.aliases].map((spelling) => ({ spelling, slug: t.slug })))
    .sort((a, b) => b.spelling.length - a.spelling.length);
  for (const { spelling, slug } of spellings) {
    const m = new RegExp(`(?<![A-Za-z])${escapeRegExp(spelling)}(?![A-Za-z])`).exec(text);
    if (m) return { slug, start: m.index, end: m.index + spelling.length };
  }
  return null;
}

/**
 * An overall award's value split into player, position (as written), grade and school, or null when
 * it does not split cleanly (no school of the league in it, or more than a player and a position
 * left around it).
 */
export function splitOverallValue(
  leagueId: LeagueId,
  value: string,
): { player: string; position: string | null; year: number | null; slug: TeamSlug } | null {
  const school = findSchool(leagueId, value);
  if (!school) return null;
  const trim = (s: string) => s.replace(/^[\s,\-–]+|[\s,\-–]+$/g, '');
  const parts = [value.slice(0, school.start), value.slice(school.end)]
    .flatMap((side) => trim(side).split(/\s*,\s*/))
    .map((p) => p.trim())
    .filter(Boolean);
  let year: number | null = null;
  const rest: string[] = [];
  for (const part of parts) {
    if (/^(9|10|11|12)$/.test(part)) year = Number(part);
    else rest.push(part);
  }
  if (rest.length === 0 || rest.length > 2) return null;
  return { player: rest[0], position: rest[1] ?? null, year, slug: school.slug };
}

/** One division's overall awards (varsity or JV), each split into a linked award line. */
export function overallAwards(leagueId: LeagueId, awards: HistoryAwards): OverallAwardView[] {
  const listed = [...awards.firstTeam, ...awards.secondTeam, ...awards.honorableMention];
  return awards.overall.map((o) => {
    const award = awardTitle(o.award);
    const split = splitOverallValue(leagueId, o.value);
    if (!split) return { award, winner: null, value: o.value };
    const own = listed.find((p) => p.slug === split.slug && sameName(p.player, split.player));
    const classYear = /\b(Senior|Junior|Sophomore|Freshman) of the Year$/.exec(o.award)?.[1];
    return {
      award,
      value: o.value,
      winner: {
        player: split.player,
        position:
          positionFromText(split.position) ??
          positionFromText(own?.position ?? null) ??
          (award === 'Goalkeeper of the Year' ? 'Goalkeeper' : null),
        year:
          split.year ??
          own?.year ??
          (classYear ? CLASS_YEAR[classYear] : null) ??
          rosterYear(split.slug, split.player),
        school: historySchoolName(split.slug, ''),
        slug: split.slug,
      },
    };
  });
}

/**
 * The 2025-26 archive's award lines in the site's own words (DESIGN §3.9). data/history-2025-26.json
 * keeps every document's text as written (it is provenance, rebuilt byte for byte by
 * scripts/build-history.ts); this is where the page turns it into one consistent form:
 *
 * - a school is its registry name (lib/datasets/history.ts historySchoolName), linked to its team page;
 * - a position is the roster's vocabulary (views/shared/words/position.ts): "Defender", "D" and
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
 *
 * The page's league cards are built here too (`buildHistoryPageView`): every table row, award line
 * and champion carries its school already resolved (`team`, `school`), so the components under
 * components/history/ never read the archive or the registry themselves.
 */

import { getLeague, getSection, isIndependentLeague, leagueOfDivision } from '@/lib/config/leagues';
import {
  type AvailableLeagueHistory, type BracketSectionId, type HistoryAwards, type HistoryPlayer, type HistoryRow,
  type UnavailableLeagueHistory, bracketSectionName, getAvailableHistoryLeagues, getHistoryBracketFor,
  getHistoryBrackets, getHistoryChampions, getHistoryDivisionChanges, getHistoryLeagues, getHistorySeason,
  getHistoryUnpublishedTies, getUnavailableHistoryLeagues, historySchoolName,
} from '@/lib/datasets/history';
import { getEnrichedTeamRoster, getRosters } from '@/lib/datasets/rosters';
import { agree, listWords } from '@/lib/format/words';
import type { DivisionId, LeagueId, TeamSlug } from '@/lib/model/ids';
import type { Team } from '@/lib/model/team';
import { getTeamBySlug, teamsInLeague } from '@/lib/registry/teams';
import { positionFromText } from '@/views/shared/words/position';
import type { PageMetadataInput } from '@/views/site/page-metadata';

import { type SectionBracketView, sectionBracketView } from './bracket';

/** A school the registry tracks, as the archive's components draw it (mascot tile, name, link); null for one it does not. */
export type HistoryTeam = Pick<Team, 'slug' | 'name' | 'shortName'>;

const historyTeam = (slug: TeamSlug | null): HistoryTeam | null => (slug ? (getTeamBySlug(slug) ?? null) : null);

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
  /** The school's registry team, whose page the school links to; null for a school it does not have. */
  team: HistoryTeam | null;
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
  if (!m) throw new Error(`views/history/history-view.ts: cannot read season "${season}"`);
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
    team: historyTeam(p.slug),
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
        team: historyTeam(split.slug),
      },
    };
  });
}

/** One division's awards (varsity or JV) as AwardsBlock prints them: the overall awards, then the three lists. */
export interface AwardsView {
  overall: OverallAwardView[];
  firstTeam: AwardLine[];
  secondTeam: AwardLine[];
  honorableMention: AwardLine[];
}

/** A division's awards in the site's words (`overallAwards`, `awardLine`), for AwardsBlock. */
export function awardsView(awards: HistoryAwards): AwardsView {
  return {
    overall: overallAwards(leagueOfDivision(awards.division).id, awards),
    firstTeam: awards.firstTeam.map(awardLine),
    secondTeam: awards.secondTeam.map(awardLine),
    honorableMention: awards.honorableMention.map(awardLine),
  };
}

// ---------------------------------------------------------------- the league cards

/** One archive standings row, its school resolved: `school` is `historySchoolName`'s, `team` the registry's. */
export interface HistoryRowView extends HistoryRow {
  team: HistoryTeam | null;
  school: string;
}

function rowView(row: HistoryRow): HistoryRowView {
  return { ...row, team: historyTeam(row.slug), school: historySchoolName(row.slug, row.name) };
}

/** True when any of a league's tables publishes an overall record (BVAL's sheet; never SCVAL's). */
export function leagueHasOverall(tables: ReadonlyArray<ReadonlyArray<HistoryRow>>): boolean {
  return tables.some((rows) => rows.some((r) => r.overallRecord !== null));
}

/** One division of a league with final standings: its tables and awards, every school resolved. */
export interface HistoryDivisionView {
  division: DivisionId;
  label: string;
  standings: { varsity: HistoryRowView[]; jv: HistoryRowView[] };
  awards: { varsity: AwardsView | null; jv: AwardsView | null };
}

/** A league with final standings (components/history/AvailableLeague.tsx). */
export interface AvailableLeagueView {
  id: LeagueId;
  status: 'available';
  provenance: AvailableLeagueHistory['provenance'];
  divisions: HistoryDivisionView[];
  /**
   * Whether the league's tables draw an Overall column: the LEAGUE's answer (`leagueHasOverall`), so
   * every table of one league lines its record columns up (HistoryStandingsTable `hasOverall`).
   */
  hasOverall: boolean;
  /** Each division's first-place varsity row (`getHistoryChampions`). */
  champions: Array<{ division: DivisionId; team: HistoryTeam | null; school: string; leagueRecord: string }>;
  /** Teams the source lists in another division than the registry does today (`getHistoryDivisionChanges`). */
  changes: Array<{ slug: TeamSlug; name: string; historyDivision: DivisionId; registryDivision: DivisionId }>;
  /** Varsity rows whose source record has no ties field (`getHistoryUnpublishedTies`). */
  unpublishedTies: Array<{ school: string; leagueRecord: string }>;
}

/** A league marked unavailable (components/history/UnavailableLeague.tsx). */
export interface UnavailableLeagueView {
  id: LeagueId;
  status: 'unavailable';
  entry: UnavailableLeagueHistory;
  /** The section bracket on this page the card points to; null for a group of independents or a section with none. */
  bracket: { id: BracketSectionId; name: string } | null;
}

export type HistoryLeagueView = AvailableLeagueView | UnavailableLeagueView;

function availableLeagueView(id: LeagueId, entry: AvailableLeagueHistory): AvailableLeagueView {
  const divisions = entry.divisions;
  return {
    id,
    status: 'available',
    provenance: entry.provenance,
    divisions: divisions.map((d) => ({
      division: d.division,
      label: d.label,
      standings: { varsity: d.standings.varsity.map(rowView), jv: d.standings.jv.map(rowView) },
      awards: {
        varsity: d.awards.varsity ? awardsView(d.awards.varsity) : null,
        jv: d.awards.jv ? awardsView(d.awards.jv) : null,
      },
    })),
    // The Overall column too: every standings table of a league draws it or none does, so the
    // League and Overall columns sit at one x down the league's section and across its divisions.
    hasOverall: leagueHasOverall(divisions.flatMap((d) => [d.standings.varsity, d.standings.jv])),
    champions: getHistoryChampions(id).map(({ division, row }) => ({
      division,
      team: historyTeam(row.slug),
      school: historySchoolName(row.slug, row.name),
      leagueRecord: row.leagueRecord,
    })),
    changes: getHistoryDivisionChanges(id),
    unpublishedTies: getHistoryUnpublishedTies(id).map((r) => ({
      school: historySchoolName(r.slug, r.name),
      leagueRecord: r.leagueRecord,
    })),
  };
}

function unavailableLeagueView(id: LeagueId, entry: UnavailableLeagueHistory): UnavailableLeagueView {
  // The CCS and San Diego Section brackets are on this page: the card says where.
  const bracket = isIndependentLeague(id) ? null : getHistoryBracketFor(id);
  return {
    id,
    status: 'unavailable',
    entry,
    bracket: bracket ? { id: bracket.id, name: bracketSectionName(bracket.id) } : null,
  };
}

/**
 * Everything `/history/2025-26` says outside the league and bracket cards (app/history/2025-26/page.tsx,
 * DESIGN §1.1, §3.9): the season, the leagues and brackets in the order the page lays them out, and the
 * words of the lede. The leagues, divisions and notes all come from `data/history-2025-26.json` and
 * lib/config/leagues.ts, never from a literal list, so a league cannot be dropped or invented here.
 */
export interface HistoryPageView {
  /** '2025-26'. */
  season: string;
  /** The page's title, which is also its og:title: '2025-26 final standings'. */
  title: string;
  /** Every league's card, in lib/config/leagues.ts order. */
  leagues: HistoryLeagueView[];
  /** Each section's bracket block, with the league it follows. */
  brackets: SectionBracketView[];
  /** "the CCS and San Diego Section": the sections whose brackets the page shows. */
  bracketSections: string;
  /** "SCVAL and BVAL": the leagues whose final standings the page carries. */
  available: string;
  /** "PCAL, MCAL and EAL are", "MCAL is", or null when every league has its tables. */
  unavailableSubject: string | null;
  /** "The LA independents are this site’s grouping, so no table of them was published.", or null with no such group. */
  groupsSentence: string | null;
}

/** The page's view, built at render time from the committed archive. */
export function buildHistoryPageView(): HistoryPageView {
  const season = getHistorySeason();
  const brackets = getHistoryBrackets();
  const available = getAvailableHistoryLeagues();
  const unavailable = getUnavailableHistoryLeagues();
  const short = (id: LeagueId) => getLeague(id).shortName;
  /**
   * The unavailable leagues, and the groups of independents (the LA independents, DESIGN §24.9,
   * §24.10): "we found no official final standings" is said of the first only, since the group is this site's
   * grouping and nobody published a table of it.
   */
  const unavailableLeagues = unavailable.filter((l) => !isIndependentLeague(l.id));
  const unavailableGroups = unavailable.filter((l) => isIndependentLeague(l.id));
  return {
    season,
    title: `${season} final standings`,
    leagues: getHistoryLeagues().map(({ id, entry }) =>
      entry.status === 'available' ? availableLeagueView(id, entry) : unavailableLeagueView(id, entry),
    ),
    brackets: brackets.map(sectionBracketView),
    bracketSections: listWords(brackets.map((b) => getSection(b.id).briefLabel)),
    available: listWords(available.map((l) => short(l.id))),
    unavailableSubject: unavailableLeagues.length
      ? `${listWords(unavailableLeagues.map((l) => short(l.id)))} ${agree(unavailableLeagues.length, 'is', 'are')}`
      : null,
    groupsSentence: unavailableGroups.length
      ? `${listWords(unavailableGroups.map((l) => `the ${getLeague(l.id).name}`)).replace(/^t/, 'T')} are this site’s grouping, so no table of them was published.`
      : null,
  };
}

/** What `app/history/2025-26/page.tsx` hands `pageMetadata`: the metadata is static, so this runs once at module load. */
export function historyPageMeta(): PageMetadataInput {
  const { title, season, available, bracketSections, unavailableSubject, groupsSentence } = buildHistoryPageView();
  return {
    path: '/history/2025-26',
    title,
    description:
      `Final ${available} girls field hockey standings` +
      ` and all-league awards from the ${season} season, from each league’s own documents, and the` +
      ` ${bracketSections} playoff brackets.` +
      (unavailableSubject
        ? ` ${unavailableSubject} marked unavailable: we found no official ${season} final standings.`
        : '') +
      (groupsSentence ? ` ${groupsSentence}` : ''),
    ogTitle: title,
    card: 'root',
  };
}

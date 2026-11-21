/**
 * The read API for data/field-hockey/history-2025-26.json — the prior-season archive (DESIGN §3.9), validated
 * against lib/history/history-schema.ts.
 *
 * Why this is a separate file and not part of the snapshot: the 2025-26 standings exist ONLY in each
 * league's own end-of-season documents (SCVAL's two PDFs, BVAL's Google Sheet and all-league
 * documents; for PCAL, MCAL and EAL we found no official final standings, so they are marked
 * 'unavailable' with the reason, never filled from a third party). MaxPreps cannot serve a prior season at all — the year segment of
 * a league URL is cosmetic and always returns the CURRENT table (SPEC §1.1h) — so the daily cron has
 * nothing to fetch and this file is committed, built once by `scripts/build-history.ts`.
 *
 * Loaded and validated once at module scope, like lib/data.ts (and bundled at build time the same
 * way), so a bad file fails at import time rather than half-way through a render.
 */

import bundledBracketsFieldHockey from '../../data/field-hockey/history-brackets-2025-26.json';
import bundledBracketsBasketball from '../../data/basketball/history-brackets-2025-26.json';
import bundledBracketsVolleyball from '../../data/volleyball/history-brackets-2025-26.json';
import bundledBracketsSoccer from '../../data/soccer/history-brackets-2025-26.json';
import bundledBracketsValSoccer from '../../data/val-soccer/history-brackets-2025-26.json';
import bundledHistoryFieldHockey from '../../data/field-hockey/history-2025-26.json';
import bundledHistoryBasketball from '../../data/basketball/history-2025-26.json';
import bundledHistoryVolleyball from '../../data/volleyball/history-2025-26.json';
import bundledHistorySoccer from '../../data/soccer/history-2025-26.json';
import bundledHistoryValSoccer from '../../data/val-soccer/history-2025-26.json';
import {
  BRACKET_SECTION_IDS,
  BRACKET_TOURNAMENT_IDS,
  HistoryBracketsSchema,
  OtherHistoryBracketsSchema,
  type BracketSectionId,
  type BracketTournamentId,
  type HistoryBracketGame,
  type HistoryBracketSide,
  type PublishedBrackets,
  type SectionBracket,
  type TournamentBracket,
} from './history-brackets-schema';
import {
  HistorySchema,
  type AvailableLeagueHistory,
  type History,
  type HistoryAwards,
  type HistoryDivision,
  type HistoryLevel,
  type HistoryRow,
  type LeagueHistory,
  type UnavailableLeagueHistory,
} from './history-schema';
import { readOverride, validateData } from '../data-file';
import { listWords } from '../format';
import { LEAGUE_IDS, getDivision, getLeague, getSection, isIndependentLeague } from '../leagues';
import { getTeamBySlug } from '../teams';
import type { DivisionId, LeagueId, SectionId, TeamSlug } from '../types';
import { IS_FIELD_HOCKEY } from '../sports/current';

/** This build's copy (data/<sport>/: lib/sports/current.ts DATA_DIR). */
const bundledBrackets = process.env.SCVAL_SPORT === 'basketball' ? bundledBracketsBasketball : process.env.SCVAL_SPORT === 'volleyball' ? bundledBracketsVolleyball : process.env.SCVAL_SPORT === 'val-soccer' ? bundledBracketsValSoccer : process.env.SCVAL_SPORT === 'soccer' ? bundledBracketsSoccer : bundledBracketsFieldHockey;
/** This build's copy (data/<sport>/: lib/sports/current.ts DATA_DIR). */
const bundledHistory = process.env.SCVAL_SPORT === 'basketball' ? bundledHistoryBasketball : process.env.SCVAL_SPORT === 'volleyball' ? bundledHistoryVolleyball : process.env.SCVAL_SPORT === 'val-soccer' ? bundledHistoryValSoccer : process.env.SCVAL_SPORT === 'soccer' ? bundledHistorySoccer : bundledHistoryFieldHockey;

export type {
  AvailableLeagueHistory,
  History,
  HistoryAwards,
  HistoryDivision,
  HistoryLevel,
  HistoryPlayer,
  HistoryRow,
  LeagueHistory,
  UnavailableLeagueHistory,
} from './history-schema';
export type {
  BracketSectionId,
  BracketTournamentId,
  PublishedBrackets,
  HistoryBracketDivision,
  HistoryBracketGame,
  HistoryBracketRound,
  HistoryBracketSide,
  SectionBracket,
  TournamentBracket,
} from './history-brackets-schema';

/**
 * data/field-hockey/history-2025-26.json is imported, so the build bundles it, for the reason given in
 * lib/data.ts: a Worker has no project filesystem, and this module loads on the first
 * /history/2025-26 request in every Worker instance, cached page or not (the route's modules load
 * before the cache read). A missing file is a build error: run `pnpm build-history`. SCVAL_HISTORY
 * still swaps in another file through node:fs (Node only; never set it on a Worker).
 */
function load(): History {
  return validateData(
    'history',
    HistorySchema,
    readOverride('lib/history/history.ts', 'SCVAL_HISTORY', bundledHistory),
  );
}

// Every build has the 2025-26 archive: field hockey's nine leagues and its independents, and SCVAL alone in the
// soccer and basketball builds (data/<sport>/history-2025-26.json, from SCVAL's own PDFs).
const history = load();

export function getHistorySeason(): string {
  return history.season;
}

/** Every league's entry, in lib/leagues.ts order (SCVAL, BVAL, PCAL, MCAL, EAL). */
export function getHistoryLeagues(): Array<{ id: LeagueId; entry: LeagueHistory }> {
  // The schema gives every league of the build an entry.
  return LEAGUE_IDS.map((leagueId) => ({ id: leagueId, entry: history.leagues[leagueId] }));
}

/** The leagues that have final standings, in config order. */
export function getAvailableHistoryLeagues(): Array<{ id: LeagueId; entry: AvailableLeagueHistory }> {
  return getHistoryLeagues().filter(
    (x): x is { id: LeagueId; entry: AvailableLeagueHistory } => x.entry.status === 'available',
  );
}

/** The leagues marked unavailable, in config order. */
export function getUnavailableHistoryLeagues(): Array<{ id: LeagueId; entry: UnavailableLeagueHistory }> {
  return getHistoryLeagues().filter(
    (x): x is { id: LeagueId; entry: UnavailableLeagueHistory } => x.entry.status === 'unavailable',
  );
}

/**
 * "The LA independents are this site’s grouping, so no table of them was published.", or null with no such
 * group: the unavailable groups of independents (DESIGN §24.9, §24.10) are said apart from the unavailable
 * leagues, since nobody published a table of a group this site made. /history/2025-26's header
 * (components/history/history-page-view.ts) and /about's archive paragraph
 * (components/about/sections/SourcesSection.tsx) both print it.
 */
export function historyGroupsSentence(): string | null {
  const groups = getUnavailableHistoryLeagues().filter((l) => isIndependentLeague(l.id));
  return groups.length
    ? `${listWords(groups.map((l) => `the ${getLeague(l.id).name}`)).replace(/^t/, 'T')} are this site’s grouping, so no table of them was published.`
    : null;
}

export function hasHistory(leagueId: LeagueId): boolean {
  return history.leagues[leagueId]?.status === 'available';
}

/**
 * The last day any of the archive's sources was read or checked (YYYY-MM-DD): the latest
 * `retrievedOn` of a league's sources or a section's bracket, or `checkedOn` of an unavailable
 * league. It is the /history/2025-26 sitemap `lastmod` (app/sitemap.ts): the archive is a finished
 * season, so it changes only when a maintainer rebuilds it, never with the twice-daily snapshot.
 */
export function getHistoryLastChecked(): string {
  const leagueDays = getHistoryLeagues().flatMap(({ entry }) =>
    entry.status === 'unavailable'
      ? [entry.checkedOn]
      : 'retrievedOn' in entry.provenance
        ? [entry.provenance.retrievedOn]
        : [],
  );
  const bracketDays = [
    ...[...getHistoryBrackets(), ...getHistoryTournaments()].map((b) => b.bracket.retrievedOn),
    ...(getHistoryPublishedBrackets() ? [getHistoryPublishedBrackets()!.retrievedOn] : []),
  ];
  // Every section bracket and every league built from documents read on a day has a `retrievedOn`, and a
  // build either has a bracket (field hockey) or a league with one (soccer and basketball: SCVAL's PDFs), so
  // the list is never empty.
  return [...leagueDays, ...bracketDays].sort().at(-1)!;
}

/** The source credit of an available league (SCVAL's two PDFs, BVAL's sheet and documents). */
export function getHistoryProvenance(leagueId: LeagueId): AvailableLeagueHistory['provenance'] | null {
  const entry = history.leagues[leagueId];
  return entry?.status === 'available' ? entry.provenance : null;
}

/**
 * The name the page prints for a school in the archive: the registry's canonical `name`, the one
 * every other page uses. The file keeps each source's own spelling ("Saint Ignatius" in the team
 * table, "St Ignatius" in the awards block, "MItty", "Presentation HS"), and `slug` is the join
 * key; only a school with no slug prints as the source wrote it.
 */
export function historySchoolName(slug: TeamSlug | null, sourceName: string): string {
  return (slug ? getTeamBySlug(slug)?.name : undefined) ?? sourceName;
}

function divisionEntry(division: DivisionId): HistoryDivision | undefined {
  for (const { entry } of getAvailableHistoryLeagues()) {
    const found = entry.divisions.find((d) => d.division === division);
    if (found) return found;
  }
  return undefined;
}

export function getHistoryStandings(division: DivisionId, level: HistoryLevel = 'varsity'): HistoryRow[] {
  return divisionEntry(division)?.standings[level] ?? [];
}

export function getHistoryAwards(
  division: DivisionId,
  level: HistoryLevel = 'varsity',
): HistoryAwards | null {
  return divisionEntry(division)?.awards[level] ?? null;
}

/**
 * Every 2025-26 row for one school, across divisions and levels, with its league and the division's label as the
 * season named it: a division can be one the league no longer has (BVAL boys basketball's Santa Teresa North), which
 * lib/leagues.ts does not know.
 */
export function getHistoryFor(slug: TeamSlug): Array<{
  leagueId: LeagueId;
  division: DivisionId;
  /** The division's label in the archive ('Santa Teresa North'). */
  label: string;
  level: HistoryLevel;
  row: HistoryRow;
}> {
  const out: ReturnType<typeof getHistoryFor> = [];
  for (const { id, entry } of getAvailableHistoryLeagues()) {
    for (const d of entry.divisions) {
      for (const level of ['varsity', 'jv'] as const) {
        const row = d.standings[level].find((r) => r.slug === slug);
        if (row) out.push({ leagueId: id, division: d.division, label: d.label, level, row });
      }
    }
  }
  return out;
}

/**
 * One league's first-place varsity rows, for a one-line archive summary: every row placed 1st, so co-champions
 * (BVAL girls volleyball's 2025-26 Santa Teresa: Lincoln and Pioneer, 13-1 each) are both named.
 */
export function getHistoryChampions(leagueId: LeagueId): Array<{ division: DivisionId; row: HistoryRow }> {
  const entry = history.leagues[leagueId];
  if (entry?.status !== 'available') return [];
  return entry.divisions.flatMap((d) =>
    d.standings.varsity.filter((r) => r.place === 1).map((row) => ({ division: d.division, row })),
  );
}

/** The divisions of a league's 2025-26 entry that it no longer has (BVAL boys basketball's Santa Teresa North and South). */
export function getHistoryPastDivisions(leagueId: LeagueId): Array<{ division: DivisionId; label: string }> {
  const entry = history.leagues[leagueId];
  if (entry?.status !== 'available') return [];
  const past = new Set(entry.seasonAlignment?.pastDivisions ?? []);
  return entry.divisions.filter((d) => past.has(d.division)).map((d) => ({ division: d.division, label: d.label }));
}

/**
 * Teams whose 2025-26 division (as the source printed it) is not the division the registry lists
 * today (the 2026-27 alignment), e.g. Leland: Santa Teresa in the 2025-26 sheet, Mt. Hamilton in
 * the registry. The history keeps the source's division; the page says that the team moved. A row in a division
 * the league no longer has always moved. Labels come with the ids: the season's from the archive, today's from
 * lib/leagues.ts. `registryLeague` is the league it is in now, which is another league for a school that changed
 * leagues (Presentation: the WCAL in 2025-26, the WBAL's Foothill now).
 */
export function getHistoryDivisionChanges(leagueId: LeagueId): Array<{
  slug: TeamSlug;
  name: string;
  historyDivision: DivisionId;
  historyLabel: string;
  registryDivision: DivisionId;
  registryLabel: string;
  registryLeague: LeagueId;
}> {
  const entry = history.leagues[leagueId];
  if (entry?.status !== 'available') return [];
  const out: ReturnType<typeof getHistoryDivisionChanges> = [];
  for (const d of entry.divisions) {
    for (const r of d.standings.varsity) {
      const team = r.slug ? getTeamBySlug(r.slug) : undefined;
      if (r.slug && team && team.division !== d.division) {
        out.push({
          slug: r.slug,
          name: team.name,
          historyDivision: d.division,
          historyLabel: d.label,
          registryDivision: team.division,
          registryLabel: getDivision(team.division).label,
          registryLeague: team.league,
        });
      }
    }
  }
  return out;
}

/** Whether another row of the same table shares this row's place (BVAL's sheets print "2, 2, 4"; the WBAL's tables rank level teams alike). */
export function historyPlaceShared(rows: readonly HistoryRow[], row: HistoryRow): boolean {
  return rows.some((r) => r !== row && r.place === row.place);
}

/** Varsity rows whose source record has no ties field (`t` is null), by division. */
export function getHistoryUnpublishedTies(leagueId: LeagueId): HistoryRow[] {
  const entry = history.leagues[leagueId];
  if (entry?.status !== 'available') return [];
  return entry.divisions.flatMap((d) => d.standings.varsity.filter((r) => r.t === null));
}

// ---------------------------------------------------------------- section playoff brackets

/**
 * data/field-hockey/history-brackets-2025-26.json: the 2025 CCS and San Diego Section brackets, transcribed by
 * hand from each section's own documents, and the 2025 Tournament of Champions, assembled from a
 * school newspaper and MaxPreps' schedules (lib/history/history-brackets-schema.ts). Bundled and validated at
 * module scope, like the standings above.
 */
function loadBrackets() {
  return validateData('history brackets', HistoryBracketsSchema, bundledBrackets);
}

/**
 * The soccer, basketball and volleyball builds' file holds no transcribed section or tournament (their registries
 * hold too few of a section's schools to key its bracket by registry slug); it holds `published`, the 2025-26
 * brackets read whole from MaxPreps' tournament pages, validated here as their own contract.
 */
const otherBrackets = IS_FIELD_HOCKEY ? null : validateData('history brackets', OtherHistoryBracketsSchema, bundledBrackets);

const brackets = IS_FIELD_HOCKEY
  ? loadBrackets()
  : ({ ...otherBrackets, sections: {}, tournaments: {} } as unknown as ReturnType<typeof loadBrackets>);

/**
 * The 2025-26 CCS and CIF State brackets as MaxPreps published them (the soccer, basketball and volleyball builds'
 * `published`), or null: field hockey's archive transcribes its brackets (getHistoryBrackets) instead.
 */
export function getHistoryPublishedBrackets(): PublishedBrackets | null {
  return otherBrackets?.published ?? null;
}

/**
 * Each section with a 2025 bracket, in BRACKET_SECTION_IDS order (the CCS, then the San Diego Section): the
 * blocks /history/2025-26 opens with, each in its section's region.
 */
export function getHistoryBrackets(): Array<{ id: BracketSectionId; bracket: SectionBracket }> {
  // A section the field hockey archive has no bracket for is left out; the other builds keep their 2025-26
  // brackets in `published` (getHistoryPublishedBrackets).
  return BRACKET_SECTION_IDS.filter((id) => brackets.sections[id] !== undefined).map((id) => ({
    id,
    bracket: brackets.sections[id],
  }));
}

/** The section bracket of a league's section, or null when its section held none (NCS, NS, SS). */
export function getHistoryBracketFor(leagueId: LeagueId): { id: BracketSectionId; bracket: SectionBracket } | null {
  const sectionId: SectionId = getLeague(leagueId).sectionId;
  return getHistoryBrackets().find((b) => b.id === sectionId) ?? null;
}

/**
 * Each postseason with a 2025 bracket that no CIF section runs (the Tournament of Champions), with the leagues
 * whose postseason it is: /history/2025-26 draws it after the section brackets, in their region.
 */
export function getHistoryTournaments(): Array<{
  id: BracketTournamentId;
  bracket: TournamentBracket;
  /** The leagues whose postseason it is (the Sunset and the LA independents), in config order. */
  leagues: LeagueId[];
}> {
  return BRACKET_TOURNAMENT_IDS.filter((id) => brackets.tournaments[id] !== undefined).map((id) => {
    // The no-postseason leagues of the section whose teams play it (DESIGN §24.13): the Sunset and the LA
    // independents. Asserted in tests/history-brackets.test.ts.
    const leagues = LEAGUE_IDS.filter((l) => {
      const league = getLeague(l);
      return getSection(league.sectionId).outsideTournament?.id === id && league.postseason.kind === 'no-postseason';
    });
    return { id, bracket: brackets.tournaments[id], leagues };
  });
}

/** The 2025 tournament bracket a league's teams played in (the Sunset's and the LA independents'), or null. */
export function getHistoryTournamentFor(leagueId: LeagueId): ReturnType<typeof getHistoryTournaments>[number] | null {
  return getHistoryTournaments().find((t) => t.leagues.includes(leagueId)) ?? null;
}

/** The section's name for a bracket block ("Central Coast Section"). */
export function bracketSectionName(id: BracketSectionId): string {
  return getSection(id).name;
}

/** A game's winning and losing sides. */
export function bracketSides(game: HistoryBracketGame): { winner: HistoryBracketSide; loser: HistoryBracketSide } {
  return game.winner === 'top' ? { winner: game.top, loser: game.bottom } : { winner: game.bottom, loser: game.top };
}

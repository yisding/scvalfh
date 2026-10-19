/**
 * The /about page's view (app/about/page.tsx; DESIGN §3.10, SPEC §10.8): everything its sections print
 * that is computed rather than written — the per-league source, rules, health and cross-check data, the
 * jump list, the sentences that name leagues and documents, and the JV, history, club and commitment
 * counts. The sections themselves are components/about/About*.tsx; each takes the slice of this view it
 * prints.
 *
 * The pure helpers the sections share live here too: how a sentence names a section's rules document
 * (`rulesDocument`) and a league (`leagueRef`), which league's by-laws are quoted (`isQuotedLeague`), the
 * generated rules' wording tables and the "which games count" sentence (`ruleCountSentence`).
 */

import {
  SECTIONS, TOURNAMENT_LEAGUE_IDS, UNBRACKETED_LEAGUE_IDS, getLeague, getSection, isDefaultRegion,
  isIndependentLeague, leagueStandingsUrl, regionOf,
} from '@/lib/config/leagues';
import { getClubs } from '@/lib/datasets/clubs';
import { getCommitsFile } from '@/lib/datasets/commits';
import {
  getAvailableHistoryLeagues, getHistorySeason, getUnavailableHistoryLeagues,
} from '@/lib/datasets/history';
import { getJvFile } from '@/lib/datasets/jv';
import { getFetchedAt } from '@/lib/datasets/snapshot';
import type { JvDivisionTable } from '@/lib/engine/jv/standings';
import { crossCheckSkipReason } from '@/lib/engine/standings';
import { shortDate } from '@/lib/format/dates';
import { listWords, numberWord, officialSourceFormat } from '@/lib/format/words';
import type { CifssCrossCheck, CrossCheckRow, SbliveCrossCheck } from '@/lib/model/crosscheck';
import type { DroppedContest, LeagueHealth, SourceStatus } from '@/lib/model/health';
import type { OfficialSourceId } from '@/lib/model/ids';
import type { LeagueConfig, SectionConfig } from '@/lib/model/league-config';
import type { CcsPlayoffs } from '@/lib/model/postseason';
import type { Snapshot } from '@/lib/model/snapshot';
import type { TiebreakStage } from '@/lib/model/standings';
import type { Team } from '@/lib/model/team';
import { getOfficialFixtures } from '@/lib/queries/games';
import { getJvMerge, getJvTables } from '@/lib/queries/jv';
import { getLeagueHealth, getLeagueSummaries } from '@/lib/queries/leagues';
import type { LeagueSummary } from '@/lib/queries/leagues';
import { getCcsField, getPlayoffs } from '@/lib/queries/postseason';
import {
  areKeyDatesConfirmed, getCcsCalendar, getCifssCrossCheck, getCounts, getCrossCheck, getDropped,
  getOfficialStandingsPdfUrl, getSbliveCrossCheck, getSources,
} from '@/lib/queries/provenance';
import { getAllStandings } from '@/lib/queries/standings';
import { getTeams } from '@/lib/queries/teams';
import { getTeamBySlug } from '@/lib/registry/teams';

// ---------------------------------------------------------------- shapes

/** One team's cross-check group (components/about/CrossCheckTable.tsx renders it). */
export interface CrossCheckGroup {
  team: Team;
  /** The one-sentence summary from `Standing.mismatchDetail`, when the snapshot carries one. */
  detail?: string;
  /** The field-by-field rows for this team from `snapshot.crossCheck`. */
  rows: CrossCheckRow[];
}

/** One division's line on a league's health card (components/about/LeagueHealthCard.tsx renders it). */
export interface HealthDivision {
  id: string;
  /** Division heading, or null for a single-division league (no division label). */
  heading: string | null;
  /**
   * MaxPreps league standings page, or null where MaxPreps publishes no table for the division (the San
   * Diego Section's Valley: lib/config/leagues.ts leagueStandingsUrl). The card then says so, and that the
   * cross-check is skipped, instead of linking anything.
   */
  maxprepsUrl: string | null;
  /** Why there is no table (lib/engine/standings/maxpreps-crosscheck.ts crossCheckSkipReason); null when there is one. */
  skipReason?: string | null;
  /**
   * The division's standings rows that carry MaxPreps' reported record: the member rows its table
   * matched, read this run or carried. Counted from the standings rather than taken from the stored
   * `reportedRows`, which a snapshot written before 2026-10-04 counted with MaxPreps' extra
   * non-member row (EAL: Red Bluff).
   */
  memberRows: number;
  knownCause: string | null;
  official:
    | {
        source: OfficialSourceId;
        url: string;
        /** 'live-pdf' = read every run; 'bundled' = our transcription, sha256-checked against upstream. */
        mode: 'live-pdf' | 'bundled';
        revisedOn: string | null;
      }
    | {
        /** The league publishes no schedule (EAL, the Sunset, the San Diego leagues). */
        mode: 'none';
        /** `DivisionConfig.official.note`: where its league games come from instead. */
        note: string;
      };
}

/** One entry of the jump list; a league's rules entry carries its region, so the reader's region's entries show. */
export interface TocEntry {
  id: string;
  label: string;
  region?: LeagueSummary['region'];
}

/** What /about prints about one league: its source card, rules, health card and cross-check. */
export interface LeagueAbout {
  summary: LeagueSummary;
  config: LeagueConfig;
  /** No division publishes a schedule document (EAL): the card names where its rules come from instead. */
  noDocument: boolean;
  /** The distinct `official.note`s of its 'none' divisions. */
  officialNotes: string[];
  /** Contests dropped on purpose that involve its teams. */
  dropped: DroppedContest[];
  /** Cross-check groups with no known cause, and the groups under each known cause. */
  plainGroups: CrossCheckGroup[];
  causeGroups: Array<{ cause: string; groups: CrossCheckGroup[] }>;
  /** Replaces the agreement sentence where agreement must not be claimed (CrossCheckTable `emptyText`). */
  emptyText: string | null;
  health: LeagueHealth;
  healthDivisions: HealthDivision[];
  /** Its sources that failed or went stale in the last run. */
  problems: Array<{ label: string; status: 'failed' | 'stale'; error?: string }>;
}

/** A section whose level varsity games end in a shootout (SectionConfig.shootout), with its leagues. */
export interface ShootoutSection {
  section: SectionConfig;
  leagues: LeagueSummary[];
  /** 'EAL' (a one-league section names its league) | 'San Diego Section' (several name the section). */
  teamsWho: string;
}

export interface AboutView {
  counts: Snapshot['counts'];
  /** The last run's sources by status, and the ones that failed outright (#freshness). */
  sourceCounts: Record<SourceStatus['status'], number>;
  erroring: SourceStatus[];
  fetchedAt: string;
  toc: TocEntry[];
  leagues: LeagueSummary[];
  /**
   * The leagues proper, and the groups of independents (the LA independents, DESIGN §24.10): a
   * sentence about league rules speaks for the first only; the group's table is this site's count of the
   * independents' games against each other, and its card says so.
   */
  tabled: LeagueSummary[];
  independentGroups: LeagueSummary[];
  /** 'SCVAL, BVAL, …, Metro and the Southern Section’s five independents': the leagues, then each group by name. */
  leagueWords: string;
  sections: readonly SectionConfig[];
  perLeague: LeagueAbout[];
  /** SCVAL's official standings PDF: null = not posted yet, undefined = nothing to say (lib/queries/provenance.ts). */
  officialStandingsPdfUrl: string | null | undefined;
  /** Official fixtures MaxPreps has never published a result for. */
  officialFixtureCount: number;
  /** The section with no field hockey championship (the North Coast Section), for the CCS card. */
  ncs: SectionConfig | null;
  /**
   * Leagues whose postseason is an unbracketed tournament (EAL's Super Regional), and the sections
   * that hold them: each gets a source card and a Postseason paragraph of its own.
   */
  unbracketed: LeagueSummary[];
  unbracketedSections: SectionConfig[];
  /** Every section with no unbracketed league but a SoCal league in it gets its own rules card. */
  socalSections: SectionConfig[];
  /** Leagues with a league tournament (MCAL): a Postseason line each, pointing at its page. */
  tournamentLeagues: LeagueSummary[];
  /** Leagues that use their points only to decide a title and publish no standings (EAL). */
  titleOnly: LeagueSummary[];
  tableOrdered: LeagueSummary[];
  /**
   * Leagues that publish no points rule or standings at all (the Sunset, the San Diego leagues): this site
   * applies its own 3-1-0 and says so, never that their rules require it (DESIGN-socal §2.1.7).
   */
  siteOrdered: LeagueSummary[];
  ruleLeagues: LeagueSummary[];
  /** A division MaxPreps publishes no table for (crossCheckSkipReason), whose cross-check is skipped. */
  anyTableless: boolean;
  /**
   * The sections whose level varsity games end in a shootout (the Northern Section's 1 v 1s, the San Diego
   * Section's shootouts: SectionConfig.shootout), each with its leagues.
   */
  shootoutSections: ShootoutSection[];
  /**
   * Leagues that publish no schedule or standings of their own (EAL): the generic "each league's own
   * files" sentence names their section's Guidelines for them instead. The "own standings" sentence
   * names the scores their schools report for seeding, which the Guidelines say are used for it
   * (§VII.J): the Guidelines are rules, not a record of results.
   * NorCal only (the EAL): its two sentences are unchanged word for word. The Southern California
   * leagues, which publish no schedule or standings either, get sentences of their own (socalNoDocument).
   */
  noDocumentLeagues: LeagueSummary[];
  noDocumentWho: string;
  noDocumentGuidelines: string;
  /** Leagues only: the independents publish nothing because there is no league to publish it (their card says so). */
  socalNoDocument: LeagueSummary[];
  socalNoDocumentWho: string;
  socalRulesDocuments: string;
  /**
   * The disclaimer's Southern California sentence: those leagues publish no standings, so what decides
   * anything competitive is each section's (its playoffs placed from its power rankings, or none at all).
   */
  socalCompetitive: string;
  /** Every si.com score this site published (#backfills). */
  backfilled: SbliveCrossCheck['backfilled'];
  sbliveCross: SbliveCrossCheck | null;
  cifssCross: CifssCrossCheck | null;
  dropped: readonly DroppedContest[];
  playoffs: CcsPlayoffs;
  field: ReturnType<typeof getCcsField>;
  /** Whether the CCS office's calendar has been read yet, and whether it confirms every key date. */
  ccsCalendarPolled: boolean;
  keyDatesConfirmed: boolean;
  jv: {
    counts: ReturnType<typeof getJvFile>['counts'];
    games: number;
    filled: number;
    added: number;
    differs: number;
    /** The JV tables shown, and the JV games no table counts. */
    shown: JvDivisionTable[];
    uncounted: number;
  };
  history: {
    season: string;
    available: ReturnType<typeof getAvailableHistoryLeagues>;
    /**
     * A league we found no standings for, and a group that never had a table (the Southern Section
     * independents, DESIGN §24.9): the coverage paragraph says each its own way.
     */
    unavailableLeagues: ReturnType<typeof getUnavailableHistoryLeagues>;
    unavailableGroups: ReturnType<typeof getUnavailableHistoryLeagues>;
    /** Who published officially what the archive links (by PUBLISHER), and those documents' labels, once each. */
    publishers: string[];
    publishedDocs: string[];
  };
  clubCount: number;
  commitCount: number;
}

// ---------------------------------------------------------------- words

/**
 * How a sentence names a section's rules document: 'the CIF Northern Section’s Field Hockey Guidelines
 * 2026-28' (a document named after its section takes the possessive, as the EAL's sentences always
 * have), 'the CIF-SS Blue Book 2026-27, Article 200 (Field Hockey)', 'the CIF-SDS Green Book 2026-27,
 * Bylaw 2000.1 (Field Hockey)'.
 */
export function rulesDocument(section: Pick<SectionConfig, 'name' | 'rulesSource'>): string {
  const { name } = section.rulesSource;
  return name.startsWith(`${section.name} `)
    ? `the CIF ${section.name}’s ${name.slice(section.name.length + 1)}`
    : `the ${name}`;
}

/**
 * 'the EAL', 'the Sunset' (a one-table league is named like one), 'City' (a conference reads as a name), 'the
 * LA independents' (a group with no table is named in full: its short name is an adjective).
 */
export function leagueRef(summary: Pick<LeagueSummary, 'id' | 'name' | 'shortName' | 'singleDivision'>): string {
  if (isIndependentLeague(summary.id)) return `the ${summary.name}`;
  return summary.singleDivision ? `the ${summary.shortName}` : summary.shortName;
}

/** 'MCAL schedule (PDF)' / 'BVAL schedule (Google Doc)'. Only for a league that publishes one (not mode 'none'). */
export function officialSourceLabel(shortName: string, source: OfficialSourceId): string {
  return `${shortName} schedule (${officialSourceFormat(source)})`;
}

/**
 * The league whose by-laws are quoted verbatim: the one on today's legacy matcher (SCVAL, the
 * site's original league, whose quotations predate the generated sections and are golden-gated).
 */
export function isQuotedLeague(league: LeagueConfig): boolean {
  return league.rules.matcher === 'legacy';
}

/** The jump list; a league's rules entry carries its region, so the reader's region's entries show. */
export function toc(leagues: readonly LeagueSummary[]): TocEntry[] {
  return [
    { id: 'sources', label: 'Data sources' },
    { id: 'standings', label: 'Standings, points & tiebreaks' },
    // A group with no table (the LA independents) has no rules of its own: its entry is its name.
    ...leagues.map((l) => ({
      id: `rules-${l.id}`,
      label: isIndependentLeague(l.id) ? l.name : `${l.shortName} rules`,
      region: l.region,
    })),
    { id: 'health', label: 'Data health, by league' },
    { id: 'conventions', label: 'How a score is shown' },
    { id: 'cross-check', label: 'Cross-check log' },
    { id: 'backfills', label: 'Scores taken from si.com' },
    { id: 'jv', label: 'JV games' },
    { id: 'dropped', label: 'Dropped contests' },
    { id: 'freshness', label: 'How often this updates' },
    { id: 'playoffs', label: 'Postseason' },
    { id: 'privacy', label: 'Privacy & accessibility' },
    { id: 'contact', label: 'Corrections & contact' },
    { id: 'not-affiliated', label: 'Not affiliated' },
  ];
}

export function statusCounts(sources: readonly SourceStatus[]): Record<SourceStatus['status'], number> {
  const out: Record<SourceStatus['status'], number> = { ok: 0, stale: 0, error: 0, skipped: 0 };
  for (const s of sources) out[s.status] += 1;
  return out;
}

export const DROP_REASON_WORDS: Readonly<Record<DroppedContest['reason'], string>> = {
  'ghost-team': 'MaxPreps ghost team',
  'excluded-by-config': 'not a real game',
  'tba-opponent': 'opponent not named yet',
  'phantom-duplicate': 'duplicate row',
};

/** The cross-check groups (one per team with rows or a flagged standing) for a set of rows. */
export function crossCheckGroups(
  rows: readonly CrossCheckRow[],
  flagged: ReadonlyMap<string, string | undefined>,
): CrossCheckGroup[] {
  const bySlug = new Map<string, CrossCheckRow[]>();
  for (const row of rows) bySlug.set(row.slug, [...(bySlug.get(row.slug) ?? []), row]);
  const slugs = new Set([...bySlug.keys(), ...flagged.keys()]);
  const out: CrossCheckGroup[] = [];
  for (const slug of slugs) {
    const team = getTeamBySlug(slug);
    if (!team) continue;
    out.push({ team, rows: bySlug.get(slug) ?? [], detail: flagged.get(slug) });
  }
  return out;
}

// ---------------------------------------------------------------- per-league rules (generated)

export const MULTI_TEAM_WORDS: Readonly<Record<LeagueConfig['rules']['multiTeam'], string>> = {
  'partition-restart':
    'When three or more teams are level, each step is applied to the whole group at once; teams it separates are placed, and the chain restarts from the top for any teams still level.',
  'seed-one-restart':
    'When three or more teams are level, the chain places one team at a time — the first step that separates anyone decides the best of the group — and then restarts from the top for the rest.',
};

export function chainItems(league: LeagueConfig, chain: readonly TiebreakStage[]): string[] {
  return chain.map((stage) => league.rules.citations.stages[stage] ?? stage);
}

/**
 * A generated league's "which games count" sentence, by `rules.classification`: 'membership' (both teams
 * in one division), 'contest-type' (MaxPreps' league flag) or the league's official schedule; then the
 * date from which games between two of its teams are postseason games.
 */
export function ruleCountSentence(league: LeagueConfig): string {
  const { rules, postseason } = league;
  const unit = rules.gamesWord;
  // Only a league without a schedule document reaches the contest-type branch (EAL, the Sunset; SCVAL,
  // the other contest-type league, is quoted by QuotedRules instead). A San Diego league counts every game
  // between two members of a division ('membership', DESIGN-socal §2.1.7), whatever MaxPreps' flag says.
  const postseasonNoun =
    postseason.kind === 'unbracketed-tournament' || postseason.kind === 'section-playoffs'
      ? `${postseason.name} games`
      : 'tournament games';
  const from = (noun: string) =>
    rules.postseasonFrom
      ? ` Games between two ${league.shortName} teams on or after ${shortDate(rules.postseasonFrom)} are ${noun}.`
      : '';
  // The tail the two MaxPreps-read classifications share: MaxPreps' own tournament and postseason flags.
  const neverCount = rules.excludeContestTypes.length ? '; MaxPreps’ tournament and postseason games never count' : '';
  switch (rules.classification) {
    case 'membership':
      return `A game counts when both teams are members of the same ${unit} (${league.alignmentSource}), whether or not MaxPreps marks it a league game${neverCount}.${from(postseasonNoun)}`;
    case 'contest-type':
      return `A game counts when MaxPreps marks it a league game and both teams belong to the same ${unit}${neverCount}.${from(postseasonNoun)}`;
    case 'official-fixtures':
      return `A game counts when it is on ${league.shortName}’s official schedule and both teams belong to the same ${unit}; tournament and postseason games never count.${from('tournament games')}`;
  }
}

// ---------------------------------------------------------------- the view

export function buildAboutView(): AboutView {
  const counts = getCounts();
  const sources = getSources();
  const leagues = getLeagueSummaries();
  const tabled = leagues.filter((l) => !isIndependentLeague(l.id));
  const independentGroups = leagues.filter((l) => isIndependentLeague(l.id));
  const sections = SECTIONS;
  const allTeams = getTeams();

  // Standings by division, and flattened over every division (no literal division keys).
  const standingsByDivision = getAllStandings();
  const allStandings = Object.values(standingsByDivision).flat();

  const sbliveCross = getSbliveCrossCheck();
  const dropped = getDropped();
  const ccsCalendar = getCcsCalendar();
  const unbracketed = leagues.filter((l) => UNBRACKETED_LEAGUE_IDS.includes(l.id));
  const tournamentIds = new Set(TOURNAMENT_LEAGUE_IDS);

  const perLeague = leagues.map((summary): LeagueAbout => {
    const config = getLeague(summary.id);
    const teamNames = new Set(
      allTeams.filter((t) => t.league === summary.id).flatMap((t) => [t.name.toLowerCase(), t.shortName.toLowerCase()]),
    );
    const leagueDropped = dropped.filter((d) => d.teams.some((n) => teamNames.has(n.toLowerCase())));
    const rows = getCrossCheck({ league: summary.id });
    const flagged = new Map(
      allStandings
        .filter((s) => s.mismatch && summary.divisions.some((d) => d.id === s.division))
        .map((s) => [s.slug as string, s.mismatchDetail] as const),
    );
    const plainRows = rows.filter((r) => !r.knownCause);
    const causes = [...new Set(rows.filter((r) => r.knownCause).map((r) => r.knownCause as string))];
    const knownSlugs = new Set(rows.filter((r) => r.knownCause).map((r) => r.slug));
    const plainFlagged = new Map([...flagged].filter(([slug]) => !knownSlugs.has(slug)));
    const noClaim = config.divisions.some(
      (d) => d.reportedTrust === 'informational' || d.maxprepsMissing.length > 0 || d.knownCause !== null,
    );
    const healthDivisions: HealthDivision[] = config.divisions.map((d) => ({
      id: d.id,
      heading: summary.divisions.find((x) => x.id === d.id)?.heading ?? null,
      maxprepsUrl: leagueStandingsUrl(d.id),
      skipReason: crossCheckSkipReason(d.id),
      memberRows: (standingsByDivision[d.id] ?? []).filter((s) => s.reported !== null).length,
      knownCause: d.knownCause,
      official:
        d.official.mode === 'none'
          ? { mode: 'none', note: d.official.note }
          : { source: d.official.source, url: d.official.scheduleUrl, mode: d.official.mode, revisedOn: d.official.revisedOn },
    }));
    // A league none of whose divisions publishes a schedule (EAL): its card names where its rules
    // come from and what stands in for a schedule, never "its own documents".
    const noDocument = config.divisions.every((d) => d.official.mode === 'none');
    const officialNotes = [
      ...new Set(config.divisions.flatMap((d) => (d.official.mode === 'none' ? [d.official.note] : []))),
    ];
    return {
      summary,
      config,
      noDocument,
      officialNotes,
      dropped: leagueDropped,
      plainGroups: crossCheckGroups(plainRows, plainFlagged),
      causeGroups: causes.map((cause) => ({
        cause,
        groups: crossCheckGroups(rows.filter((r) => r.knownCause === cause), new Map()),
      })),
      emptyText: noClaim
        ? `No other disagreements with MaxPreps’ ${summary.shortName} ${summary.singleDivision ? 'table' : 'tables'} in the most recent run.`
        : null,
      health: getLeagueHealth(summary.id),
      healthDivisions,
      problems: getSources({ league: summary.id })
        .filter((s) => s.status === 'error' || s.status === 'stale')
        .map((s) => ({ label: s.label, status: s.status === 'error' ? 'failed' : 'stale', error: s.error })),
    };
  });

  const noDocumentLeagues = perLeague.filter((p) => p.noDocument && regionOf(p.summary.id) === 'norcal').map((p) => p.summary);
  const socalNoDocument = perLeague
    .filter((p) => p.noDocument && !isDefaultRegion(regionOf(p.summary.id)) && !isIndependentLeague(p.summary.id))
    .map((p) => p.summary);
  const socalNoDocumentWho = listWords(socalNoDocument.map(leagueRef));
  const socalSectionFacts = [...new Set(socalNoDocument.map((l) => l.section.id))].map((id) => {
    const ps = getLeague(socalNoDocument.find((l) => l.section.id === id)!.id).postseason;
    const name = getSection(id).name;
    return ps.kind === 'section-playoffs'
      ? `the ${name} places its playoff teams from its own power rankings`
      : `the ${name} holds no field hockey playoffs`;
  });

  const jvFile = getJvFile();
  const jvMerge = getJvMerge();
  const jvAllTables = leagues.flatMap((l) => getJvTables(l.id));

  const historyUnavailable = getUnavailableHistoryLeagues();
  const historyPublishedOnly = historyUnavailable.filter((l) => (l.entry.alsoPublished?.length ?? 0) > 0);
  // What was published officially, by PUBLISHER and once per document: a league with no site of its own
  // links its section's document (the San Diego Section's 2025 bracket sheet for City, North County and
  // Metro), so the section is named, as app/history/2025-26/page.tsx names it on each card. Crediting
  // the sheet to the three conferences and listing it three times was the review's finding (2026-10-06).
  const historyPublishers = new Map<string, Map<string, string>>();
  for (const l of historyPublishedOnly) {
    const league = getLeague(l.id);
    const section = getSection(league.sectionId);
    const publisher = league.officialUrl !== section.officialUrl ? league.shortName : `the ${section.name}`;
    const docs = historyPublishers.get(publisher) ?? new Map<string, string>();
    for (const doc of l.entry.alsoPublished ?? []) docs.set(doc.url, doc.label);
    historyPublishers.set(publisher, docs);
  }

  return {
    counts,
    sourceCounts: statusCounts(sources),
    erroring: sources.filter((s) => s.status === 'error'),
    fetchedAt: getFetchedAt(),
    toc: toc(leagues),
    leagues,
    tabled,
    independentGroups,
    leagueWords: listWords([
      ...tabled.map((l) => l.shortName),
      ...independentGroups.map((g) => `the ${g.section.name}’s ${numberWord(g.teamCount)} independents`),
    ]),
    sections,
    perLeague,
    officialStandingsPdfUrl: getOfficialStandingsPdfUrl(),
    officialFixtureCount: getOfficialFixtures().length,
    ncs: sections.find((s) => !s.holdsFieldHockeyChampionship) ?? null,
    unbracketed,
    unbracketedSections: sections.filter((s) => unbracketed.some((l) => l.section.id === s.id)),
    socalSections: sections.filter((s) => !isDefaultRegion(s.region) && leagues.some((l) => l.section.id === s.id)),
    tournamentLeagues: leagues.filter((l) => tournamentIds.has(l.id)),
    titleOnly: tabled.filter((l) => getLeague(l.id).rules.orderScope === 'title'),
    tableOrdered: tabled.filter((l) => getLeague(l.id).rules.orderScope === 'table'),
    siteOrdered: tabled.filter((l) => getLeague(l.id).rules.orderScope === 'site'),
    ruleLeagues: tabled.filter((l) => getLeague(l.id).rules.orderScope !== 'site'),
    anyTableless: leagues.some((l) => getLeague(l.id).divisions.some((d) => crossCheckSkipReason(d.id) !== null)),
    shootoutSections: sections
      .filter((s) => s.shootout !== null)
      .map((section) => ({ section, leagues: leagues.filter((l) => l.section.id === section.id) }))
      .filter((g) => g.leagues.length > 0)
      .map((g) => ({ ...g, teamsWho: g.leagues.length === 1 ? g.leagues[0].shortName : g.section.name })),
    noDocumentLeagues,
    noDocumentWho: listWords(noDocumentLeagues.map((l) => `the ${l.shortName}`)),
    noDocumentGuidelines: `${listWords([...new Set(noDocumentLeagues.map((l) => `the ${l.section.name}’s`))])} Field Hockey Guidelines`,
    socalNoDocument,
    socalNoDocumentWho,
    socalRulesDocuments: listWords([...new Set(socalNoDocument.map((l) => rulesDocument(getSection(l.section.id))))]),
    socalCompetitive: `For ${socalNoDocumentWho}, which publish no standings, this site’s tables are its own count: ${listWords(socalSectionFacts)}.`,
    backfilled: sbliveCross?.backfilled ?? [],
    sbliveCross: sbliveCross ?? null,
    cifssCross: getCifssCrossCheck() ?? null,
    dropped,
    playoffs: getPlayoffs(),
    field: getCcsField(),
    ccsCalendarPolled: ccsCalendar !== undefined,
    keyDatesConfirmed: areKeyDatesConfirmed() === true,
    jv: {
      counts: jvFile.counts,
      games: jvMerge.games.length,
      filled: jvMerge.filled.length,
      added: jvMerge.added.length,
      differs: jvMerge.differs.length,
      shown: jvAllTables.filter((t) => t.status === 'shown'),
      uncounted: jvAllTables.reduce((n, t) => n + t.uncounted.length, 0),
    },
    history: {
      season: getHistorySeason(),
      available: getAvailableHistoryLeagues(),
      unavailableLeagues: historyUnavailable.filter((l) => !isIndependentLeague(l.id)),
      unavailableGroups: historyUnavailable.filter((l) => isIndependentLeague(l.id)),
      publishers: [...historyPublishers.keys()],
      publishedDocs: [...new Map([...historyPublishers.values()].flatMap((docs) => [...docs])).values()],
    },
    clubCount: getClubs().length,
    commitCount: getCommitsFile().commitments.length,
  };
}

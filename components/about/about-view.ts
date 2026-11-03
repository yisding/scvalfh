import { getCommitsFile } from '../../lib/players/commits';
import {
  areKeyDatesConfirmed,
  getAllStandings,
  getCcsCalendar,
  getCcsField,
  getCifssCrossCheck,
  getCounts,
  getCrossCheck,
  getDropped,
  getLeagueHealth,
  getLeagueSummaries,
  getOfficialFixtures,
  getOfficialStandingsPdfUrl,
  getPlayoffs,
  getSbliveCrossCheck,
  getSections,
  getSources,
  getTeamBySlug,
  getTeams,
  getTournamentLeagueIds,
} from '../../lib/data';
import type { LeagueSummary } from '../../lib/data';
import { listWords, numberWord } from '../../lib/format';
import { getAvailableHistoryLeagues, getHistorySeason, getUnavailableHistoryLeagues } from '../../lib/history/history';
import { getJvCorrections, getJvFile, getJvMerge, getJvSchoolSiteMerge, getJvTables } from '../../lib/jv/jv';
import {
  UNBRACKETED_LEAGUE_IDS,
  getLeague,
  getSection,
  isIndependentLeague,
  leagueStandingsUrl,
  regionOf,
} from '../../lib/leagues';
import type { LeagueConfig, SectionConfig } from '../../lib/leagues';
import { crossCheckSkipReason } from '../../lib/standings';
import type { CrossCheckRow, DroppedContest, SourceStatus } from '../../lib/types';
import type { CrossCheckGroup } from './CrossCheckTable';
import type { HealthDivision } from './LeagueHealthCard';

/**
 * What /about (app/about/page.tsx) says, read once: `buildAboutView()` makes every data read the page's
 * top level made, in the same order, and works out each sentence and list that more than one section
 * reads or that is more than a lookup (the per-league source, rules, health and cross-check entries,
 * the NorCal and Southern California no-document sentences, the JV and 2025-26 archive counts). The
 * sections under components/about/sections/ take the whole view (`AboutSectionProps`) and print it;
 * the reads that sit inside a sentence (`getClubs()`, `getFetchedAt()`, a team's name) stay in theirs.
 *
 * The helpers beside it are the page's own wording rules: how a sentence names a section's rules
 * document (`rulesDocument`) and a league (`leagueRef`), the jump list (`toc`), a dropped contest's
 * reason in words, and which league's by-laws are quoted verbatim (`isQuotedLeague`).
 */

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

/** The jump list; a league's rules entry carries its region, so the reader's region's entries show. */
export function toc(leagues: readonly LeagueSummary[]): Array<{ id: string; label: string; region?: LeagueSummary['region'] }> {
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

function statusCounts(sources: readonly SourceStatus[]): Record<SourceStatus['status'], number> {
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
function crossCheckGroups(
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

/**
 * The league whose by-laws are quoted verbatim (components/about/LeagueRules.tsx): the one on today's
 * legacy matcher (SCVAL, the site's original league, whose quotations predate the generated sections
 * and are golden-gated).
 */
export function isQuotedLeague(league: LeagueConfig): boolean {
  return league.rules.matcher === 'legacy';
}

/** Everything /about prints that is read from the data; see the module comment. */
export function buildAboutView() {
  const counts = getCounts();
  const sources = getSources();
  const counted = statusCounts(sources);
  const erroring = sources.filter((s) => s.status === 'error');
  const leagues = getLeagueSummaries();
  // The leagues proper, and the groups of independents (the LA independents, DESIGN §24.10): a
  // sentence about league rules speaks for the first only; the group's table is this site's count of the
  // independents' games against each other, and its card says so.
  const tabled = leagues.filter((l) => !isIndependentLeague(l.id));
  const independentGroups = leagues.filter((l) => isIndependentLeague(l.id));
  const sections = getSections();
  const allTeams = getTeams();
  const commitCount = getCommitsFile().commitments.length;

  // Standings by division, and flattened over every division (no literal division keys).
  const standingsByDivision = getAllStandings();
  const allStandings = Object.values(standingsByDivision).flat();

  const sbliveCross = getSbliveCrossCheck();
  const cifssCross = getCifssCrossCheck();
  const backfilled = sbliveCross?.backfilled ?? [];
  const dropped = getDropped();
  const officialFixtures = getOfficialFixtures();
  const officialStandingsPdfUrl = getOfficialStandingsPdfUrl();

  const ccsCalendar = getCcsCalendar();
  const keyDatesConfirmed = areKeyDatesConfirmed();
  const playoffs = getPlayoffs();
  const field = getCcsField();
  const tournamentIds = new Set(getTournamentLeagueIds());
  const ncs = sections.find((s) => !s.holdsFieldHockeyChampionship);
  // Leagues whose postseason is an unbracketed tournament (EAL's Super Regional), and the sections
  // that hold them: each gets a source card and a Postseason paragraph of its own.
  const unbracketed = leagues.filter((l) => UNBRACKETED_LEAGUE_IDS.includes(l.id));
  const unbracketedSections = sections.filter((s) => unbracketed.some((l) => l.section.id === s.id));
  // Leagues that use their points only to decide a title and publish no standings (EAL).
  const titleOnly = tabled.filter((l) => getLeague(l.id).rules.orderScope === 'title');
  const tableOrdered = tabled.filter((l) => getLeague(l.id).rules.orderScope === 'table');
  // Leagues that publish no points rule or standings at all (the Sunset, the San Diego leagues): this site
  // applies its own 3-1-0 and says so, never that their rules require it (DESIGN-socal §2.1.7).
  const siteOrdered = tabled.filter((l) => getLeague(l.id).rules.orderScope === 'site');
  // A division MaxPreps publishes no table for (crossCheckSkipReason), whose cross-check is skipped.
  const anyTableless = leagues.some((l) => getLeague(l.id).divisions.some((d) => crossCheckSkipReason(d.id) !== null));
  const ruleLeagues = tabled.filter((l) => getLeague(l.id).rules.orderScope !== 'site');
  // The sections whose level varsity games end in a shootout (the Northern Section's 1 v 1s, the San Diego
  // Section's shootouts: SectionConfig.shootout), each with its leagues.
  const shootoutSections = sections
    .filter((s) => s.shootout !== null)
    .map((section) => ({ section, leagues: leagues.filter((l) => l.section.id === section.id) }))
    .filter((g) => g.leagues.length > 0);
  // Every section with no unbracketed league but a SoCal league in it gets its own rules card.
  const socalSections = sections.filter((s) => s.region === 'socal' && leagues.some((l) => l.section.id === s.id));

  const perLeague = leagues.map((summary) => {
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
  // Leagues that publish no schedule or standings of their own (EAL): the generic "each league's own
  // files" sentence names their section's Guidelines for them instead. The "own standings" sentence
  // names the scores their schools report for seeding, which the Guidelines say are used for it
  // (§VII.J): the Guidelines are rules, not a record of results.
  // NorCal only (the EAL): its two sentences below are unchanged word for word. The Southern California
  // leagues, which publish no schedule or standings either, get sentences of their own (socalNoDocument).
  const noDocumentLeagues = perLeague.filter((p) => p.noDocument && regionOf(p.summary.id) === 'norcal').map((p) => p.summary);
  const noDocumentWho = listWords(noDocumentLeagues.map((l) => `the ${l.shortName}`));
  const noDocumentGuidelines = `${listWords([...new Set(noDocumentLeagues.map((l) => `the ${l.section.name}’s`))])} Field Hockey Guidelines`;
  // Leagues only: the independents publish nothing because there is no league to publish it (their card says so).
  const socalNoDocument = perLeague
    .filter((p) => p.noDocument && regionOf(p.summary.id) === 'socal' && !isIndependentLeague(p.summary.id))
    .map((p) => p.summary);
  const socalNoDocumentWho = listWords(socalNoDocument.map(leagueRef));
  const socalRulesDocuments = listWords([
    ...new Set(socalNoDocument.map((l) => rulesDocument(getSection(l.section.id)))),
  ]);
  // The disclaimer's Southern California sentence: those leagues publish no standings, so what decides
  // anything competitive is each section's (its playoffs placed from its power rankings, or none at all).
  const socalSectionFacts = [...new Set(socalNoDocument.map((l) => l.section.id))].map((id) => {
    const ps = getLeague(socalNoDocument.find((l) => l.section.id === id)!.id).postseason;
    const name = getSection(id).name;
    return ps.kind === 'section-playoffs'
      ? `the ${name} places its playoff teams from its own power rankings`
      : `the ${name} holds no field hockey playoffs`;
  });
  const socalCompetitive = `For ${socalNoDocumentWho}, which publish no standings, this site’s tables are its own count: ${listWords(socalSectionFacts)}.`;

  const TOC = toc(leagues);
  const jvFile = getJvFile();
  const jvMerge = getJvMerge();
  const jvSchool = getJvSchoolSiteMerge();
  const jvCorrections = getJvCorrections();
  const jvAllTables = leagues.flatMap((l) => getJvTables(l.id));
  const jvShown = jvAllTables.filter((t) => t.status === 'shown');
  const jvUncounted = jvAllTables.reduce((n, t) => n + t.uncounted.length, 0);
  // 'SCVAL, BVAL, …, Metro and the Southern Section’s five independents': the leagues, then each group by name.
  const leagueWords = listWords([
    ...tabled.map((l) => l.shortName),
    ...independentGroups.map((g) => `the ${g.section.name}’s ${numberWord(g.teamCount)} independents`),
  ]);
  const historySeason = getHistorySeason();
  const historyAvailable = getAvailableHistoryLeagues();
  const historyUnavailable = getUnavailableHistoryLeagues();
  // A league we found no standings for, and a group that never had a table (the Southern Section
  // independents, DESIGN §24.9): the coverage paragraph says each its own way.
  const historyUnavailableLeagues = historyUnavailable.filter((l) => !isIndependentLeague(l.id));
  const historyUnavailableGroups = historyUnavailable.filter((l) => isIndependentLeague(l.id));
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
  const historyPublishedDocs = [
    ...new Map([...historyPublishers.values()].flatMap((docs) => [...docs])).values(),
  ];

  return {
    counts,
    counted,
    erroring,
    leagues,
    tabled,
    independentGroups,
    sections,
    commitCount,
    sbliveCross,
    cifssCross,
    backfilled,
    dropped,
    officialFixtures,
    officialStandingsPdfUrl,
    ccsCalendar,
    keyDatesConfirmed,
    playoffs,
    field,
    tournamentIds,
    ncs,
    unbracketed,
    unbracketedSections,
    titleOnly,
    tableOrdered,
    siteOrdered,
    anyTableless,
    ruleLeagues,
    shootoutSections,
    socalSections,
    perLeague,
    noDocumentLeagues,
    noDocumentWho,
    noDocumentGuidelines,
    socalNoDocument,
    socalNoDocumentWho,
    socalRulesDocuments,
    socalCompetitive,
    toc: TOC,
    jvFile,
    jvMerge,
    jvSchool,
    jvCorrections,
    jvShown,
    jvUncounted,
    leagueWords,
    historySeason,
    historyAvailable,
    historyUnavailableLeagues,
    historyUnavailableGroups,
    historyPublishedOnly,
    historyPublishers,
    historyPublishedDocs,
  };
}

export type AboutView = ReturnType<typeof buildAboutView>;

/** 'EAL' (a one-league section names its league) | 'San Diego Section' (several name the section). */
export function shootoutTeamsWho(g: AboutView['shootoutSections'][number]): string {
  return g.leagues.length === 1 ? g.leagues[0].shortName : g.section.name;
}

/** Every /about section takes the whole view. */
export interface AboutSectionProps {
  view: AboutView;
}

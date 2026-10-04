import type { Metadata } from 'next';
import Link from 'next/link';

import PageHeader from '../../components/layout/PageHeader';
import BackfillTable from '../../components/about/BackfillTable';
import CrossCheckTable, { type CrossCheckGroup } from '../../components/about/CrossCheckTable';
import LeagueHealthCard, { officialSourceLabel, type HealthDivision } from '../../components/about/LeagueHealthCard';
import SbliveCrossCheckSummary from '../../components/about/SbliveCrossCheckSummary';
import EmptyState from '../../components/ui/EmptyState';
import ExternalLink from '../../components/ui/ExternalLink';
import SectionHeader from '../../components/ui/SectionHeader';
import { OG_BASE, ROOT_OG_IMAGE, SITE_SCOPE_NOTE } from '../../components/layout/site-url';
import { getClubs } from '../../lib/clubs';
import { getCommitsFile } from '../../lib/commits';
import {
  areKeyDatesConfirmed,
  getAllStandings,
  getCcsCalendar,
  getCcsField,
  getCounts,
  getCrossCheck,
  getDropped,
  getFetchedAt,
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
import { dateWithYear, formatStamp, listWords, numberWord, shortDate, timeOfDayPT } from '../../lib/format';
import { getAvailableHistoryLeagues, getHistorySeason, getUnavailableHistoryLeagues } from '../../lib/history';
import { CCS, UNBRACKETED_LEAGUE_IDS, getLeague, leagueStandingsUrl } from '../../lib/leagues';
import type { LeagueConfig } from '../../lib/leagues';
import { SOURCE_LINKS } from '../../lib/season';
import { statusLegend } from '../../lib/standings';
import type { CrossCheckRow, DroppedContest, SourceStatus, TiebreakStage } from '../../lib/types';

/**
 * `/about` (DESIGN §3.10, SPEC §10.8) — where the data comes from for every league, how each
 * league's standings are computed (SCVAL's by-laws quoted verbatim; BVAL, PCAL, MCAL and EAL
 * generated from their config citations), each league's data health, every si.com backfill, every contest
 * dropped on purpose, the published cross-checks, the update cadence, privacy and the
 * not-affiliated disclaimer. Standings footnotes link `#rules-<league>`; the anchors are stable.
 * The sources section ends with a paragraph on the club data (`#clubs-coverage`, DESIGN §17.1),
 * which links /clubs: hand research, not part of the twice-daily update. The college commitments
 * get one after it (`#commits-coverage`, DESIGN §21.4), linking /commits, for the same reason.
 *
 * A league that publishes no schedule document (`official.mode: 'none'`, the EAL) is never said to
 * have one: its source card names the document its rules come from and prints `official.note` (where
 * its league games come from instead) and its `membershipNote`, its health card says it has no
 * official schedule document, and its postseason (an unbracketed tournament: the Super Regional) is
 * the written rule and dates, with no bracket.
 */
const DESCRIPTION =
  'How each league’s standings are computed, where the data comes from, and every disagreement with the sources.';

export const metadata: Metadata = {
  title: 'About & sources',
  description: DESCRIPTION,
  alternates: { canonical: '/about' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, url: '/about' },
};

/**
 * A quoted by-law: a card with a straight 3px rule down its left edge. The rule is a pseudo-element
 * inset 16px from the top and bottom (the card's corner radius), so it stays straight; an inset
 * box-shadow would curve around the corners like a bracket.
 */
const QUOTE =
  "sx-card relative not-italic p-5 pl-6 text-body text-ink-2 before:absolute before:inset-y-4 before:left-0 before:w-[3px] before:rounded-r-full before:bg-rule before:content-['']";

/** A sub-heading inside a league's rules block (the league itself is the h3). */
const H4 = 'm-0 mt-8 text-body font-semibold text-ink';

function toc(leagues: readonly LeagueSummary[]) {
  return [
    { id: 'sources', label: 'Data sources' },
    { id: 'standings', label: 'Standings, points & tiebreaks' },
    ...leagues.map((l) => ({ id: `rules-${l.id}`, label: `${l.shortName} rules` })),
    { id: 'health', label: 'Data health, by league' },
    { id: 'conventions', label: 'How a score is shown' },
    { id: 'cross-check', label: 'Cross-check log' },
    { id: 'backfills', label: 'si.com backfills' },
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

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const DROP_REASON_WORDS: Readonly<Record<DroppedContest['reason'], string>> = {
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

// ---------------------------------------------------------------- per-league rules (generated)

const MULTI_TEAM_WORDS: Readonly<Record<LeagueConfig['rules']['multiTeam'], string>> = {
  'partition-restart':
    'When three or more teams are level, each step is applied to the whole group at once; teams it separates are placed, and the chain restarts from the top for any teams still level.',
  'seed-one-restart':
    'When three or more teams are level, the chain places one team at a time — the first step that separates anyone decides the best of the group — and then restarts from the top for the rest.',
};

function chainItems(league: LeagueConfig, chain: readonly TiebreakStage[]): string[] {
  return chain.map((stage) => league.rules.citations.stages[stage] ?? stage);
}

function GeneratedRules({ league }: { league: LeagueConfig }) {
  const { rules, postseason } = league;
  const byBucket = rules.tiebreaks.byBucketStart ?? {};
  const bucketStarts = Object.keys(byBucket)
    .map(Number)
    .sort((a, b) => a - b);
  const unit = rules.gamesWord === 'division' ? 'division' : 'league';
  // Only a league without a schedule document reaches the contest-type branch (EAL; SCVAL, the other
  // contest-type league, is quoted by QuotedRules instead).
  const postseasonNoun =
    postseason.kind === 'unbracketed-tournament' ? `${postseason.name} games` : 'tournament games';
  const counts =
    rules.classification === 'contest-type'
      ? `A game counts when MaxPreps marks it a league game and both teams belong to the same ${unit}${
          rules.excludeContestTypes.length ? '; MaxPreps’ tournament and postseason games never count' : ''
        }.${
          rules.postseasonFrom
            ? ` Games between two ${league.shortName} teams on or after ${shortDate(rules.postseasonFrom)} are ${postseasonNoun}.`
            : ''
        }`
      : `A game counts when it is on ${league.shortName}’s official schedule and both teams belong to the same ${rules.gamesWord === 'division' ? 'division' : 'league'}; tournament and postseason games never count.${
          rules.postseasonFrom ? ` Games between two ${league.shortName} teams on or after ${shortDate(rules.postseasonFrom)} are tournament games.` : ''
        }`;
  return (
    <div className="sx-prose">
      <h4 className={H4}>Points &amp; standings order</h4>
      <ul className="list-disc">
        <li>{rules.citations.points}.</li>
        <li>{rules.citations.order}.</li>
        <li>{rules.citations.doubleRoundRobin}.</li>
        <li>{rules.citations.overtime}.</li>
        <li>{rules.citations.coChampions}.</li>
      </ul>
      <p>{counts}</p>

      <h4 className={H4}>If teams are tied on points</h4>
      {bucketStarts.length > 0 ? (
        <>
          {bucketStarts.map((start) => (
            <div key={start}>
              <p className="m-0">A tie whose group starts at {start === 1 ? '1st' : start === 2 ? '2nd' : `${start}th`}:</p>
              <ol className="mt-2 list-decimal">
                {chainItems(league, byBucket[start] ?? []).map((text) => (
                  <li key={text}>{text}.</li>
                ))}
              </ol>
            </div>
          ))}
          <p>Any other tie: {chainItems(league, rules.tiebreaks.default).join('; ')}.</p>
        </>
      ) : (
        <ol className="list-decimal">
          {chainItems(league, rules.tiebreaks.default).map((text) => (
            <li key={text}>{text}.</li>
          ))}
        </ol>
      )}
      <p>{MULTI_TEAM_WORDS[rules.multiTeam]}</p>
      <p className="text-meta text-ink-3">
        A step this site cannot compute (a coin flip, a draw, a play-in) leaves the teams level at the
        same place, with a footnote citing the rule. Our display order is not a league ruling.
      </p>
      {rules.citations.incomplete ? <p>If the season ends with games unplayed: {rules.citations.incomplete}.</p> : null}

      <h4 className={H4}>Postseason</h4>
      <GeneratedPostseason league={league} />
      <p className="text-meta text-ink-2">
        {league.links.map((l, i) => (
          <span key={l.href}>
            {i > 0 ? ' · ' : ''}
            <ExternalLink href={l.href}>{l.label}</ExternalLink>
          </span>
        ))}
      </p>
    </div>
  );
}

/** A generated league's postseason, by kind: the CCS ladder, a league tournament, or an unbracketed tournament. */
function GeneratedPostseason({ league }: { league: LeagueConfig }) {
  const { postseason } = league;
  switch (postseason.kind) {
    case 'ccs-ladder':
      return (
        <>
          <p>{postseason.citation}.</p>
          <ul className="list-disc">
            {league.divisions.flatMap((d) =>
              postseason.ladder
                .filter((r) => r.divisions === '*' || r.divisions.includes(d.id))
                .filter((r) => r.divisions !== '*' || d === league.divisions[0])
                .map((r) => (
                  <li key={`${d.id}-${r.status}-${r.places[0]}`}>
                    {r.divisions !== '*' && league.divisions.length > 1 ? `${d.label}: ` : ''}
                    {statusLegend(d.id, r.status)}.
                  </li>
                )),
            )}
          </ul>
        </>
      );
    case 'league-tournament':
      return (
        <>
          <ul className="list-disc">
            <li>{postseason.citations.format}.</li>
            <li>{postseason.citations.seeding}.</li>
            <li>{postseason.citations.semifinal}.</li>
            <li>{postseason.citations.lastSpot}.</li>
          </ul>
          <p>{postseason.citations.qualifiersConflict}</p>
          <p>{postseason.titleNote}</p>
          <p>
            <Link href={`/playoffs/${league.id}`} prefetch={false} className="sx-action min-h-11 text-accent hover:underline">
              {postseason.name} &rarr;
            </Link>
          </p>
        </>
      );
    case 'unbracketed-tournament':
      // The written rule and dates only: no bracket and no seeding is computed (the seeding text is
      // quoted, never applied).
      return (
        <>
          <ul className="list-disc">
            <li>{postseason.citations.qualification}.</li>
            <li>{postseason.citations.format}.</li>
            <li>{postseason.citations.seeding}.</li>
            <li>{postseason.citations.eligibility}.</li>
            <li>{postseason.citations.noFurtherPath}.</li>
          </ul>
          <p>{postseason.note}</p>
        </>
      );
  }
}

/**
 * The league whose by-laws are quoted verbatim below: the one on today's legacy matcher (SCVAL, the
 * site's original league, whose quotations predate the generated sections and are golden-gated).
 */
function isQuotedLeague(league: LeagueConfig): boolean {
  return league.rules.matcher === 'legacy';
}

/** SCVAL's by-laws, quoted verbatim (unchanged from the single-league site). */
function QuotedRules({ league }: { league: LeagueConfig }) {
  const stages = league.rules.citations.stages;
  const qualification = league.postseason.kind === 'ccs-ladder' ? league.postseason.citation : '';
  return (
    <div className="sx-prose">
      <p>
        League membership is a list we maintain from the official {league.shortName} alignment, not
        whatever happens to appear in the MaxPreps feed that day. De Anza has 7 teams this season:
        the official grid still lists Wilcox, but Wilcox is not fielding a team, so it is not shown
        anywhere on the site and its grid fixtures are not counted. The rules are quoted below,
        verbatim, from the SCVAL Field Hockey By-Laws 2026-27.
      </p>

      <h4 className={H4}>Points &amp; standings order</h4>
      <blockquote className={QUOTE}>
        &ldquo;A team shall be awarded 3 points for a win, 1 point for a tie. The division
        placement/standings will be the order of team points. The team with the greatest number of
        points will be declared the champion and higher in the standings. If there is a tie at the
        top both teams shall be declared division champions.&rdquo;{' '}
        <cite className="not-italic text-ink-3">&mdash; Article VI, Section 2</cite>
      </blockquote>
      <p>
        We implement that literally: <code>points = 3 &times; wins + 1 &times; ties</code> from
        league games only (Article VI, Section 1 &mdash; a double round robin, division games only
        counting to the division record), and the PTS column on every standings table is the actual
        ordering key, not a secondary stat.
      </p>

      <h4 className={H4}>If teams are tied on points</h4>
      <p>
        The by-laws set out one tiebreak chain, applied by &ldquo;working to bring one team
        out&rdquo; of the tied group and then restarting the whole chain for whoever is left:
      </p>
      <ol className="list-decimal">
        <li>Better head-to-head record among the tied teams ({stages['head-to-head']}).</li>
        <li>Greater number of wins in division play ({stages['division-wins']}).</li>
        <li>Least goals given up between the head-to-head tied teams ({stages['h2h-goals-against']}).</li>
        <li>Goal differential between the head-to-head tied teams ({stages['h2h-goal-diff']}).</li>
        <li>
          A coin flip. This site cannot compute a coin flip, so teams that reach this step render as{' '}
          <b className="font-semibold text-ink">tied at the same place</b> (a shared &ldquo;T6&rdquo;
          instead of a 6th and a 7th), with a footnote citing this rule. ({stages['coin-flip']})
        </li>
      </ol>
      <p className="text-meta text-ink-3">
        Our display order is not a league ruling &mdash; if {league.shortName} settles a coin flip we
        have no way to know, the official standings remain the source of truth.
      </p>

      <h4 className={H4}>Overtime</h4>
      <blockquote className={QUOTE}>
        &ldquo;Varsity: four 15-minute quarters. After a regulation tie (league AND non-league varsity
        games): ONE 7-minute sudden-victory period, 7-a-side. If still tied after that one period, the
        game ends in a tie (no shootout in league play).&rdquo;{' '}
        <cite className="not-italic text-ink-3">&mdash; Article IV</cite>
      </blockquote>
      <p>
        An overtime win counts as a full win, shown with an OT tag. Because league play never has a
        shootout, the shootout state our code supports never actually occurs in {league.shortName}{' '}
        league play &mdash; it exists so the rendering code has somewhere correct to send a shootout if
        one is ever reported.
      </p>

      <h4 className={H4}>CCS qualification</h4>
      <blockquote className={QUOTE}>
        &ldquo;16-team CCS tournament: SCVAL 7, BVAL 4, PCAL 2, at-large 3.&rdquo;{' '}
        <cite className="not-italic text-ink-3">&mdash; Article VII, Section 1</cite>
      </blockquote>
      <blockquote className={QUOTE}>
        &ldquo;The first three teams in each division are awarded automatic qualifiers (AQ) to CCS
        playoffs (ties broken by Article VI, Sections 2-7). Fourth place teams play a play-in game; the
        winner receives the SCVAL 7th AQ. The losing 4th-place team and both 5th-place teams are
        submitted to CCS for at-large consideration. #1 v #1, #2 v #2, #3 v #3 crossover games are
        played after the season to help CCS ordering (home site by coin flip). Per the official
        schedule PDFs these crossover/play-in games are Friday, October 30, 2026.&rdquo;{' '}
        <cite className="not-italic text-ink-3">&mdash; Article VII, Section 2</cite>
      </blockquote>
      <p>
        {qualification}. Live, team-by-team status is on the{' '}
        <Link href={`/playoffs#${league.id}`} prefetch={false} className="text-accent hover:underline">
          CCS playoffs
        </Link>{' '}
        page.
      </p>
      <p className="text-meta text-ink-2">
        {league.links.map((l, i) => (
          <span key={l.href}>
            {i > 0 ? ' · ' : ''}
            <ExternalLink href={l.href}>{l.label}</ExternalLink>
          </span>
        ))}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- page

export default function AboutPage() {
  const counts = getCounts();
  const sources = getSources();
  const counted = statusCounts(sources);
  const erroring = sources.filter((s) => s.status === 'error');
  const leagues = getLeagueSummaries();
  const sections = getSections();
  const allTeams = getTeams();
  const commitCount = getCommitsFile().commitments.length;

  // Standings flattened over every division (no literal division keys).
  const allStandings = Object.values(getAllStandings()).flat();

  const sbliveCross = getSbliveCrossCheck();
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
  // Leagues that use their points only to decide a title and rank no table (EAL).
  const titleOnly = leagues.filter((l) => getLeague(l.id).rules.orderScope === 'title');
  const tableOrdered = leagues.filter((l) => getLeague(l.id).rules.orderScope === 'table');
  // Leagues whose level varsity games end on 1 v 1s (EAL).
  const shootoutLeagues = leagues.filter((l) => getLeague(l.id).rules.leagueOvertime === 'shootout');

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
  // files" and "own standings" sentences name their section's Guidelines for them instead.
  const noDocumentLeagues = perLeague.filter((p) => p.noDocument).map((p) => p.summary);
  const noDocumentWho = listWords(noDocumentLeagues.map((l) => `the ${l.shortName}`));
  const noDocumentGuidelines = `${listWords([...new Set(noDocumentLeagues.map((l) => `the ${l.section.name}’s`))])} Field Hockey Guidelines`;

  const TOC = toc(leagues);
  const leagueWords = listWords(leagues.map((l) => l.shortName));
  const historySeason = getHistorySeason();
  const historyAvailable = getAvailableHistoryLeagues();
  const historyUnavailable = getUnavailableHistoryLeagues();
  const historyPublishedOnly = historyUnavailable.filter((l) => (l.entry.alsoPublished?.length ?? 0) > 0);

  return (
    // Three grid children, placed explicitly, so ONE DOM order serves both breakpoints
    // (DESIGN §10.5): the title and lede, then the jump list, then the sections. The rail starts at
    // `lg`; below it the "On this page" disclosure carries the jump list instead.
    <div className="pb-section-lg lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start lg:gap-x-10">
      <PageHeader
        className="lg:col-start-1 lg:row-start-1"
        title="About & sources"
        description={`${DESCRIPTION} This is an unofficial, fan-built scoreboard for the ${counts.teams} girls varsity field hockey teams in ${leagueWords}. Every number on it is either read from a public source and shown as-is, or computed from public game results by rules published below. Nothing is guessed, and every disagreement we find with a source is published rather than quietly resolved.`}
      />

      <details className="sx-inset sx-disclosure mt-8 lg:hidden">
        <summary>On this page</summary>
        <nav aria-label="On this page">
          <ul className="m-0 list-none p-0">
            {TOC.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="sx-action min-h-11 text-meta text-ink-2 hover:text-accent hover:underline">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </details>

      <nav
        aria-label="Sections on this page"
        className="hidden lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-10 lg:block lg:sticky lg:top-[5rem]"
      >
        <div className="sx-card p-4">
          <p className="m-0 text-micro font-medium text-ink-3">On this page</p>
          <ul className="m-0 mt-2 list-none p-0">
            {TOC.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="sx-action min-h-8 text-meta text-ink-2 hover:text-accent hover:underline">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="mt-8 md:mt-10 lg:col-start-1 lg:row-start-2">
        {/* ---------------------------------------------------------------- sources */}
        <section id="sources">
          <SectionHeader size="lg" kicker="Data sources" />
          <p className="sx-prose">
            {SITE_SCOPE_NOTE} This snapshot covers all {counts.teams} teams and {counts.games} games (
            {counts.leagueGames} of them league games): {counts.finals} final, {counts.pending} not yet
            reported.
          </p>
          <dl className="m-0 mt-stack grid gap-4 md:grid-cols-2">
            <div className="sx-card flex flex-col p-5">
              <dt>
                <span className="block text-lead text-ink">MaxPreps</span>
                <span className="mt-0.5 block text-meta text-ink-3">Primary source</span>
              </dt>
              <dd className="m-0 mt-2 flex flex-1 flex-col text-body text-ink-2">
                <span className="block">
                  Team schedules, scores, league standings tables and school colors come from
                  MaxPreps&rsquo; own public data feed, the same one that powers its team and league
                  pages. We read it, never write to it, and never hotlink its mascot images &mdash;
                  each school is shown as a color monogram instead, built from the two colors the feed
                  reports. Each team page&rsquo;s roster and season player stats come from MaxPreps
                  too, for all {counts.teams} teams in all {numberWord(leagues.length)} leagues: whatever the coach entered,
                  with anything nobody published left blank. Other public sources, such as a school&rsquo;s
                  own athletics site, only fill a blank MaxPreps leaves: the team page marks every roster
                  value that came from one, and its Sources row links each page behind those values and
                  behind the coaches it names.
                </span>
                <span className="mt-auto flex flex-wrap gap-2 pt-3">
                  <ExternalLink href={SOURCE_LINKS.maxpreps} className="sx-pill">
                    MaxPreps field hockey
                  </ExternalLink>
                </span>
              </dd>
            </div>
            <div className="sx-card flex flex-col p-5">
              <dt>
                <span className="block text-lead text-ink">High School on SI (si.com)</span>
                <span className="mt-0.5 block text-meta text-ink-3">Secondary &middot; cross-check and backfill</span>
              </dt>
              <dd className="m-0 mt-2 flex flex-1 flex-col text-body text-ink-2">
                <span className="block">
                  Sports Illustrated&rsquo;s high-school stats site (formerly SBLive) publishes its own
                  scoreboard. We compare every final score with it, and publish its score only under
                  the mechanical rules in{' '}
                  <a href="#backfills" className="text-accent hover:underline">
                    si.com backfills
                  </a>
                  . It is never used for league membership, records or the standings order.
                </span>
                <span className="mt-auto flex flex-wrap gap-2 pt-3">
                  <ExternalLink href={SOURCE_LINKS.sblive} className="sx-pill">
                    si.com field hockey
                  </ExternalLink>
                </span>
              </dd>
            </div>
            {perLeague.map(({ summary, config, noDocument, officialNotes }) => (
              <div key={summary.id} className="sx-card flex flex-col p-5">
                <dt>
                  <span className="block text-lead text-ink">{summary.shortName}</span>
                  <span className="mt-0.5 block text-meta text-ink-3">
                    {summary.name} &middot; {summary.section.shortName}
                  </span>
                </dt>
                <dd className="m-0 mt-2 flex flex-1 flex-col text-body text-ink-2">
                  {noDocument ? (
                    <span className="block">
                      The rules quoted under{' '}
                      <a href={`#rules-${summary.id}`} className="text-accent hover:underline">
                        {summary.shortName} rules
                      </a>{' '}
                      come from the CIF {summary.section.name}&rsquo;s Field Hockey Guidelines 2026-28.{' '}
                      {officialNotes.join(' ')}
                      {config.membershipNote ? ` ${config.membershipNote}` : ''}
                    </span>
                  ) : (
                    <span className="block">
                      League membership, the rules quoted under{' '}
                      <a href={`#rules-${summary.id}`} className="text-accent hover:underline">
                        {summary.shortName} rules
                      </a>{' '}
                      and every scheduled league game come from {summary.shortName}&rsquo;s own documents,
                      not from MaxPreps.
                      {isQuotedLeague(config) ? (
                        officialStandingsPdfUrl === null ? (
                          <> {summary.shortName} has not yet posted an official 2026-27 standings PDF; we check for one every run.</>
                        ) : officialStandingsPdfUrl ? (
                          <>
                            {' '}
                            {summary.shortName} has posted a 2026-27 standings PDF:{' '}
                            <ExternalLink href={officialStandingsPdfUrl}>view it</ExternalLink>.
                          </>
                        ) : null
                      ) : null}
                    </span>
                  )}
                  <span className="mt-auto flex flex-wrap gap-2 pt-3">
                    {config.links.map((l) => (
                      <ExternalLink key={l.href} href={l.href} className="sx-pill">
                        {l.label}
                      </ExternalLink>
                    ))}
                    {/* Only a published schedule gets a pill: a 'none' division (EAL) has none. */}
                    {config.divisions.map((d) =>
                      d.official.mode === 'none' ? null : (
                        <ExternalLink key={d.id} href={d.official.scheduleUrl} className="sx-pill">
                          {officialSourceLabel(summary.shortName, d.official.source)}
                          {summary.singleDivision ? '' : ` · ${d.label}`}
                        </ExternalLink>
                      ),
                    )}
                  </span>
                </dd>
              </div>
            ))}
            <div className="sx-card flex flex-col p-5 md:col-span-2">
              <dt>
                <span className="block text-lead text-ink">CIF-CCS</span>
                <span className="mt-0.5 block text-meta text-ink-3">Playoff dates &amp; format</span>
              </dt>
              <dd className="m-0 mt-2 flex flex-1 flex-col text-body text-ink-2">
                <span className="block">
                  The Central Coast Section publishes the playoff calendar and format for{' '}
                  {listWords(field.byLeague.map((l) => l.shortName))}.{' '}
                  {ncs?.noChampionshipNote ?? ''} See{' '}
                  <a href="#playoffs" className="text-accent hover:underline">
                    Postseason
                  </a>{' '}
                  below.
                </span>
                <span className="mt-auto flex flex-wrap gap-2 pt-3">
                  <ExternalLink href={SOURCE_LINKS.ccs} className="sx-pill">
                    CCS field hockey
                  </ExternalLink>
                </span>
              </dd>
            </div>
            {/* One card per section whose league runs an unbracketed tournament (the Northern
                Section: its Guidelines are the EAL's rules and set the Super Regional). */}
            {unbracketedSections.map((section) => {
              const sectionLeagues = unbracketed.filter((l) => l.section.id === section.id);
              const sources = [
                ...new Set(
                  sectionLeagues.flatMap((l) => {
                    const ps = getLeague(l.id).postseason;
                    return ps.kind === 'unbracketed-tournament' ? [ps.sourceUrl] : [];
                  }),
                ),
              ];
              return (
                <div key={section.id} className="sx-card flex flex-col p-5 md:col-span-2">
                  <dt>
                    <span className="block text-lead text-ink">CIF {section.name}</span>
                    <span className="mt-0.5 block text-meta text-ink-3">Rules &amp; postseason dates</span>
                  </dt>
                  <dd className="m-0 mt-2 flex flex-1 flex-col text-body text-ink-2">
                    <span className="block">
                      The {section.name}&rsquo;s Field Hockey Guidelines set the rules and the postseason for{' '}
                      {listWords(sectionLeagues.map((l) => l.shortName))}. See{' '}
                      <a href="#playoffs" className="text-accent hover:underline">
                        Postseason
                      </a>{' '}
                      below.
                    </span>
                    <span className="mt-auto flex flex-wrap gap-2 pt-3">
                      <ExternalLink href={section.officialUrl} className="sx-pill">
                        {section.shortName} field hockey
                      </ExternalLink>
                      {sources.map((href) => (
                        <ExternalLink key={href} href={href} className="sx-pill">
                          Field Hockey Guidelines (PDF)
                        </ExternalLink>
                      ))}
                    </span>
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="mt-stack max-w-prose text-meta text-ink-2">
            When MaxPreps has never published a result for a game that a league&rsquo;s official
            schedule says was scheduled &mdash; today that is {plural(officialFixtures.length, 'game', 'games')}{' '}
            &mdash; it is listed as scheduled per the league rather than silently dropped.
          </p>
          <p id="history-coverage" className="mt-stack max-w-prose text-meta text-ink-2">
            Last season ({historySeason}): the{' '}
            <Link href="/history/2025-26" prefetch={false} className="text-accent hover:underline">
              {historySeason} archive
            </Link>{' '}
            has final standings and all-league awards for{' '}
            {listWords(historyAvailable.map((l) => getLeague(l.id).shortName))}, each from that
            league&rsquo;s own documents (SCVAL&rsquo;s two PDFs; BVAL&rsquo;s standings sheet and all-league
            documents), because MaxPreps only ever serves the current season.
            {historyUnavailable.length > 0 ? (
              <>
                {' '}
                {listWords(historyUnavailable.map((l) => getLeague(l.id).shortName))}{' '}
                {historyUnavailable.length === 1 ? 'is' : 'are'} marked unavailable: we found no official{' '}
                {historySeason} final standings, and we do not fill the gap with standings or awards from
                third-party sites or newspapers.
              </>
            ) : null}
            {historyPublishedOnly.length > 0 ? (
              <>
                {' '}
                The archive links what {listWords(historyPublishedOnly.map((l) => getLeague(l.id).shortName))}{' '}
                did publish officially (
                {listWords(historyPublishedOnly.flatMap((l) => (l.entry.alsoPublished ?? []).map((d) => d.label)))}
                ), without reproducing it.
              </>
            ) : null}
          </p>
          <p id="clubs-coverage" className="mt-stack max-w-prose text-meta text-ink-2">
            Club field hockey: the{' '}
            <Link href="/clubs" prefetch={false} className="text-accent hover:underline">
              club teams
            </Link>{' '}
            pages list {getClubs().length} youth clubs (those around these schools, plus any other club
            a player here is tied to) and, for each, the players on these varsity rosters that a public
            page ties to it: the club&rsquo;s own site, a SportsRecruits, NCSA or Hudl profile, a
            MaxPreps career page, the NFHCA&rsquo;s high school watchlists, MAX Field Hockey&rsquo;s
            club and school pages, or local news such as the Gilroy Dispatch and Stick Together. It was
            researched by hand, each tie checked twice when it was added, and is not part of the
            twice-daily update. Only players already on these rosters are
            named, social media is never used, and recall is partial.
          </p>
          <p id="commits-coverage" className="mt-stack max-w-prose text-meta text-ink-2">
            College field hockey: the{' '}
            <Link href="/commits" prefetch={false} className="text-accent hover:underline">
              college commitments
            </Link>{' '}
            page lists the players on these varsity rosters that a public page says have committed to
            play field hockey in college{commitCount > 0 ? ` (${commitCount} found)` : ''}, from
            players&rsquo; recruiting profiles, commitment lists, club and school sites, and local
            news. It was researched by hand on {dateWithYear(getCommitsFile().capturedAt)} with the
            club pages&rsquo; matching rule, each commitment checked twice, and is not part of the
            twice-daily update. Social media is never used, so a commitment announced only there is
            not listed, and recall is partial.
          </p>
        </section>

        {/* ---------------------------------------------------------------- standings / rules */}
        <section id="standings" className="mt-16">
          <SectionHeader size="lg" kicker="Standings, points &amp; tiebreaks" />
          <div className="sx-prose">
            <p>
              Each league&rsquo;s standings are computed from individual game results by that
              league&rsquo;s own rules, then compared field by field against MaxPreps&rsquo; own
              published table (see{' '}
              <a href="#cross-check" className="text-accent hover:underline">
                the cross-check log
              </a>
              ). A team with no reported results is never shown as a fabricated 0-0-0 record. All{' '}
              {numberWord(leagues.length)} leagues award 3 points for a win and 1 for a tie
              {titleOnly.length === 0 ? (
                ' and order their tables by points'
              ) : (
                <>
                  ; {listWords(tableOrdered.map((l) => l.shortName))} order their tables by points, and{' '}
                  {listWords(titleOnly.map((l) => l.shortName))} {titleOnly.length === 1 ? 'uses' : 'use'} them
                  only to decide {titleOnly.length === 1 ? 'its title and ranks' : 'their titles and rank'} no
                  table, so this site orders {titleOnly.length === 1 ? 'that table' : 'those tables'} by the
                  same points
                </>
              )}
              ; they differ in which games count and how ties are broken.
            </p>
          </div>
          {perLeague.map(({ summary, config }) => (
            <section key={summary.id} id={`rules-${summary.id}`} className="mt-section" aria-labelledby={`rules-${summary.id}-heading`}>
              <SectionHeader as="h3" id={`rules-${summary.id}-heading`} kicker={`${summary.shortName} — ${summary.name}`} />
              {isQuotedLeague(config) ? <QuotedRules league={config} /> : <GeneratedRules league={config} />}
            </section>
          ))}
        </section>

        {/* ---------------------------------------------------------------- health */}
        <section id="health" className="mt-16">
          <SectionHeader size="lg" kicker="Data health, by league" />
          <p className="sx-prose">
            Each league is fetched and checked on its own, so a problem in one never holds the others
            back. This is how the most recent run went for each.
          </p>
          <div className="mt-stack grid gap-4 md:grid-cols-2">
            {perLeague.map((l) => (
              <LeagueHealthCard
                key={l.summary.id}
                shortName={l.summary.shortName}
                name={l.summary.name}
                health={l.health}
                divisions={l.healthDivisions}
                dropped={l.dropped.length}
                problems={l.problems}
              />
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- conventions */}
        <section id="conventions" className="mt-16">
          <SectionHeader size="lg" kicker="How a score is shown" />
          <div className="sx-prose">
            <p>
              One rule governs every score on this site: a game that has not been decided never shows
              as <span className="sx-num">0&ndash;0</span>. A real final score of 0 prints as{' '}
              <span className="sx-num">0</span> in full-strength ink; a game with nothing reported yet
              prints an em dash in muted ink, with a screen-reader label saying so. The two are never
              visually or semantically confused.
            </p>
            <ul className="list-disc">
              <li>A completed game shows <b className="font-semibold text-ink">FINAL</b> and the score; an overtime win adds an OT tag.</li>
              {shootoutLeagues.length > 0 ? (
                <li>
                  A level {listWords(shootoutLeagues.map((l) => l.shortName))} league game that MaxPreps
                  marks as won was decided on 1 v 1s: it shows the level score with an SO tag and counts as
                  the winner&rsquo;s win. The 1 v 1 tally is not shown.
                </li>
              ) : null}
              <li>
                A forfeit counts in win-loss-tie but not in goals for/against/differential &mdash; marked
                with a dagger everywhere a total would otherwise be misleading.
              </li>
              <li>A game with no score posted yet shows <b className="font-semibold text-ink">SCORE NOT REPORTED</b> with an empty outline chip, never a blank or a zero.</li>
              <li>
                A game MaxPreps marks as in progress shows <b className="font-semibold text-ink">LIVE</b>, but this is a scheduled-window label, not a running score &mdash; see{' '}
                <a href="#freshness" className="text-accent hover:underline">
                  how often this updates
                </a>
                .
              </li>
              <li>A postponed game shows <b className="font-semibold text-ink">POSTPONED</b> with the new date when one is known, or &ldquo;TBD&rdquo; when it is not.</li>
              <li>A non-league game carries a small NL tag everywhere; it counts in a team&rsquo;s overall record and nowhere in the league standings.</li>
              <li>A score published from si.com carries a marker and a &ldquo;score via si.com&rdquo; line on its game page.</li>
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------------- cross-check */}
        <section id="cross-check" className="mt-16">
          <SectionHeader size="lg" kicker="Cross-check log" />
          <p className="sx-prose">
            MaxPreps&rsquo; own standings feed already carries its computed record, points, goals and
            placement for every team, so checking our work is a direct comparison, not a
            reimplementation: for every team we compare our computed W-L-T, goals and place against
            MaxPreps&rsquo; published numbers, field by field. Every disagreement is published here and
            flagged with &#9873; on the standings row &mdash; we always show our own computation and say
            so, rather than silently picking a side. Where a league&rsquo;s MaxPreps table differs for a
            known reason, those rows are listed separately under the reason.
          </p>
          {perLeague.map((l) => (
            <div key={l.summary.id} className="mt-section">
              <h3 className="m-0 mb-3 text-lead text-ink">
                {l.summary.shortName} vs. MaxPreps&rsquo; {l.summary.singleDivision ? 'table' : 'tables'}
              </h3>
              <CrossCheckTable groups={l.plainGroups} teamCount={l.summary.teamCount} emptyText={l.emptyText} />
              {l.causeGroups.map((c) => (
                <div key={c.cause} className="mt-stack">
                  <h4 className="m-0 text-body font-semibold text-ink">Known difference</h4>
                  <p className="mt-1 mb-3 max-w-prose text-meta text-ink-2">{c.cause}</p>
                  <CrossCheckTable groups={c.groups} teamCount={l.summary.teamCount} />
                </div>
              ))}
            </div>
          ))}

          <h3 className="mt-section mb-3 text-lead text-ink">vs. si.com scores</h3>
          {sbliveCross ? (
            <SbliveCrossCheckSummary cross={sbliveCross} />
          ) : (
            <EmptyState heading="No si.com comparison in the most recent run.">
              This step is optional and failure-tolerant; when it runs, every disagreement and every
              si.com-only score appears here.
            </EmptyState>
          )}
        </section>

        {/* ---------------------------------------------------------------- backfills */}
        <section id="backfills" className="mt-16">
          <SectionHeader
            size="lg"
            kicker="si.com backfills"
            meta={plural(backfilled.length, 'score', 'scores')}
          />
          <div className="sx-prose">
            <p>
              MaxPreps is our primary source. We publish a score from High School on SI (si.com) only
              when one of these holds, and only when si.com has the game as final with both teams
              matched by si.com&rsquo;s own team ids (never by name), on the official date or a day
              either side of it:
            </p>
            <ul className="list-disc">
              <li>MaxPreps has no contest at all for a game on the league&rsquo;s official schedule;</li>
              <li>MaxPreps lists the game, its date has passed, and it has no score;</li>
              <li>
                MaxPreps&rsquo; row is clearly wrong in a way we can check mechanically: its own win/loss
                flags contradict its score, the official schedule shows the game was not played on
                MaxPreps&rsquo; date, or it shows a scoreless tie that si.com reports as decided in a
                league that plays no overtime.
              </li>
            </ul>
            <p>
              {shootoutLeagues.length > 0 ? (
                <>
                  A level si.com score between two {listWords(shootoutLeagues.map((l) => l.shortName))}{' '}
                  teams is never used: a varsity game there is decided on 1 v 1s, and si.com does not say
                  who won them.{' '}
                </>
              ) : null}
              Any other disagreement keeps MaxPreps&rsquo; score and is listed in the cross-check log.
              A backfilled score counts in the standings like any other final. si.com never decides
              league membership, league records or the standings order.
            </p>
          </div>
          <div className="mt-stack">
            <BackfillTable rows={backfilled} />
          </div>
        </section>

        {/* ---------------------------------------------------------------- dropped */}
        <section id="dropped" className="mt-16">
          <SectionHeader size="lg" kicker="Dropped contests" meta={plural(dropped.length, 'contest', 'contests')} />
          <p className="sx-prose">
            Contests the pipeline removed on purpose this run, published so nothing disappears silently.
          </p>
          {dropped.length === 0 ? (
            <p className="mt-stack max-w-prose text-body text-ink-2">Nothing was dropped in the most recent run.</p>
          ) : (
            <ul className="sx-list mt-stack max-w-prose">
              {dropped.map((d) => (
                <li key={d.contestId} className="py-3 text-meta text-ink-2">
                  <span className="block text-body text-ink">
                    {d.teams.join(' vs ') || 'Unknown teams'}
                    {d.dateKey ? (
                      <span className="text-meta text-ink-3">
                        {' '}
                        &middot; <time dateTime={d.dateKey}>{shortDate(d.dateKey)}</time>
                      </span>
                    ) : null}
                  </span>
                  <span className="block">
                    {DROP_REASON_WORDS[d.reason]}: {d.note}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------------------------------------------------------------- freshness */}
        <section id="freshness" className="mt-16">
          <span id="updates" className="block" />
          <SectionHeader size="lg" kicker="How often this updates" />
          <div className="sx-prose">
            <p>
              This whole site is static: nothing here queries a live API when you load a page. Instead,
              an automated job re-fetches MaxPreps (and, on most runs, si.com, the league documents and
              the CCS calendar) and rebuilds the site from scratch, roughly twice a day during the
              season &mdash; once overnight and once in the early morning, Pacific time &mdash; between
              August and November. A game that finishes at 7 PM Thursday typically appears on the site
              Friday morning, not that same night.
            </p>
            <p>
              <b className="font-semibold text-ink">Live scores are not collected.</b> A game MaxPreps
              marks as in progress is shown as a scheduled window with a{' '}
              <b className="font-semibold text-ink">LIVE</b> label, never a running score, because this
              site has no mechanism that watches a game while it is being played.
            </p>
            <p>
              The snapshot this page was built from was fetched {formatStamp(getFetchedAt())}. If a page
              anywhere on the site shows a &ldquo;last updated&rdquo; stamp more than 36 hours old, that
              is this site telling you its own update may be failing &mdash; not a claim that nothing
              happened in the leagues since then. Per-league detail is under{' '}
              <a href="#health" className="text-accent hover:underline">
                data health
              </a>
              .
            </p>
            <h3>Most recent run, by source</h3>
            <p className="text-meta text-ink-2">
              {plural(counted.ok, 'source', 'sources')} ok &middot; {counted.stale} stale &middot;{' '}
              {counted.error} failed &middot; {counted.skipped} skipped (season-gated or optional steps,
              by design).
            </p>
            {erroring.length > 0 ? (
              <ul className="sx-list">
                {erroring.map((s) => (
                  <li key={`${s.id}-${s.label}`} className="py-2 text-meta text-ink-2">
                    <b className="font-semibold text-loss-ink">{s.label}</b>
                    {s.error ? `: ${s.error}` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-meta text-ink-3">No source failed outright in the most recent run.</p>
            )}
          </div>
        </section>

        {/* ---------------------------------------------------------------- postseason */}
        <section id="playoffs" className="mt-16">
          <SectionHeader size="lg" kicker="Postseason" />
          <div className="sx-prose">
            <p>
              The CCS field is {field.total} teams: {field.byLeague.map((l) => `${l.shortName} ${l.auto}`).join(', ')} and{' '}
              {field.atLarge} at-large ({CCS.citations.allocation}; {CCS.citations.change}). Each
              league&rsquo;s own route to its automatic berths is under its rules above; the live,
              team-by-team picture is on the{' '}
              <Link href="/playoffs" className="text-accent hover:underline">
                CCS playoffs
              </Link>{' '}
              page.
            </p>
            {leagues
              .filter((l) => tournamentIds.has(l.id))
              .map((l) => {
                const ps = getLeague(l.id).postseason;
                return (
                  <p key={l.id}>
                    {l.section.name}: {sections.find((s) => s.id === l.section.id)?.noChampionshipNote ?? ''}{' '}
                    <Link href={`/playoffs/${l.id}`} prefetch={false} className="sx-action text-accent hover:underline">
                      {ps.kind === 'league-tournament' ? ps.name : `${l.shortName} postseason`}
                    </Link>
                  </p>
                );
              })}
            {unbracketed.map((l) => {
              const ps = getLeague(l.id).postseason;
              if (ps.kind !== 'unbracketed-tournament') return null;
              return (
                <p key={l.id}>
                  {l.section.name}: {ps.note}{' '}
                  <ExternalLink href={ps.sourceUrl}>{l.section.name} Field Hockey Guidelines (PDF)</ExternalLink>
                </p>
              );
            })}
            <h3>CCS key dates</h3>
            {/* The dates sit inside sentences, so they stay in the prose's sans with tabular
                figures (`tabular-nums`), not mono `sx-num`: mono is for digits that stack in a
                column (DESIGN §4.3), and a mono date mid-line read as a pasted code fragment. */}
            <ul className="list-disc">
              <li>
                Entries due &amp; seeding meeting:{' '}
                <span className="tabular-nums">
                  {dateWithYear(playoffs.keyDates.entriesDue)}, {timeOfDayPT(playoffs.keyDates.entriesDue)}
                </span>{' '}
                / <span className="tabular-nums">{timeOfDayPT(playoffs.keyDates.seedingMeeting)}</span>
              </li>
              <li>
                Quarterfinals: <span className="tabular-nums">{dateWithYear(playoffs.keyDates.quarterfinals)}</span>
              </li>
              <li>
                Semifinals: <span className="tabular-nums">{dateWithYear(playoffs.keyDates.semifinals)}</span>
              </li>
              <li>
                Final: <span className="tabular-nums">{dateWithYear(playoffs.keyDates.finals)}</span>
              </li>
              <li>
                Committee evaluation:{' '}
                <span className="tabular-nums">
                  {dateWithYear(playoffs.keyDates.evaluationMeeting)}, {timeOfDayPT(playoffs.keyDates.evaluationMeeting)}
                </span>
              </li>
            </ul>
            <p className="text-meta text-ink-3">
              {ccsCalendar === undefined
                ? 'The CCS office also publishes a machine-readable calendar for these dates; this site starts polling it in late October and will note here whether it confirms the dates above.'
                : keyDatesConfirmed
                  ? "The CCS office's own calendar confirms every date above."
                  : "The CCS office's own calendar shows at least one difference from the dates above — check it directly."}{' '}
              <ExternalLink href={SOURCE_LINKS.ccsCalendar}>CCS calendar</ExternalLink>. Official bracket:{' '}
              <ExternalLink href={playoffs.bracketUrl}>{playoffs.bracketPublished ? 'view it' : 'not yet published'}</ExternalLink>.
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- privacy / a11y */}
        <section id="a11y" className="mt-16">
          <span id="privacy" className="block" />
          <SectionHeader size="lg" kicker="Privacy &amp; accessibility" />
          <div className="sx-prose">
            <p>
              This site stores exactly three things, all only in your browser: a theme choice, a pinned
              team and the league you chose to see on the home page. All three live in{' '}
              <code>localStorage</code> and none is ever sent anywhere &mdash; there are no accounts, no
              analytics, no tracking cookies and no third-party requests of any kind on any page. School
              colors come from data already in the snapshot, never a hotlinked image, and fonts are
              bundled with the site rather than loaded from a font host at view time.
            </p>
            <p>
              Accessibility is a floor, not an aspiration: every win/loss/tie is a letter and a written
              word, never color alone; every score and result has a full sentence for screen readers;
              contrast is measured against WCAG AA on every ink/surface pair the site actually uses, and
              a token edit that breaks that floor fails this repository&rsquo;s own tests before it can
              ship.
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- contact */}
        <section id="contact" className="mt-16">
          <span id="corrections" className="block" />
          <SectionHeader size="lg" kicker="Corrections &amp; contact" />
          <div className="sx-prose">
            <p>
              This is an independent hobby project with no staffed inbox, so the fastest way to check
              anything you think looks wrong is to compare it against the primary source directly
              &mdash; every team, standings table and game on this site links back to its MaxPreps page,
              and the league documents above link straight to each league&rsquo;s own files
              {noDocumentLeagues.length > 0 && `, or, for ${noDocumentWho}, to ${noDocumentGuidelines}`}. If a number
              here disagrees with one of those sources, that is exactly what{' '}
              <a href="#cross-check" className="text-accent hover:underline">
                the cross-check log
              </a>{' '}
              is for, and it is worth checking there first: a real disagreement between sources is
              published, not hidden.
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- not affiliated */}
        <section id="not-affiliated" className="mt-16 mb-2">
          <SectionHeader size="lg" kicker="Not affiliated" />
          <div className="sx-prose">
            <p>
              This is an unofficial fan site. It is not affiliated with, endorsed by, or operated by{' '}
              {listWords(leagues.map((l) => `the ${l.name} (${l.shortName})`))}, the CIF{' '}
              {listWords(sections.map((s) => `${s.name} (${s.shortName})`))}, MaxPreps or Sports
              Illustrated. All team names, colors and marks belong to their respective schools. Records
              here are computed from published game results and, while we cross-check them and publish
              every disagreement we find, they may differ from an official ruling &mdash; each
              league&rsquo;s own standings
              {noDocumentLeagues.length > 0 &&
                ` (or, for ${noDocumentWho}, which ${noDocumentLeagues.length === 1 ? 'publishes' : 'publish'} none, ${noDocumentGuidelines})`}{' '}
              are always the
              source of truth for anything that matters competitively, such as playoff seeding.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

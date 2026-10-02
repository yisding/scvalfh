/**
 * The /standings view model. PURE: it takes snapshot records in and returns strings and arrays,
 * so it never touches `fs` and can be exercised straight from a script.
 *
 * Everything it decides is a by-law, not a preference:
 *
 *  - Order and points are Article VI §2 (3 for a win, 1 for a tie) — `lib/standings.ts` has
 *    already ranked the rows, so this module never re-sorts them.
 *  - Places can be SHARED. Article VI §7 ends in a coin flip we cannot compute, so two teams can
 *    carry the same place with `tiebreak.shared === true`. That is also why the qualifier cut is
 *    COUNTED (how many rows sit at place ≤ 3) rather than assumed to be three.
 *  - Playoff status is Article VII §2: places 1-3 automatic, 4th plays in, 5th goes to CCS for
 *    at-large consideration. A team with no reported results gets NO projected place at all.
 */

import { ordinal, shortDate } from '../../lib/format';
import { BYLAW_CITATIONS, DIVISION_LABELS } from '../../lib/season';
import { outcomesFor } from '../../lib/standings';
import type {
  CrossCheckRow,
  Division,
  OfficialFixture,
  PlayoffStatus,
  Standing,
  Team,
  TeamSlug,
} from '../../lib/types';
import type { StandingsRowData } from '../ui/StandingsTable';

export interface StatusTeam {
  slug: TeamSlug;
  name: string;
  place: number;
  /** Article VI §7: level with another team, so the marker is "5=" and the cut is unsettled. */
  shared: boolean;
}

export interface StatusGroup {
  status: PlayoffStatus;
  /** A word or letters — never a hue on its own (DESIGN §6.5). */
  badge: string;
  label: string;
  teams: StatusTeam[];
}

export interface MismatchNote {
  slug: TeamSlug;
  name: string;
  field: string;
  ours: string;
  theirs: string;
  url: string;
}

export interface UnreportedFixtures {
  total: number;
  /** Fixtures involving a team that has no reported results at all. */
  noDataTotal: number;
  noDataTeams: string[];
  /** The remaining matchups, deduped — MaxPreps has simply never published them. */
  otherMatchups: string[];
}

export interface DivisionView {
  division: Division;
  label: string;
  rows: StandingsRowData[];
  gdDomain: number;
  /** The table's `<caption>`: shown on desktop, visually hidden on phone. */
  caption: string;
  /** The rule-and-kicker's right-hand meta. */
  meta: string;
  footnotes: string[];
  /** 1-based row index to draw the 2px automatic-qualifier rule after. */
  berthRuleAfter?: number;
  statusGroups: StatusGroup[];
  /** Why the qualifier cut is not settled, when a shared place straddles it. */
  statusCaveat: string | null;
  /** Teams with no reported results — named, never ranked. */
  unrankedTeams: string[];
  mismatches: MismatchNote[];
  unreported: UnreportedFixtures;
  sourceUrl: string;
  /** The official SCVAL schedule grid this division's fixtures come from. */
  scheduleUrl: string;
  throughDate: string | null;
  leagueFinals: number;
  pendingLeagueGames: number;
}

const STATUS_ORDER: PlayoffStatus[] = ['aq', 'play-in', 'at-large', 'out'];

const STATUS_BADGE: Record<PlayoffStatus, string> = {
  aq: 'AQ',
  'play-in': 'Play-in',
  'at-large': 'At-large',
  out: 'No AQ',
};

/** The legend sentence for each status. `playInDate` is the Oct 30 crossover from the snapshot. */
export function statusLabel(status: PlayoffStatus, playInDate: string): string {
  switch (status) {
    case 'aq':
      return 'Places 1-3 — automatic CCS qualifier';
    case 'play-in':
      return `4th place — play-in ${shortDate(playInDate)} for the SCVAL 7th berth`;
    case 'at-large':
      return '5th place — submitted to CCS for at-large consideration';
    case 'out':
      return '6th or lower — no automatic path';
  }
}

export interface DivisionViewInput {
  division: Division;
  /** Already sorted and ranked by lib/standings.ts. */
  standings: readonly Standing[];
  teams: readonly Team[];
  crossCheck: readonly CrossCheckRow[];
  officialFixtures: readonly OfficialFixture[];
  gdDomain: number;
  playInDate: string;
  sourceUrl: string;
  scheduleUrl: string;
  /** dateKey of the most recent league game with a published result. */
  throughDate: string | null;
  leagueFinals: number;
  pendingLeagueGames: number;
}

export function buildDivisionView(input: DivisionViewInput): DivisionView {
  const label = DIVISION_LABELS[input.division];
  const teamById = new Map(input.teams.map((t) => [t.id, t]));
  const nameOf = (slug: TeamSlug) =>
    input.teams.find((t) => t.slug === slug)?.shortName ?? slug;

  const rows: StandingsRowData[] = [];
  for (const standing of input.standings) {
    const team = teamById.get(standing.teamId);
    if (team) rows.push({ standing, team });
  }

  const ranked = rows.filter((r) => r.standing.hasReportedResults);
  const unrankedTeams = rows
    .filter((r) => !r.standing.hasReportedResults)
    .map((r) => r.team.name);

  // COUNTED, not assumed: if two teams were level on 3rd there would be four rows at place ≤ 3.
  const aqRows = ranked.filter((r) => r.standing.computed.place <= 3);
  const berthRuleAfter =
    aqRows.length > 0 && aqRows.length < rows.length ? aqRows.length : undefined;

  // A level place spans as many finishing slots as the tied group has teams, so two teams level on
  // 3rd hold the third automatic berth AND the 4th-place play-in spot between them. Grouping on
  // `playoffStatus` alone would file both under AQ and make the play-in group vanish, which is
  // exactly the row a reader has come to /standings to find.
  const statusGroups: StatusGroup[] = [];
  for (const status of STATUS_ORDER) {
    const teams = ranked
      .filter((r) => outcomesFor(r.standing).includes(status))
      .map((r) => ({
        slug: r.team.slug,
        name: r.team.shortName,
        place: r.standing.computed.place,
        shared: r.standing.tiebreak.shared,
      }));
    if (teams.length > 0) {
      statusGroups.push({ status, badge: STATUS_BADGE[status], label: statusLabel(status, input.playInDate), teams });
    }
  }

  // A shared place inside the qualifier window means the boundary itself is unresolved.
  const contested = [...new Set(
    ranked
      .filter((r) => r.standing.tiebreak.shared && r.standing.computed.place <= 5)
      .map((r) => r.standing.computed.place),
  )].sort((a, b) => a - b);
  const statusCaveat = contested.length
    ? `${contested
        .map((place) => {
          const n = ranked.filter((r) => r.standing.computed.place === place).length;
          return `${n} teams are level on ${ordinal(place)}`;
        })
        .join(' and ')}, so this cut is not settled here — ${BYLAW_CITATIONS.coinFlip}. ` +
      'A level place spans every slot it covers, so a team can appear under two markers above.'
    : null;

  const mismatches: MismatchNote[] = input.crossCheck
    .filter((row) => rows.some((r) => r.team.slug === row.slug))
    .map((row) => ({
      slug: row.slug,
      name: nameOf(row.slug),
      field: row.field,
      ours: row.ours,
      theirs: row.theirs,
      url: row.url,
    }));

  const noDataSlugs = new Set(
    rows.filter((r) => !r.standing.hasReportedResults).map((r) => r.team.slug),
  );
  const noData = input.officialFixtures.filter(
    (f) =>
      (f.awaySlug !== null && noDataSlugs.has(f.awaySlug)) ||
      (f.homeSlug !== null && noDataSlugs.has(f.homeSlug)),
  );
  // Deduped on the UNORDERED pair: a double round robin plays every matchup twice, so
  // "Cupertino–Homestead and Homestead–Cupertino" would read as two different fixtures.
  const legs = new Map<string, number>();
  for (const fixture of input.officialFixtures) {
    if (noData.includes(fixture)) continue;
    const away = fixture.awaySlug ? nameOf(fixture.awaySlug) : fixture.awayName;
    const home = fixture.homeSlug ? nameOf(fixture.homeSlug) : fixture.homeName;
    const key = [away, home].sort().join('–');
    legs.set(key, (legs.get(key) ?? 0) + 1);
  }
  const otherMatchups = [...legs.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([pair, count]) => (count > 1 ? `${pair} (both legs)` : pair));
  const unreported: UnreportedFixtures = {
    total: input.officialFixtures.length,
    noDataTotal: noData.length,
    noDataTeams: [...new Set(
      noData.flatMap((f) =>
        [f.awaySlug, f.homeSlug]
          .filter((slug): slug is TeamSlug => slug !== null && noDataSlugs.has(slug))
          .map(nameOf),
      ),
    )],
    otherMatchups,
  };

  const through = input.throughDate ? shortDate(input.throughDate) : null;
  const meta = through
    ? `League games only · through ${through}`
    : 'League games only · none played yet';
  const caption = through
    ? `${label} Division league standings, league games only, through ${through}. Computed from published results; unofficial.`
    : `${label} Division league standings. No league game has been reported yet.`;

  const footnotes: string[] = [];
  if (berthRuleAfter) {
    footnotes.push(
      `The 2px rule after ${ordinal(berthRuleAfter)} place is the automatic-qualifier cut — ${BYLAW_CITATIONS.qualifiers}.`,
    );
  }
  footnotes.push(
    'This order is our computation from published results, not a league ruling: the official tiebreak, including any coin flip, belongs to SCVAL.',
  );
  if (input.pendingLeagueGames > 0) {
    const plural = input.pendingLeagueGames === 1 ? 'game has' : 'games have';
    footnotes.push(
      `${input.pendingLeagueGames} league ${plural} been played with no score published, so ${
        input.pendingLeagueGames === 1 ? 'it counts' : 'they count'
      } for nothing above — not in W-L-T, PTS, GF, GA, GD, the streak or the last 5.`,
    );
  }
  if (input.leagueFinals === 0) {
    footnotes.push(
      'No league result has been published yet, so no team is ranked and every record reads 0-0-0.',
    );
  }

  return {
    division: input.division,
    label,
    rows,
    gdDomain: input.gdDomain,
    caption,
    meta,
    footnotes,
    ...(berthRuleAfter ? { berthRuleAfter } : {}),
    statusGroups,
    statusCaveat,
    unrankedTeams,
    mismatches,
    unreported,
    sourceUrl: input.sourceUrl,
    scheduleUrl: input.scheduleUrl,
    throughDate: input.throughDate,
    leagueFinals: input.leagueFinals,
    pendingLeagueGames: input.pendingLeagueGames,
  };
}

/** "St Ignatius 4-0-0, 12 pts" — the one fact a link preview or a <title> can carry. */
export interface LeaderLine {
  division: Division;
  label: string;
  teams: Array<{ name: string; record: string; pts: number }>;
  /** Article VI §2: a tie at the top means BOTH teams are division champions. */
  tiedAtTop: boolean;
}

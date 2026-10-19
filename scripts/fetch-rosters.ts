#!/usr/bin/env tsx
/**
 * Fetch every registry team's MaxPreps roster page into data/rosters.json (SPEC §1.1j): all nine
 * leagues and the three independents, 102 teams.
 *
 *   pnpm fetch-rosters                     live: one roster page per registry team (102)
 *   pnpm fetch-rosters --leagues scval,bval  only these leagues; the others keep their previous rows
 *   pnpm fetch-rosters --fixtures <dir>    offline: read roster-<slug>.html captures
 *   pnpm fetch-rosters --capture <dir>     live, and save each page read as <dir>/roster-<slug>.html
 *   pnpm fetch-rosters --out <path>        write somewhere else
 *   pnpm fetch-rosters --dry-run           parse and report, write nothing (captures included)
 *   pnpm fetch-rosters --fetched-at <iso>  pin the stamp (reproducible fixture builds)
 *
 * A run whose rows equal the previous file's apart from fetchedAt / error text leaves it as it was.
 *
 * Not part of the twice-daily cron: a roster changes a few times a season and each page is ~250 KB,
 * so this runs by hand or from a weekly schedule. The budget is the MaxPreps client's own
 * (concurrency <= 3, 500 ms between request starts, 15 s timeout, retry 429/5xx only).
 *
 * A partial run still publishes, and failures are scoped to the team (lib/pipeline/fetch-scope.ts): a team
 * whose page fails to fetch or to parse keeps the previous file's rows with status
 * 'carried-forward' (or 'error' when there is nothing to carry), and never stops another team or
 * another league from being read. A team outside a `--leagues` run keeps the previous file's row
 * untouched (or is 'pending' when the file has none). The process exits 1 when a team the run
 * covered failed, so a scheduler notices; the report ends with one line per league. The parser
 * throws on any sign of positional drift, which lands here as that same per-team failure — never
 * as a wrong grade beside a name.
 *
 * The previous file is salvaged row by row (readPreviousFile): a row that no longer validates on
 * its own (a slug gone from the registry, a changed id or division, a broken status) is dropped
 * and named in the log, and that team alone has nothing to keep — pending when out of scope, which
 * also exits 1 and is never reported as "kept as they were". A file from another season keeps
 * nothing (its teams read as absent). A file that is not JSON at all stops the run: exit 1, nothing
 * written.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { INDEPENDENT_LEAGUES, LEAGUES_PROPER } from '@/lib/config/leagues';
import { SEASON_YEAR } from '@/lib/config/season';
import type { Team } from '@/lib/model/team';
import { droppedTeamSlugs } from '@/lib/pipeline/fetch-scope';
import { TEAMS } from '@/lib/registry/teams';
import {
  type Rosters, RostersPartialSchema, RostersSchema, type TeamRoster, TeamRosterSchema, countRosters,
  rostersContentKey,
} from '@/lib/schema/rosters';
import { MaxPrepsClient } from '@/lib/sources/maxpreps/client';
import { parseRosterPage, pendingRoster, rosterUrl } from '@/lib/sources/maxpreps/roster';
import { runCli } from './lib/cli';
import {
  type ScopedFetchArgs,
  finishWrite,
  loadPreviousFile,
  logHeader,
  logTeamLines,
  openCapture,
  parseScopedArgs,
  refuseUnreadable,
  reportLeagues,
  runScopedTeams,
  scopedFetchDefaults,
  validateOrFail,
} from './lib/fetch-job';

const NOTES = [
  `One entry per registry team, all ${LEAGUES_PROPER.length} leagues (${LEAGUES_PROPER.map((l) => l.shortName).join(', ')}) and the ${INDEPENDENT_LEAGUES.map((l) => l.name).join(', ')}, read the same way. A team with status pending has not been covered by any run yet: nothing was fetched and nothing is claimed for it.`,
  "Rows come from each team's MaxPreps roster page (__NEXT_DATA__ athleteData), decoded with MaxPreps' own GSSP_ROSTER_SERIALIZE_KEYS column list and cross-checked row by row against the page's rendered table; a disagreement fails the team rather than publishing a wrong value.",
  'Grade, position, jersey and height are whatever the coach entered on MaxPreps; blanks are null, never guessed. Several programs publish names only.',
  'Soft-deleted rows (isDeleted) are dropped, as MaxPreps hides them. athleteId and rosterId are per-season ids; careerProfileId / careerId identify the player across seasons.',
  "A team with status carried-forward keeps the previous file's rows after a failed fetch; its own fetchedAt says when those rows were read.",
];

/** The registry's half of a team's row, whatever its page says. */
function baseOf(team: Team) {
  return {
    slug: team.slug,
    teamId: team.id,
    name: team.name,
    division: team.division,
    rosterUrl: rosterUrl(team),
  };
}

async function main(argv: readonly string[]): Promise<number> {
  const args = parseScopedArgs<ScopedFetchArgs>(argv, { init: () => scopedFetchDefaults('rosters.json'), records: 'live pages' });
  const fetchedAt = args.fetchedAt ?? new Date().toISOString();
  const previous = loadPreviousFile(args.out, { season: SEASON_YEAR, row: TeamRosterSchema, file: RostersPartialSchema });
  if (previous && !previous.readable) return refuseUnreadable(args.out, previous.reason);
  const dropped = droppedTeamSlugs(previous);
  const client = new MaxPrepsClient({ onLog: (l) => console.log(`  ${l}`) });

  logHeader('fetch-rosters', { fixtures: args.fixtures, leagues: args.leagues, what: (covered) => `${covered.length} MaxPreps roster pages` });
  const capture = openCapture(args.capture, args.dryRun);

  const teams: TeamRoster[] = await runScopedTeams<TeamRoster>({
    teams: TEAMS,
    leagues: args.leagues,
    previous,
    dropped,
    pending: pendingRoster,
    fetch: async (team) => {
      const base = baseOf(team);
      let html: string;
      if (args.fixtures) {
        html = readFileSync(
          path.join(args.fixtures, `roster-${team.slug}.html`),
          'utf8',
        );
      } else {
        if (!base.rosterUrl) throw new Error('no MaxPreps team URL in the registry');
        html = (await client.text(base.rosterUrl)).data;
        capture.save(`roster-${team.slug}.html`, html, { ensureNewline: false });
      }
      // A team with no data coverage has a placeholder registry id (no standings row to read a
      // GUID from), so the page's own id cannot be asserted against it; every other must match.
      const page = parseRosterPage(html, {
        expectedTeamId: team.dataCoverage === 'none' ? undefined : team.id,
        url: base.rosterUrl ?? team.slug,
      });
      return {
        ...base,
        maxprepsTeamId: page.teamId,
        status: page.players.length ? 'ok' : 'empty',
        athleteCount: page.athleteCount,
        staffCount: page.staffCount,
        players: page.players,
        deletedRows: page.deletedRows,
        warnings: page.warnings,
        fetchedAt,
        error: null,
      };
    },
    carry: (prior, team, error) => ({
      ...prior,
      ...baseOf(team),
      status: 'carried-forward',
      error,
    }),
    errorRow: (team, error) => ({
      ...baseOf(team),
      maxprepsTeamId: null,
      status: 'error',
      athleteCount: null,
      staffCount: null,
      players: [],
      deletedRows: 0,
      warnings: [],
      fetchedAt: null,
      error,
    }),
  });

  const rosters: Rosters = {
    season: SEASON_YEAR,
    fetchedAt,
    source: {
      id: 'maxpreps-html',
      builtBy: 'scripts/fetch-rosters.ts',
      notes: NOTES,
    },
    teams,
    counts: countRosters(teams),
  };

  const validated = validateOrFail(RostersSchema, rosters);
  if (!validated) return 1;

  logTeamLines(teams, (t) => {
    const n = t.players.length;
    const pct = (k: (p: TeamRoster['players'][number]) => boolean) =>
      n ? `${String(t.players.filter(k).length).padStart(2)}` : ' -';
    return (
      `${String(n).padStart(2)} players · ` +
      `grade ${pct((p) => p.grade !== null)} · pos ${pct((p) => p.position !== null)} · ` +
      `# ${pct((p) => p.jersey !== null)} · ht ${pct((p) => p.height !== null)} · ` +
      `C ${pct((p) => p.isCaptain)}`
    );
  });
  const { failed, lost, exitCode } = reportLeagues(teams, args.leagues, dropped, previous?.dropped ?? []);
  const c = rosters.counts;
  console.log(
    `\n${c.players} players on ${c.teams} teams · ${c.withGrade} with a grade · ` +
      `${c.withPosition} with a position · ${c.withJersey} with a number · ` +
      `${c.withHeight} with a height · ${c.captains} captains · ${failed} team(s) failed this run` +
      (lost ? ` · ${lost} team(s) outside it now pending: previous row dropped` : ''),
  );

  finishWrite({ out: args.out, file: rosters, parsed: validated, whole: previous?.whole, contentKey: rostersContentKey, dryRun: args.dryRun });
  return exitCode;
}

runCli(main);

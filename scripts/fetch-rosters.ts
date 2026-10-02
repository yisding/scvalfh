#!/usr/bin/env tsx
/**
 * Fetch every SCVAL team's MaxPreps roster page into data/rosters.json (SPEC §1.1j).
 *
 *   pnpm fetch-rosters                     live: 15 roster pages, one per registry team
 *   pnpm fetch-rosters --fixtures <dir>    offline: read roster-<slug>.html captures
 *   pnpm fetch-rosters --out <path>        write somewhere else
 *   pnpm fetch-rosters --dry-run           parse and report, write nothing
 *   pnpm fetch-rosters --fetched-at <iso>  pin the stamp (reproducible fixture builds)
 *
 * Not part of the twice-daily cron: a roster changes a few times a season and each page is ~250 KB,
 * so this runs by hand or from a weekly schedule. The budget is the MaxPreps client's own
 * (concurrency <= 3, 500 ms between request starts, 15 s timeout, retry 429/5xx only).
 *
 * A partial run still publishes: a team whose page fails to fetch or to parse keeps the previous
 * file's rows with status 'carried-forward' (or 'error' when there is nothing to carry), and the
 * process exits 1 so a scheduler notices. The parser throws on any sign of positional drift, which
 * lands here as that same per-team failure — never as a wrong grade beside a name.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { MaxPrepsClient } from '../lib/sources/maxpreps';
import { parseRosterPage, rosterUrl } from '../lib/sources/maxpreps-roster';
import {
  RostersSchema,
  countRosters,
  type Rosters,
  type TeamRoster,
} from '../lib/rosters-schema';
import { SEASON_YEAR } from '../lib/season';
import { TEAMS } from '../lib/teams';

interface Args {
  fixtures: string | null;
  out: string;
  dryRun: boolean;
  fetchedAt: string | null;
}

function parseArgs(argv: readonly string[]): Args {
  const out: Args = {
    fixtures: null,
    out: path.join(process.cwd(), 'data', 'rosters.json'),
    dryRun: false,
    fetchedAt: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (!v) throw new Error(`${arg} needs a value`);
      i += 1;
      return v;
    };
    if (arg === '--fixtures') out.fixtures = path.resolve(next());
    else if (arg === '--out') out.out = path.resolve(next());
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--fetched-at') out.fetchedAt = next();
    else throw new Error(`unknown flag: ${arg}`);
  }
  return out;
}

/** Keys sorted at every level, so re-running produces a byte-identical file. */
function stableStringify(value: unknown): string {
  const normalize = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(normalize);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(node as Record<string, unknown>).sort()) {
        const v = (node as Record<string, unknown>)[key];
        if (v !== undefined) out[key] = normalize(v);
      }
      return out;
    }
    return node;
  };
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

/** The previous file, if it exists and still validates; its rows are what a failed team keeps. */
function loadPrevious(file: string): Rosters | null {
  if (!existsSync(file)) return null;
  try {
    const parsed = RostersSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const NOTES = [
  'Rows come from each team\'s MaxPreps roster page (__NEXT_DATA__ athleteData), decoded with MaxPreps\' own GSSP_ROSTER_SERIALIZE_KEYS column list and cross-checked row by row against the page\'s rendered table; a disagreement fails the team rather than publishing a wrong value.',
  'Grade, position, jersey and height are whatever the coach entered on MaxPreps; blanks are null, never guessed. Several programs publish names only.',
  'Soft-deleted rows (isDeleted) are dropped, as MaxPreps hides them. athleteId and rosterId are per-season ids; careerProfileId / careerId identify the player across seasons.',
  'A team with status carried-forward keeps the previous file\'s rows after a failed fetch; its own fetchedAt says when those rows were read.',
];

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const fetchedAt = args.fetchedAt ?? new Date().toISOString();
  const previous = loadPrevious(args.out);
  const client = new MaxPrepsClient({ onLog: (l) => console.log(`  ${l}`) });

  console.log(
    args.fixtures
      ? `fetch-rosters: offline, from ${args.fixtures}`
      : `fetch-rosters: ${TEAMS.length} MaxPreps roster pages`,
  );

  const teams: TeamRoster[] = await Promise.all(
    TEAMS.map(async (team): Promise<TeamRoster> => {
      const url = rosterUrl(team);
      const base = {
        slug: team.slug,
        teamId: team.id,
        name: team.name,
        division: team.division,
        rosterUrl: url,
      };
      try {
        let html: string;
        if (args.fixtures) {
          html = readFileSync(path.join(args.fixtures, `roster-${team.slug}.html`), 'utf8');
        } else {
          if (!url) throw new Error('no MaxPreps team URL in the registry');
          html = (await client.text(url)).data;
        }
        // A team with no data coverage has a placeholder registry id (no standings row to read a
        // GUID from), so the page's own id cannot be asserted against it; every other must match.
        const page = parseRosterPage(html, {
          expectedTeamId: team.dataCoverage === 'none' ? undefined : team.id,
          url: url ?? team.slug,
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
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.warn(`WARN ${team.slug}: ${error}`);
        const prior = previous?.teams.find((t) => t.slug === team.slug);
        if (prior && prior.players.length) {
          return {
            ...prior,
            ...base,
            status: 'carried-forward',
            error,
          };
        }
        return {
          ...base,
          maxprepsTeamId: null,
          status: 'error',
          athleteCount: null,
          staffCount: null,
          players: [],
          deletedRows: 0,
          warnings: [],
          fetchedAt: null,
          error,
        };
      }
    }),
  );

  const rosters: Rosters = {
    season: SEASON_YEAR,
    fetchedAt,
    source: { id: 'maxpreps-html', builtBy: 'scripts/fetch-rosters.ts', notes: NOTES },
    teams,
    counts: countRosters(teams),
  };

  const validated = RostersSchema.safeParse(rosters);
  if (!validated.success) {
    console.error('FAILED: the assembled file does not validate:');
    for (const issue of validated.error.issues.slice(0, 10)) {
      console.error(`  ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    return 1;
  }

  console.log('');
  for (const t of teams) {
    const n = t.players.length;
    const pct = (k: (p: TeamRoster['players'][number]) => boolean) =>
      n ? `${String(t.players.filter(k).length).padStart(2)}` : ' -';
    console.log(
      `${t.slug.padEnd(17)} ${t.status.padEnd(15)} ${String(n).padStart(2)} players · ` +
        `grade ${pct((p) => p.grade !== null)} · pos ${pct((p) => p.position !== null)} · ` +
        `# ${pct((p) => p.jersey !== null)} · ht ${pct((p) => p.height !== null)} · ` +
        `C ${pct((p) => p.isCaptain)}` +
        (t.warnings.length ? ` · ${t.warnings.join('; ')}` : '') +
        (t.error ? ` · ERROR ${t.error}` : ''),
    );
  }
  const c = rosters.counts;
  console.log(
    `\n${c.players} players on ${c.teams} teams · ${c.withGrade} with a grade · ` +
      `${c.withPosition} with a position · ${c.withJersey} with a number · ` +
      `${c.withHeight} with a height · ${c.captains} captains · ${c.errors} team(s) failed`,
  );

  if (args.dryRun) {
    console.log('\ndry run: nothing written');
    return c.errors ? 1 : 0;
  }
  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, stableStringify(rosters), 'utf8');
  console.log(`\nwrote ${path.relative(process.cwd(), args.out)}`);
  return c.errors ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });

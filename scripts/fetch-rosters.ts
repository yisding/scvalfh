#!/usr/bin/env tsx
/**
 * Fetch every registry team's MaxPreps roster page into data/rosters.json (SPEC §1.1j): all five
 * leagues, 49 teams.
 *
 *   pnpm fetch-rosters                     live: one roster page per registry team (49)
 *   pnpm fetch-rosters --leagues scval,bval  only these leagues; the others keep their previous rows
 *   pnpm fetch-rosters --fixtures <dir>    offline: read roster-<slug>.html captures
 *   pnpm fetch-rosters --capture <dir>     live, and save each page read as <dir>/roster-<slug>.html
 *   pnpm fetch-rosters --out <path>        write somewhere else
 *   pnpm fetch-rosters --dry-run           parse and report, write nothing (captures included)
 *   a run whose rows equal the previous file's apart from fetchedAt / error text leaves it as it was
 *   pnpm fetch-rosters --fetched-at <iso>  pin the stamp (reproducible fixture builds)
 *
 * Not part of the twice-daily cron: a roster changes a few times a season and each page is ~250 KB,
 * so this runs by hand or from a weekly schedule. The budget is the MaxPreps client's own
 * (concurrency <= 3, 500 ms between request starts, 15 s timeout, retry 429/5xx only).
 *
 * A partial run still publishes, and failures are scoped to the team (lib/fetch-scope.ts): a team
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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  describePrevious,
  formatLeagueSummary,
  inScope,
  parseLeaguesFlag,
  readPreviousFile,
  runExitCode,
  stableStringify,
  summarizeByLeague,
  type PreviousFile,
} from "../lib/fetch-scope";
import { MaxPrepsClient } from "../lib/sources/maxpreps";
import { parseRosterPage, pendingRoster, rosterUrl } from "../lib/sources/maxpreps-roster";
import {
  RostersPartialSchema,
  RostersSchema,
  TeamRosterSchema,
  countRosters,
  rostersContentKey,
  type Rosters,
  type TeamRoster,
} from "../lib/rosters-schema";
import { SEASON_YEAR } from "../lib/season";
import { TEAMS } from "../lib/teams";
import type { LeagueId } from "../lib/types";

interface Args {
  fixtures: string | null;
  capture: string | null;
  leagues: LeagueId[] | null;
  out: string;
  dryRun: boolean;
  fetchedAt: string | null;
}

function parseArgs(argv: readonly string[]): Args {
  const out: Args = {
    fixtures: null,
    capture: null,
    leagues: null,
    out: path.join(process.cwd(), "data", "rosters.json"),
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
    if (arg === "--fixtures") out.fixtures = path.resolve(next());
    else if (arg === "--capture") out.capture = path.resolve(next());
    else if (arg === "--leagues") out.leagues = parseLeaguesFlag(next(), arg);
    else if (arg === "--out") out.out = path.resolve(next());
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--fetched-at") out.fetchedAt = next();
    else throw new Error(`unknown flag: ${arg}`);
  }
  if (out.fixtures && out.capture) throw new Error("--capture records live pages; it cannot be combined with --fixtures");
  return out;
}

/**
 * The previous file, if it exists, salvaged row by row (lib/fetch-scope.ts readPreviousFile): its
 * valid rows of this season are what a failed or out-of-scope team keeps. A file written before
 * every team was in the registry (the 15 SCVAL teams) still counts: the teams it lacks are simply
 * pending.
 */
function loadPrevious(file: string): PreviousFile<TeamRoster, Rosters> | null {
  if (!existsSync(file)) return null;
  return readPreviousFile(readFileSync(file, "utf8"), {
    season: SEASON_YEAR,
    row: TeamRosterSchema,
    file: RostersPartialSchema,
  });
}

const NOTES = [
  "One entry per registry team, all five leagues (SCVAL, BVAL, PCAL, MCAL, EAL), read the same way. A team with status pending has not been covered by any run yet: nothing was fetched and nothing is claimed for it.",
  "Rows come from each team's MaxPreps roster page (__NEXT_DATA__ athleteData), decoded with MaxPreps' own GSSP_ROSTER_SERIALIZE_KEYS column list and cross-checked row by row against the page's rendered table; a disagreement fails the team rather than publishing a wrong value.",
  "Grade, position, jersey and height are whatever the coach entered on MaxPreps; blanks are null, never guessed. Several programs publish names only.",
  "Soft-deleted rows (isDeleted) are dropped, as MaxPreps hides them. athleteId and rosterId are per-season ids; careerProfileId / careerId identify the player across seasons.",
  "A team with status carried-forward keeps the previous file's rows after a failed fetch; its own fetchedAt says when those rows were read.",
];

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const fetchedAt = args.fetchedAt ?? new Date().toISOString();
  const loaded = loadPrevious(args.out);
  if (loaded && !loaded.readable) {
    console.error(
      `FAILED: the previous ${path.relative(process.cwd(), args.out)} cannot be read: ${loaded.reason}. ` +
        "Nothing written: fix or remove it, then re-run.",
    );
    return 1;
  }
  const previous = loaded;
  if (previous) {
    for (const line of describePrevious(previous, path.relative(process.cwd(), args.out))) console.warn(line);
  }
  const dropped = new Set(previous?.dropped.flatMap((d) => (d.team ? [d.team] : [])) ?? []);
  const client = new MaxPrepsClient({ onLog: (l) => console.log(`  ${l}`) });

  console.log(
    args.fixtures
      ? `fetch-rosters: offline, from ${args.fixtures}`
      : `fetch-rosters: ${TEAMS.filter((t) => inScope(t, args.leagues)).length} MaxPreps roster pages` +
          (args.leagues ? ` (${args.leagues.join(", ")} only)` : ""),
  );
  // --dry-run writes nothing, --capture included.
  const capture = args.dryRun ? null : args.capture;
  if (capture) mkdirSync(capture, { recursive: true });

  const teams: TeamRoster[] = await Promise.all(
    TEAMS.map(async (team): Promise<TeamRoster> => {
      // A league outside this run is not fetched: its previous row stays as it was.
      if (!inScope(team, args.leagues)) {
        return previous?.rows.get(team.slug) ?? pendingRoster(team);
      }
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
          html = readFileSync(
            path.join(args.fixtures, `roster-${team.slug}.html`),
            "utf8",
          );
        } else {
          if (!url) throw new Error("no MaxPreps team URL in the registry");
          html = (await client.text(url)).data;
          if (capture) {
            writeFileSync(path.join(capture, `roster-${team.slug}.html`), html, "utf8");
          }
        }
        // A team with no data coverage has a placeholder registry id (no standings row to read a
        // GUID from), so the page's own id cannot be asserted against it; every other must match.
        const page = parseRosterPage(html, {
          expectedTeamId: team.dataCoverage === "none" ? undefined : team.id,
          url: url ?? team.slug,
        });
        return {
          ...base,
          maxprepsTeamId: page.teamId,
          status: page.players.length ? "ok" : "empty",
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
        console.warn(
          `WARN ${team.slug}: ${error}` +
            (dropped.has(team.slug) ? " (its previous row was dropped: nothing to carry forward)" : ""),
        );
        const prior = previous?.rows.get(team.slug);
        // Any row that was actually read (ok, empty, or itself carried forward) is still true: an
        // empty roster stays "MaxPreps lists no players", not "could not be read".
        if (prior && prior.status !== 'error' && prior.status !== 'pending') {
          return {
            ...prior,
            ...base,
            status: "carried-forward",
            error,
          };
        }
        return {
          ...base,
          maxprepsTeamId: null,
          status: "error",
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
    source: {
      id: "maxpreps-html",
      builtBy: "scripts/fetch-rosters.ts",
      notes: NOTES,
    },
    teams,
    counts: countRosters(teams),
  };

  const validated = RostersSchema.safeParse(rosters);
  if (!validated.success) {
    console.error("FAILED: the assembled file does not validate:");
    for (const issue of validated.error.issues.slice(0, 10)) {
      console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    return 1;
  }

  console.log("");
  for (const t of teams) {
    const n = t.players.length;
    const pct = (k: (p: TeamRoster["players"][number]) => boolean) =>
      n ? `${String(t.players.filter(k).length).padStart(2)}` : " -";
    console.log(
      `${t.slug.padEnd(17)} ${t.status.padEnd(15)} ${String(n).padStart(2)} players · ` +
        `grade ${pct((p) => p.grade !== null)} · pos ${pct((p) => p.position !== null)} · ` +
        `# ${pct((p) => p.jersey !== null)} · ht ${pct((p) => p.height !== null)} · ` +
        `C ${pct((p) => p.isCaptain)}` +
        (t.warnings.length ? ` · ${t.warnings.join("; ")}` : "") +
        (t.error ? ` · ERROR ${t.error}` : ""),
    );
  }
  const byLeague = summarizeByLeague(teams, args.leagues, dropped);
  console.log("");
  for (const l of byLeague) console.log(formatLeagueSummary(l));
  // A covered team that failed decides the exit code, and so does an uncovered one whose previous
  // row was dropped (it is pending now); a league left out of the run is otherwise not a failure.
  const failed = byLeague.reduce((n, l) => n + l.failed, 0);
  const lost = byLeague.reduce((n, l) => n + l.dropped.length, 0);
  const exitCode = runExitCode(byLeague, previous?.dropped ?? []);
  const c = rosters.counts;
  console.log(
    `\n${c.players} players on ${c.teams} teams · ${c.withGrade} with a grade · ` +
      `${c.withPosition} with a position · ${c.withJersey} with a number · ` +
      `${c.withHeight} with a height · ${c.captains} captains · ${failed} team(s) failed this run` +
      (lost ? ` · ${lost} team(s) outside it now pending: previous row dropped` : ""),
  );

  if (args.dryRun) {
    console.log("\ndry run: nothing written");
    return exitCode;
  }
  // Only a previous file that validates whole (and lost no row) can be left in place.
  const whole = previous?.whole;
  if (whole && rostersContentKey(whole) === rostersContentKey(validated.data)) {
    console.log(
      `\nno change since ${whole.fetchedAt}: ${path.relative(process.cwd(), args.out)} left as it was`,
    );
    return exitCode;
  }
  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, stableStringify(rosters), "utf8");
  console.log(`\nwrote ${path.relative(process.cwd(), args.out)}`);
  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(
      `FAILED: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  });

/**
 * The names and places the site prints in its own right, for the leak rules' excerpt check
 * (scripts/copy-rules.ts LeakOptions.publicTerms): every registry school's name, short name, aliases,
 * mascot and city; every club's and college's names, aliases, city and conference (a college's for
 * each of its programs); every rostered player's name; every player the 2025-26 archive names and
 * every award title it prints (/history/2025-26: the all-league documents are official); and the
 * names of the sports a commitment can be in, field hockey first. A run of a quote made of these alone ("St. Ignatius
 * College Preparatory" + "San Francisco") is something the pages say anyway, not a leak; what is left
 * once they are set aside (a teammate's or a coach's name, a watchlist's labels) is.
 *
 * Kept apart from copy-rules.ts, which stays pure (no data imports), and read by scripts/assert-copy.ts
 * and by the tests that run the leak rules over rendered pages.
 */

import { SPORT_WORDS } from '../components/commits/commit-view';
import { overallAwards } from '../components/history/history-view';
import { getClubs } from '../lib/clubs';
import { getColleges } from '../lib/commits';
import { getAvailableHistoryLeagues } from '../lib/history';
import { getAllEnrichedRosters } from '../lib/rosters';
import { TEAMS } from '../lib/teams';

const terms = new Set<string>(['Field Hockey', ...Object.values(SPORT_WORDS)]);
const add = (...values: Array<string | null | undefined>) => {
  for (const v of values) if (v) terms.add(v);
};

for (const t of TEAMS) add(t.name, t.shortName, t.mascot, t.city, ...t.aliases);
for (const c of getClubs()) add(c.name, c.shortName, c.city, ...c.aliases);
for (const c of getColleges()) add(c.name, c.shortName, c.city, ...c.programs.map((p) => p.conference));
for (const team of getAllEnrichedRosters()) for (const p of team.players) add(p.fullName, p.sourceName);
for (const { id, entry } of getAvailableHistoryLeagues()) {
  for (const d of entry.divisions) {
    for (const a of [d.awards.varsity, d.awards.jv]) {
      if (!a) continue;
      for (const p of [...a.firstTeam, ...a.secondTeam, ...a.honorableMention]) add(p.player);
      for (const o of overallAwards(id, a)) add(o.award, o.winner?.player);
    }
  }
}

/** Sorted (longest first) only so the list is the same on every run. */
export const PUBLIC_TERMS: readonly string[] = [...terms].sort((a, b) => b.length - a.length);

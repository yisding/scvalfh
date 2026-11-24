/**
 * Roster drift: what a hand-curated overlay says that the MaxPreps roster no longer supports.
 *
 * data/<sport>/rosters-enrichment.json, clubs.json and commits.json join to the roster rows by team slug and
 * MaxPreps athleteId, and jv-profiles.json to the team page's JV list by name; their loaders check every record
 * against the row it joins to. The rows are rewritten
 * by every roster refresh: a coach drops a player, re-enters the roster under new athleteIds, corrects a spelling,
 * or fills in a grade the overlay had filled. Each of those makes a record that was right when it was written wrong
 * now, through no edit of the overlay.
 *
 * Those loaders used to throw on such a record. A throw fails the refresh's tests, the refresh puts every roster
 * back as it was, and the whole week's roster changes are lost for one departed player (2026-11-23: one record
 * each in soccer and basketball held back every soccer and basketball roster change of the week). So a record the current roster
 * no longer supports is now left out of the build, or the one field of it MaxPreps now fills is, and the loader
 * records it here. Leaving it out never shows a wrong fact: the page shows what MaxPreps shows.
 *
 * What still throws is what no roster change can cause: a schema error, an unknown team, a file of another season.
 *
 * The drift is reported, not silently dropped: scripts/roster-drift.ts prints it, the refreshes turn it into
 * warnings on the run page, and CI fails a pull request whose own overlay edits drift (a mistyped athleteId would
 * otherwise just vanish from the site): drift on a player whose records in that file are as the base branch
 * has them is the refreshes' doing, any other is the pull request's.
 */

/** The overlay files a drift is in, as data/<sport>/<file>.json. */
export type DriftFile = 'rosters-enrichment' | 'clubs' | 'commits' | 'jv-profiles';

export interface RosterDrift {
  file: DriftFile;
  teamSlug: string;
  /** The player as the record names them, and for a club tie or a commitment the club or college: `Ann Lee (sf-hawks)`. */
  who: string;
  /** What the record joins on: the MaxPreps athleteId, or for jv-profiles the JV list's name (as `nameKey` folds it). */
  key: string;
  /** What the roster now says that the record does not agree with. */
  what: string;
  /** 'record': the whole record is left out. 'field': only the part named in `what` is. */
  leftOut: 'record' | 'field';
}

const drift: RosterDrift[] = [];

/** Records one drift. Called by the overlay loaders at module load. */
export function reportDrift(d: RosterDrift): void {
  drift.push(d);
}

/** Every drift the loaders imported so far recorded, in the order they found it. */
export function getRosterDrift(): readonly RosterDrift[] {
  return drift;
}

/** One line for a person: `clubs: mitty / Zuri Brandt (de-anza-force): athleteId … is not a MaxPreps row of this team (record left out)`. */
export function describeDrift(d: RosterDrift): string {
  const tail = d.leftOut === 'record' ? 'record left out' : 'that part left out';
  return `${d.file}: ${d.teamSlug} / ${d.who}: ${d.what} (${tail})`;
}

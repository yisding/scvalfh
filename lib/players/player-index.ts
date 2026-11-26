/**
 * The read API for data/<sport>/player-index.json (lib/players/player-index-schema.ts): which person each of
 * this season's roster rows is. Every module that shows something filed under a person (her recruiting pages,
 * her club ties, her college commitment) goes through here from a row to the person, or back.
 *
 * Imported so the build bundles it, for the reason lib/players/rosters.ts gives: a Worker has no project
 * filesystem. Validated once at module scope. `SCVAL_PLAYER_INDEX` swaps in another file through node:fs
 * (Node only), as `SCVAL_ROSTERS` does for the rosters.
 *
 * The file is rewritten by `pnpm build-players` with the registry. Until it is, a row a roster refresh has
 * just added is nobody here (nothing filed under a person shows on it), which is the worst a stale index
 * does: it never names the wrong person, because a MaxPreps row is looked up by its own athleteId and a
 * school list's row by its own name.
 */

import bundledFieldHockey from '../../data/field-hockey/player-index.json';
import bundledBasketball from '../../data/basketball/player-index.json';
import bundledVolleyball from '../../data/volleyball/player-index.json';
import bundledSoccer from '../../data/soccer/player-index.json';
import bundledValSoccer from '../../data/val-soccer/player-index.json';
import { readOverride, validateData } from '../data-file';
import { nameKey } from './name-compare';
import { maxPrepsCareerId, type JvResearch } from './accounts-schema';
import { PlayerIndexFileSchema, asRow, type PlayerIndexFile, type PlayerIndexRow } from './player-index-schema';
import type { CommitSport } from './commits-schema';
import type { PlayerProfile, ProfilePlatform } from './rosters-schema';
import { SPORT_ID } from '../sports/current';

export type { PlayerIndexRow } from './player-index-schema';

/** This build's copy (data/<sport>/: lib/sports/current.ts DATA_DIR). */
const bundled = process.env.SCVAL_SPORT === 'basketball' ? bundledBasketball : process.env.SCVAL_SPORT === 'volleyball' ? bundledVolleyball : process.env.SCVAL_SPORT === 'val-soccer' ? bundledValSoccer : process.env.SCVAL_SPORT === 'soccer' ? bundledSoccer : bundledFieldHockey;

const MODULE = 'lib/players/player-index.ts';

const file: PlayerIndexFile = validateData('player-index', PlayerIndexFileSchema, readOverride(MODULE, 'SCVAL_PLAYER_INDEX', bundled));
if (file.sport !== SPORT_ID) throw new Error(`player-index is ${file.sport}'s, this build is ${SPORT_ID}'s`);

const ROWS: readonly PlayerIndexRow[] = file.rows.map(asRow);
const BY_ATHLETE = new Map(ROWS.flatMap((r) => (r.athleteId === null ? [] : [[`${r.team} ${r.athleteId}`, r] as const])));
/** `<team> <level> <nameKey>` → the person, for every name a school list or a MaxPreps page gives at that level. */
const BY_NAME = (() => {
  const out = new Map<string, string | null>();
  for (const r of ROWS) {
    const k = `${r.team} ${r.level} ${nameKey(r.name)}`;
    const had = out.get(k);
    // A name two people answer to names neither.
    out.set(k, had === undefined || had === r.playerId ? r.playerId : null);
  }
  return out;
})();
const BY_PLAYER = new Map<string, PlayerIndexRow[]>();
for (const r of ROWS) BY_PLAYER.set(r.playerId, [...(BY_PLAYER.get(r.playerId) ?? []), r]);
for (const rows of BY_PLAYER.values()) rows.sort((a, b) => Number(a.athleteId === null) - Number(b.athleteId === null) || Number(a.level === 'jv') - Number(b.level === 'jv'));

const GONE = new Map(file.gone);
const HOMES = new Map(file.homes.map(([id, team, athleteId]) => [id, `${team} ${athleteId ?? ''}`]));

/**
 * Where a person goes on this season's rows: her varsity MaxPreps row, else her row of a school's own varsity list,
 * else her JV MaxPreps row (the index names it, for a person with several rows: the one under her official name);
 * null when she has none. A person MaxPreps lists twice has one home, and her club ties, commitment and recruiting
 * pages all show there (a MaxPreps career page on its own career's row: lib/players/rosters.ts).
 */
export function homeRow(playerId: string): PlayerIndexRow | null {
  const rows = rowsOfPerson(playerId);
  const chosen = HOMES.get(playerId);
  if (chosen !== undefined) {
    const home = rows.find((r) => `${r.team} ${r.athleteId ?? ''}` === chosen);
    if (home) return home;
  }
  return (
    rows.find((r) => r.athleteId !== null && r.level === 'varsity') ??
    rows.find((r) => r.athleteId === null && r.level === 'varsity') ??
    rows.find((r) => r.athleteId !== null && r.level === 'jv') ??
    null
  );
}

/** The team a person had a row on this season that no source lists any more, when she has no row now; else null. */
export function goneFrom(playerId: string): string | null {
  return GONE.get(playerId) ?? null;
}

/** The season the index's rows are of; null for a sport that lists no players. */
export function getPlayerIndexSeason(): string | null {
  return file.season;
}

/**
 * Throws unless the index is of `season` (the rosters'): a new season's rows with last season's index would
 * be nobody, which a rebuild fixes. A sport that lists no players has no index to check.
 */
export function assertPlayerIndexSeason(season: string): void {
  if (file.season !== null && file.season !== season) {
    throw new Error(`player-index.json is for season ${file.season}, the rosters for ${season}: run pnpm build-players`);
  }
}

/** The person a MaxPreps roster row (varsity or JV page) is, by its team and athleteId. */
export function personOfRow(team: string, athleteId: string | null): string | null {
  return athleteId === null ? null : (BY_ATHLETE.get(`${team} ${athleteId}`)?.playerId ?? null);
}

/** The person a name on the team's `level` lists is (a school's list, or a MaxPreps page's spelling), when one person is. */
export function personOfName(team: string, level: 'varsity' | 'jv', name: string): string | null {
  return BY_NAME.get(`${team} ${level} ${nameKey(name)}`) ?? null;
}

/** A person's rows this season in this sport: MaxPreps rows first, varsity before JV. */
export function rowsOfPerson(playerId: string): readonly PlayerIndexRow[] {
  return BY_PLAYER.get(playerId) ?? [];
}

/**
 * A person's recruiting pages (data/player-accounts.json) as this build links them (lib/players/rosters-schema.ts
 * PlayerProfile): a page that shows her in this build's sport names no sport, any other names the first it shows
 * her in. In the file's order; [] for most people. The checks against a row (class year, MaxPreps career) are the
 * caller's: lib/players/rosters.ts and lib/jv/jv-profiles.ts.
 */
export function accountsOfPerson(playerId: string | null): PlayerProfile[] {
  if (playerId === null) return [];
  return (file.accounts[playerId] ?? []).map(([platform, url, sports, classOf]) => {
    const sport = sports === null || sports.includes(SPORT_ID) ? undefined : (sports[0] as CommitSport);
    return { platform: platform as ProfilePlatform, url, classOf, note: null, ...(sport ? { sport } : {}) };
  });
}

/** Whether a MaxPreps career page is the page of the career `careerId` (its URL's `careerid`). */
export function isCareerPage(url: string, careerId: string | null): boolean {
  return careerId !== null && maxPrepsCareerId(url) === careerId;
}

/** Every recruiting page of this build's people, as this build links them (accountsOfPerson). */
export function everyAccount(): PlayerProfile[] {
  return Object.keys(file.accounts).flatMap((id) => accountsOfPerson(id));
}

/** Every recruiting page this build's rows can show, counted once a person: what a researched-or-not check reads. */
export function accountCount(): number {
  return Object.values(file.accounts).reduce((n, a) => n + a.length, 0);
}

/** This sport's JV round of looking for recruiting pages, as it recorded itself; null when there was none. */
export function getJvResearch(): JvResearch | null {
  return file.jvResearch;
}

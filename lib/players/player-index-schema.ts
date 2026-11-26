/**
 * The Zod contract for data/<sport>/player-index.json: which person (data/players.json `id`) each of this
 * season's high school roster rows is, for one sport. Written by `pnpm build-players` from the registry it
 * has just built, never by hand.
 *
 * Why it exists. What the repository knows about a PERSON (her recruiting pages, her club ties, her college
 * commitment: data/player-accounts.json, data/<sport>/clubs.json, data/commitments.json) is filed under her
 * registry id, which never changes. What a page shows is a ROSTER ROW, which MaxPreps names by a per-season
 * athlete id (or, on a school's own list, by a name). The registry knows both, but it is internal and never
 * bundled, so this file carries the one part of it a page needs: row → person, for the rows a team page of
 * this season shows. A roster refresh or a new season changes the rows; `pnpm build-players` (which every
 * refresh with a roster change runs) rewrites this file to match, and nothing filed under a person moves.
 *
 * A row is one of:
 *   a MaxPreps row   `athleteId` set: a row of the team's varsity roster page (data/<sport>/rosters.json) or
 *                    of its JV roster page (jv-rosters.json). `level` is the squad the registry files it
 *                    under (the overlay's `level` moves a varsity-page row to JV, as Los Gatos' are)
 *   a school's list  `athleteId` null: a name on the school's own varsity list (rosters-enrichment.json
 *                    otherRosters `listed`, `level` varsity) or JV list (jv-rosters-school-sites.json, `level` jv)
 * `name` is the row's name as that source spells it, or the stint's when the source gives none (MaxPreps'
 * "Player #4" stand-in the overlay names). The file names only rows of players the registry files under
 * this sport's current season, and of those only the people something is filed under (a recruiting page, a club
 * tie in this sport, a commitment): the rest would only weigh down the bundle. A sport that lists no players (the
 * VAL's middle schools) has none.
 *
 * It also carries what the pages show of those people's recruiting pages (`accounts`: platform, URL, sports
 * and class year, from data/player-accounts.json, whose maintainers' notes stay there) and this sport's JV
 * round of looking for them (`jvResearch`), so a build bundles its own sport's share and never the whole
 * cross-sport file.
 *
 * Invariants (checked here):
 *   1. a MaxPreps row (team, athleteId) is listed once
 *   2. a school list's name (team, level, nameKey) is one person's: a name two people share there is left
 *      out by the builder, as no page could tell which of them it is
 *   3. the rows are in one fixed order (team, level, athleteId, name), so a rebuild writes the same bytes
 */

import { z } from 'zod';

import { JvResearchSchema, type AccountsFile } from './accounts-schema';
import { nameKey } from './name-compare';
import type { PlayersFile } from './registry-schema';
import { httpsUrl, playerId } from '../schema-primitives';
import { SPORT_IDS, type SportId } from '../sports/current';

const text = z.string().min(1);
const seasonYearPattern = z.string().regex(/^\d{2}-\d{2}$/, 'expected a season year like 26-27');

/** One row: [playerId, team, level, athleteId | null, name]. A tuple, so a sport's file stays small in the bundle. */
export const PlayerIndexRowSchema = z.tuple([playerId, text, z.enum(['varsity', 'jv']), text.nullable(), text]);
export type PlayerIndexTuple = z.infer<typeof PlayerIndexRowSchema>;

export interface PlayerIndexRow {
  playerId: string;
  team: string;
  level: 'varsity' | 'jv';
  athleteId: string | null;
  name: string;
}

export const asRow = ([id, team, level, athleteId, name]: PlayerIndexTuple): PlayerIndexRow => ({ playerId: id, team, level, athleteId, name });

const rowOrder = (r: PlayerIndexRow) => [r.team, r.level === 'varsity' ? '0' : '1', r.athleteId ?? '', nameKey(r.name), r.name, r.playerId].join('\u0001');

/** One account as a page shows it: [platform, url, sports (null: every sport, a MaxPreps page), classOf]. */
export const IndexAccountSchema = z.tuple([z.string().min(1), httpsUrl, z.array(text).min(1).nullable(), z.number().int().nullable()]);
export type IndexAccountTuple = z.infer<typeof IndexAccountSchema>;

export const PlayerIndexFileSchema = z
  .object({
    builtBy: text,
    sport: z.enum(SPORT_IDS),
    /** The season the rows are of ("26-27"); null for a sport that lists no players. */
    season: seasonYearPattern.nullable(),
    notes: z.array(text),
    columns: z.tuple([z.literal('playerId'), z.literal('team'), z.literal('level'), z.literal('athleteId'), z.literal('name')]),
    rows: z.array(PlayerIndexRowSchema),
    /** This sport's JV round of looking for recruiting pages (data/player-accounts.json jvResearch), or null. */
    jvResearch: JvResearchSchema.nullable(),
    accountColumns: z.tuple([z.literal('platform'), z.literal('url'), z.literal('sports'), z.literal('classOf')]),
    /** The recruiting pages of the people in `rows`, by person, in data/player-accounts.json's order. */
    accounts: z.record(playerId, z.array(IndexAccountSchema).min(1)),
    /**
     * [playerId, team]: a person something is filed under whose every row of this season in this sport no source
     * lists any more (a stint the registry marks `gone`: a coach dropped her row), on the team of that row. Her club
     * ties and commitment are roster drift here (lib/players/clubs.ts, commits.ts): reported, not silently dropped.
     */
    gone: z.array(z.tuple([playerId, text])),
    /**
     * [playerId, team, athleteId]: the home row of a person with more than one row (a player MaxPreps lists twice, a
     * school list beside MaxPreps' JV page): her varsity MaxPreps row, else her school varsity list row, else her JV
     * MaxPreps row, and among those the one under her official name (as she spells it, then as it folds), preferring
     * one that gives a number (MaxPreps' copy of a row has none). Her pages, club ties and commitment show there.
     */
    homes: z.array(z.tuple([playerId, text, text.nullable()])),
  })
  .strict()
  .superRefine((f, ctx) => {
    const rows = f.rows.map(asRow);
    const athletes = new Set<string>();
    const names = new Set<string>();
    rows.forEach((r, i) => {
      if (r.athleteId !== null) {
        const k = `${r.team} ${r.athleteId}`;
        if (athletes.has(k)) ctx.addIssue({ code: 'custom', path: ['rows', i], message: `MaxPreps row ${k} is listed twice` });
        athletes.add(k);
      } else {
        const k = `${r.team} ${r.level} ${nameKey(r.name)}`;
        if (names.has(k)) ctx.addIssue({ code: 'custom', path: ['rows', i], message: `the name ${r.name} on ${r.team}'s ${r.level} list is listed twice` });
        names.add(k);
      }
      if (i > 0 && rowOrder(rows[i - 1]) > rowOrder(r)) ctx.addIssue({ code: 'custom', path: ['rows', i], message: 'rows are out of order' });
    });
    const people = new Set(rows.map((r) => r.playerId));
    for (const [id] of f.gone) if (people.has(id)) ctx.addIssue({ code: 'custom', path: ['gone'], message: `${id} has a row and is gone` });
    for (const id of Object.keys(f.accounts)) {
      if (!people.has(id)) ctx.addIssue({ code: 'custom', path: ['accounts', id], message: `${id} has accounts but no row` });
    }
  });
export type PlayerIndexFile = z.infer<typeof PlayerIndexFileSchema>;

export const PLAYER_INDEX_NOTES = [
  'Which person (data/players.json id) each of this season\'s roster rows is, for this sport: a MaxPreps row by its athleteId, a school\'s own varsity or JV list by its name (athleteId null), for the people something is filed under (a recruiting page, a club tie, a commitment). Written by pnpm build-players from the registry; never edited by hand.',
  'What is known about a person (recruiting pages, club ties, a college commitment) is filed under her id; a page finds it for a row through this file. A roster refresh or a new season rewrites the rows, and nothing filed under a person moves.',
];

const MAXPREPS_PAGES = new Set(['maxpreps-roster', 'maxpreps-jv-roster']);
const SCHOOL_LISTS = new Set(['school-roster', 'school-jv-roster']);

/** The season a sport's registry stints are current in: the latest it holds. */
export function currentSeason(file: PlayersFile, sport: SportId): string | null {
  const seasons = file.built.filter((b) => b.sport === sport).map((b) => b.season).sort();
  return seasons.at(-1) ?? null;
}

/**
 * The index for one sport, from a registry: every MaxPreps roster row and school-list name of the sport's
 * current season, with the person it was filed under. A stint no source lists any more (`gone`) is not a row.
 */
export function buildPlayerIndex(
  file: PlayersFile,
  sport: SportId,
  builtBy: string,
  accounts: AccountsFile | null = null,
  /** The people something is filed under; every row's person when null. */
  filed: ReadonlySet<string> | null = null,
): PlayerIndexFile {
  const season = currentSeason(file, sport);
  const rows: PlayerIndexRow[] = [];
  /** `<team> <athleteId>` of the MaxPreps rows that give a number: the real row of a player MaxPreps lists twice. */
  const numbered = new Set<string>();
  /** person → the team of a stint of this season no source lists any more. */
  const goneAt = new Map<string, string>();
  if (season !== null) {
    for (const p of file.players) {
      for (const s of p.stints) {
        if (s.sport !== sport || s.season !== season || s.level === 'freshman') continue;
        if (s.gone) {
          if (!goneAt.has(p.id)) goneAt.set(p.id, s.team);
          continue;
        }
        for (const o of s.observations) {
          if (MAXPREPS_PAGES.has(o.src) && o.athleteId && o.jersey != null && o.jersey !== '') numbered.add(`${s.team} ${o.athleteId}`);
          if (MAXPREPS_PAGES.has(o.src) && o.athleteId) rows.push({ playerId: p.id, team: s.team, level: s.level, athleteId: o.athleteId, name: o.name ?? s.name });
          else if (SCHOOL_LISTS.has(o.src) && o.name) rows.push({ playerId: p.id, team: s.team, level: s.level, athleteId: null, name: o.name });
        }
      }
    }
  }
  // One row per MaxPreps row (a row read twice, as its own page and as a stat line, is one), and a school-list
  // name only while one person answers to it.
  const byAthlete = new Map<string, PlayerIndexRow>();
  const byName = new Map<string, PlayerIndexRow[]>();
  for (const r of rows) {
    if (r.athleteId !== null) byAthlete.set(`${r.team} ${r.athleteId}`, byAthlete.get(`${r.team} ${r.athleteId}`) ?? r);
    else {
      const k = `${r.team} ${r.level} ${nameKey(r.name)}`;
      byName.set(k, [...(byName.get(k) ?? []), r]);
    }
  }
  const named = [...byName.values()].flatMap((rs) => (new Set(rs.map((r) => r.playerId)).size === 1 ? [rs[0]] : []));
  // Only now the people something is filed under: a name two people share is left out above whoever of them has a record.
  const out = [...byAthlete.values(), ...named]
    .filter((r) => filed === null || filed.has(r.playerId))
    .sort((a, b) => (rowOrder(a) < rowOrder(b) ? -1 : rowOrder(a) > rowOrder(b) ? 1 : 0));
  const people = new Set(out.map((r) => r.playerId));
  const withRows = new Set(rows.map((r) => r.playerId));
  const officialName = new Map(file.players.map((p) => [p.id, p.name]));
  const rank = (r: PlayerIndexRow) => (r.athleteId !== null && r.level === 'varsity' ? 0 : r.athleteId === null && r.level === 'varsity' ? 1 : r.athleteId !== null ? 2 : 3);
  const byPerson = new Map<string, PlayerIndexRow[]>();
  for (const r of out) byPerson.set(r.playerId, [...(byPerson.get(r.playerId) ?? []), r]);
  const homes = [...byPerson]
    .filter(([, rs]) => rs.length > 1)
    .map(([id, rs]) => {
      const best = Math.min(...rs.map(rank));
      const top = rs.filter((r) => rank(r) === best);
      // Her official name as she spells it, then as it folds; at each, a row with a number first (MaxPreps' copy of a
      // row has none), then a row with a number under another name, then the first.
      const official = officialName.get(id) ?? '';
      const hasNumber = (r: (typeof top)[number]) => numbered.has(`${r.team} ${r.athleteId}`);
      const byName = [(r: (typeof top)[number]) => r.name === official, (r: (typeof top)[number]) => nameKey(r.name) === nameKey(official)];
      const home =
        byName.flatMap((named) => [top.find((r) => named(r) && hasNumber(r)), top.find(named)]).find((r) => r !== undefined) ??
        top.find(hasNumber) ??
        top[0];
      return [id, home.team, home.athleteId] as [string, string, string | null];
    })
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const gone = [...goneAt]
    .filter(([id]) => !withRows.has(id) && (filed === null || filed.has(id)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    builtBy,
    sport,
    season,
    notes: PLAYER_INDEX_NOTES,
    columns: ['playerId', 'team', 'level', 'athleteId', 'name'],
    rows: out.map((r) => [r.playerId, r.team, r.level, r.athleteId, r.name]),
    jvResearch: accounts?.jvResearch[sport] ?? null,
    accountColumns: ['platform', 'url', 'sports', 'classOf'],
    accounts: Object.fromEntries(
      (accounts?.players ?? [])
        .filter((p) => people.has(p.playerId))
        .map((p) => [p.playerId, p.accounts.map((a): IndexAccountTuple => [a.platform, a.url, a.sports ? [...a.sports] : null, a.classOf])]),
    ),
    gone,
    homes,
  };
}

/** The file as it is committed: the header as JSON.stringify writes it, then one row, and one person's accounts, per line. */
export function formatPlayerIndex(f: PlayerIndexFile): string {
  const { rows, accounts, gone, homes, ...head } = f;
  const top = JSON.stringify(head, null, 2).replace(/\n}$/, '');
  const list = rows.map((r) => `    ${JSON.stringify(r)}`).join(',\n');
  const people = Object.entries(accounts).map(([id, a]) => `    ${JSON.stringify(id)}: ${JSON.stringify(a)}`).join(',\n');
  const left = gone.map((g) => `    ${JSON.stringify(g)}`).join(',\n');
  const home = homes.map((h) => `    ${JSON.stringify(h)}`).join(',\n');
  return `${top},\n  "rows": [${rows.length ? `\n${list}\n  ` : ''}],\n  "accounts": {${people ? `\n${people}\n  ` : ''}},\n  "gone": [${left ? `\n${left}\n  ` : ''}],\n  "homes": [${home ? `\n${home}\n  ` : ''}]\n}\n`;
}

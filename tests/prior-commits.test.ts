/**
 * data/soccer/prior-commits.json and data/basketball/prior-commits.json: last season's sophomores and
 * juniors who a public page says committed to a college team. Each committed file validates
 * (lib/players/prior-commits-schema.ts) and joins to the player registry; a bad file, built in memory,
 * is refused with a message that names what is wrong. The files are the 2026-11-18 research record: the
 * commitments of its players on a 2026-27 roster were copied into data/soccer/commits.json on 2026-11-21, and the
 * pages read that file.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO as ROOT } from './helpers';
import { BANNED_HOSTS } from '../lib/players/clubs-schema';
import {
  PRIOR_COMMIT_FILE_SPORTS,
  PriorCommitsFileSchema,
  joinPriorCommits,
  nextSeasonYear,
  priorClassOf,
  type PriorCommitsFile,
} from '../lib/players/prior-commits-schema';
import { PLAYERS_FILE, sportDataDir } from '../lib/players/registry-file';
import type { PlayersFile } from '../lib/players/registry-schema';

const readJson = (rel: string): unknown => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
// Read as plain JSON: tests/players-registry.test.ts validates the registry, and a second Zod parse of
// it in a parallel worker costs memory the suite does not need to spend.
const registry = readJson(PLAYERS_FILE) as PlayersFile;

/** Each tracked team's MaxPreps team page for the current season: rosters.json's `rosterUrl` without `roster/`. */
function teamPages(sport: string): Map<string, string> {
  const rosters = readJson(`data/${sport}/rosters.json`) as { teams: Array<{ slug: string; rosterUrl: string | null }> };
  return new Map(rosters.teams.flatMap((t) => (t.rosterUrl ? [[t.slug, t.rosterUrl.replace(/roster\/$/, '')] as [string, string]] : [])));
}

describe('prior-commits files', () => {
  for (const sport of PRIOR_COMMIT_FILE_SPORTS) {
    const rel = `${sportDataDir(sport)}/prior-commits.json`;
    const raw = readJson(rel);
    const prior = readJson(`${sportDataDir(sport)}/prior-players.json`) as { season: string };

    it(`${rel} validates, is ${sport}'s and is last season's`, () => {
      const file = PriorCommitsFileSchema.parse(raw);
      expect(file.sport).toBe(sport);
      expect(file.season).toBe(prior.season);
    });

    it(`${rel} joins to the registry under current ids`, () => {
      const file = PriorCommitsFileSchema.parse(raw);
      const joined = joinPriorCommits(file, registry, teamPages(sport));
      expect(joined.size).toBe(file.commitments.filter((c) => c.playerId !== null).length);
      // A merge in the registry retires an id: re-stamp the file rather than lean on formerIds.
      for (const [id, current] of joined) expect(current, `${rel}: ${id} is a former id`).toBe(id);
    });

    it(`${rel} cites no social media but official accounts' posts`, () => {
      const file = PriorCommitsFileSchema.parse(raw);
      for (const c of file.commitments) {
        for (const s of c.sources) {
          const host = new URL(s.url).hostname.replace(/^www\./, '');
          if (s.kind !== 'official-social') expect(BANNED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)), s.url).toBe(false);
        }
      }
    });
  }
});

// ---------------------------------------------------------------- bad files, in memory

/** A 2025-26 basketball junior the registry knows, with a career id: the base of the bad files. */
function pickJunior(): { player: PlayersFile['players'][number]; team: string; season: string } {
  for (const p of registry.players) {
    const s = p.stints.find((x) => x.sport === 'basketball' && x.season === '25-26' && x.level === 'varsity' && x.grade === 11);
    if (s && p.identifiers.some((i) => i.kind === 'maxpreps-career') && (p.classOf === null || p.classOf === 2027)) {
      return { player: p, team: s.team, season: s.season };
    }
  }
  throw new Error('no 2025-26 basketball junior in the registry');
}

function goodFile(): PriorCommitsFile {
  const { player, team, season } = pickJunior();
  const career = player.identifiers.find((i) => i.kind === 'maxpreps-career') as { careerId: string };
  return {
    builtBy: 'test',
    capturedAt: '2026-11-18',
    season,
    sport: 'basketball',
    notes: [],
    colleges: [
      {
        slug: 'de-anza',
        name: 'De Anza College',
        shortName: 'De Anza',
        city: 'Cupertino',
        state: 'CA',
        programs: [{ sport: 'basketball', division: 'cccaa', conference: 'Coast Conference', url: 'https://example.edu/mbb' }],
        sources: [{ url: 'https://example.edu/mbb', what: 'test' }],
        checkedOn: '2026-11-18',
      },
    ],
    commitments: [
      {
        teamSlug: team,
        playerId: player.id,
        careerId: career.careerId,
        seasonRoster: null,
        fullName: player.name,
        grade: 11,
        college: 'de-anza',
        sport: 'basketball',
        status: 'signed',
        asOf: '2026-10',
        confidence: 'high',
        sources: [
          {
            url: 'https://example.edu/mbb/roster',
            kind: 'college',
            quote: `${player.name} Guard Fr. Hometown / High School`,
            statedSchool: null,
            statedClassYear: null,
            sourceDate: null,
          },
        ],
        basis: 'test',
      },
    ],
  };
}

const BASKETBALL_PAGES = teamPages('basketball');
const join = (f: PriorCommitsFile, reg: PlayersFile = registry) => joinPriorCommits(PriorCommitsFileSchema.parse(f), reg, BASKETBALL_PAGES);
/** A team's own 2025-26 roster page, as a `seasonRoster` must be. */
const seasonRoster = (team: string) => `${BASKETBALL_PAGES.get(team)!}25-26/roster/`;


describe('prior-commits checks', () => {
  it('a good file joins, a two-year college included', () => {
    expect(join(goodFile()).size).toBe(1);
  });

  it('works out the next season and the class', () => {
    expect(nextSeasonYear('25-26')).toBe('26-27');
    expect(nextSeasonYear('99-00')).toBe('00-01');
    expect(priorClassOf('25-26', 12)).toBe(2026);
    expect(priorClassOf('25-26', 11)).toBe(2027);
    expect(priorClassOf('25-26', 10)).toBe(2028);
  });

  it('refuses a player the registry does not know', () => {
    const f = goodFile();
    f.commitments[0].playerId = 'p0000000000';
    expect(() => join(f)).toThrow(/is not a player in the registry/);
  });

  it('refuses a grade the registry disagrees with', () => {
    const f = goodFile();
    f.commitments[0].grade = 10;
    expect(() => join(f)).toThrow(/grade|class of/);
  });

  it('refuses a stated class year that is not the grade\'s', () => {
    const f = goodFile();
    f.commitments[0].sources[0].statedClassYear = 2028;
    expect(() => join(f)).toThrow(/says class of 2028/);
  });

  it('refuses another team, another name and another career id', () => {
    const a = goodFile();
    a.commitments[0].teamSlug = a.commitments[0].teamSlug === 'gunn' ? 'palo-alto' : 'gunn';
    expect(() => join(a)).toThrow(/no basketball varsity stint/);
    const untracked = goodFile();
    untracked.commitments[0].teamSlug = 'no-such-school';
    expect(() => join(untracked)).toThrow(/is not a tracked basketball team/);
    const b = goodFile();
    b.commitments[0].fullName = 'Somebody Else';
    expect(() => join(b)).toThrow(/knows this player as/);
    const c = goodFile();
    c.commitments[0].careerId = 'zzzzzzzzzzzzz';
    expect(() => join(c)).toThrow(/is not this player's/);
  });

  it('takes a player the registry does not know only by career id and the season\'s roster page', () => {
    const f = goodFile();
    const team = f.commitments[0].teamSlug;
    const other = [...BASKETBALL_PAGES.keys()].find((t) => t !== team)!;
    Object.assign(f.commitments[0], { playerId: null, careerId: 'zzzzzzzzzzzzz', seasonRoster: seasonRoster(team) });
    expect(join(f).size).toBe(0);
    const known = goodFile();
    Object.assign(known.commitments[0], { playerId: null, seasonRoster: seasonRoster(team) });
    expect(() => join(known)).toThrow(/name the player by playerId/);
    const otherTeam = goodFile();
    Object.assign(otherTeam.commitments[0], { playerId: null, careerId: 'zzzzzzzzzzzzz', seasonRoster: seasonRoster(other) });
    expect(() => join(otherTeam)).toThrow(/is not .*'s 25-26 roster page/);
    const page = goodFile();
    Object.assign(page.commitments[0], { playerId: null, careerId: 'zzzzzzzzzzzzz', seasonRoster: `${BASKETBALL_PAGES.get(team)!}roster/` });
    expect(() => join(page)).toThrow(/is not .*'s 25-26 roster page/);
    const bare = goodFile();
    Object.assign(bare.commitments[0], { playerId: null, careerId: 'zzzzzzzzzzzzz' });
    expect(PriorCommitsFileSchema.safeParse(bare).success).toBe(false);
    const both = goodFile();
    both.commitments[0].seasonRoster = seasonRoster(team);
    expect(PriorCommitsFileSchema.safeParse(both).success).toBe(false);
  });

  it('refuses one player twice: under a former id and the current one, or one career at two teams', () => {
    const f = goodFile();
    const id = f.commitments[0].playerId!;
    const reg: PlayersFile = {
      ...registry,
      players: registry.players.map((p) => (p.id === id ? { ...p, formerIds: [...p.formerIds, 'p00000000ff'] } : p)),
    };
    f.commitments.push({ ...f.commitments[0], playerId: 'p00000000ff' });
    expect(() => join(f, reg)).toThrow(/a second commitment for registry player/);
    const g = goodFile();
    const [team, other] = [g.commitments[0].teamSlug, [...BASKETBALL_PAGES.keys()].find((t) => t !== g.commitments[0].teamSlug)!];
    const unknown = { ...g.commitments[0], playerId: null, careerId: 'zzzzzzzzzzzzz' };
    g.commitments = [
      { ...unknown, seasonRoster: seasonRoster(team) },
      { ...unknown, teamSlug: other, seasonRoster: seasonRoster(other) },
    ];
    expect(PriorCommitsFileSchema.safeParse(g).success).toBe(false);
  });

  it('refuses a season that is not two consecutive years', () => {
    expect(PriorCommitsFileSchema.safeParse({ ...goodFile(), season: '25-27' }).success).toBe(false);
    expect(PriorCommitsFileSchema.safeParse({ ...goodFile(), season: '99-00' }).success).toBe(true);
  });

  it('refuses a second commitment for one player, a college nobody committed to and a date after the research', () => {
    const f = goodFile();
    f.commitments.push({ ...f.commitments[0] });
    expect(PriorCommitsFileSchema.safeParse(f).success).toBe(false);
    const g = goodFile();
    g.colleges.push({ ...g.colleges[0], slug: 'foothill' });
    expect(PriorCommitsFileSchema.safeParse(g).success).toBe(false);
    const h = goodFile();
    h.commitments[0].asOf = '2026-12';
    expect(PriorCommitsFileSchema.safeParse(h).success).toBe(false);
  });

  it('refuses a player\'s own social-media post', () => {
    const f = goodFile();
    f.commitments[0].sources[0].url = 'https://www.instagram.com/someplayer/p/abc/';
    expect(PriorCommitsFileSchema.safeParse(f).success).toBe(false);
  });
});

/**
 * data/commits.json (SPEC §1.1j3, DESIGN §21): the committed file validates and holds every
 * load-time invariant; lib/commits.ts serves it in display order (DESIGN §21.1); and a bad file —
 * built in memory, never written to disk — is refused at load with a message that names what is
 * wrong (the path, or the team, player and college).
 *
 * The file is research, not a script's output. The cases below that need a commitment build one
 * from real roster rows, so they hold whatever the committed file holds; the counts pinned against
 * the file change only with a new sweep (update them with README "College commitments" and
 * DATA-SOURCES §1.1j3).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BANNED_HOSTS } from '../lib/clubs-schema';
import {
  COLLEGE_DIVISIONS,
  COMMIT_SPORTS,
  CommitsFileSchema,
  isCommitDate,
  type College,
  type Commitment,
  type CommitsFile,
} from '../lib/commits-schema';
import {
  collegeDisplayName,
  commitClassOf,
  commitProgram,
  getCollege,
  getCollegeCommitments,
  getColleges,
  getCommitments,
  getCommitsFile,
  getCommitsLastChecked,
  getCommittedPlayer,
  getPlayerCommitment,
  getTeamCommitments,
  loadCommits,
} from '../lib/commits';
import { classOf, getAllEnrichedRosters, getRosters, type MergedPlayer } from '../lib/rosters';
import { getTeamBySlug } from '../lib/teams';
import { REPO } from './helpers';

const raw = JSON.parse(readFileSync(path.join(REPO, 'data', 'commits.json'), 'utf8')) as CommitsFile;
const teams = getAllEnrichedRosters();
const season = getRosters().season;

/** The first varsity row (by roster order) that has an athleteId and matches `pick`. */
function findRow(pick: (p: MergedPlayer) => boolean): { teamSlug: string; row: MergedPlayer } {
  for (const t of teams) {
    const row = t.players.find((p) => p.athleteId !== null && p.level !== 'jv' && pick(p));
    if (row) return { teamSlug: t.slug, row };
  }
  throw new Error('no roster row matches');
}

const senior = findRow((p) => p.grade === 12);
const junior = findRow((p) => p.grade === 11 && p.athleteId !== senior.row.athleteId);
const noGrade = findRow((p) => p.grade === null);

const COLLEGE: College = {
  slug: 'example-college',
  name: 'Example College',
  shortName: 'Example',
  city: 'Somewhere',
  state: 'PA',
  programs: [
    { sport: 'field-hockey', division: 'ncaa-d1', conference: 'Example Conference', url: 'https://example.edu/sports/field-hockey' },
  ],
  sources: [{ url: 'https://example.edu/sports/field-hockey', what: 'Field hockey home page' }],
  checkedOn: '2026-10-03',
};

function commitmentFor(r: { teamSlug: string; row: MergedPlayer }, over: Partial<Commitment> = {}): Commitment {
  return {
    teamSlug: r.teamSlug,
    athleteId: r.row.athleteId!,
    fullName: r.row.fullName,
    college: COLLEGE.slug,
    sport: 'field-hockey',
    status: 'committed',
    asOf: '2026-06',
    confidence: 'high',
    sources: [
      {
        url: 'https://nfhca.sportsrecruits.com/athlete/example_player',
        kind: 'sportsrecruits',
        quote: 'Committed to Example College',
        statedSchool: getTeamBySlug(r.teamSlug)!.name,
        statedClassYear: r.row.grade === null ? null : classOf(season, r.row.grade),
        sourceDate: null,
      },
    ],
    basis: 'A test commitment.',
    ...over,
  };
}

/** A valid file with one commitment per given row, all to COLLEGE. */
function fileWith(commitments: Commitment[], colleges: College[] = [COLLEGE]): CommitsFile {
  return { builtBy: 'test', capturedAt: '2026-10-03', season, notes: ['test'], colleges, commitments };
}

/** What the schema says about `f`, as `path: message` lines; [] when it passes. */
function schemaIssues(f: unknown): string[] {
  const r = CommitsFileSchema.safeParse(f);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

const load = (f: unknown) => () => loadCommits(f, teams, season);

describe('the committed data/commits.json', () => {
  it('validates and loads against the rosters', () => {
    expect(schemaIssues(raw)).toEqual([]);
    // Zod strips unknown keys, so equality proves the contract covers every key the file has.
    expect(loadCommits(raw, teams, season)).toEqual(raw);
    expect(getCommitsFile()).toEqual(raw);
    expect(raw.season).toBe(season);
  });

  it('cites only https pages, none of them social media', () => {
    const urls = [
      ...raw.colleges.flatMap((c) => [...c.programs.map((p) => p.url), ...c.sources.map((s) => s.url)]),
      ...raw.commitments.flatMap((c) => c.sources.map((s) => s.url)),
    ].filter((u): u is string => u !== null);
    for (const url of urls) {
      expect(new URL(url).protocol, url).toBe('https:');
      const host = new URL(url).hostname;
      expect(BANNED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)), url).toBe(false);
    }
  });

  it('names every player by the roster row it joins, never a JV row, and one commitment each', () => {
    const seen = new Set<string>();
    for (const c of raw.commitments) {
      const row = getCommittedPlayer(c);
      expect(row.fullName).toBe(c.fullName);
      expect(row.level).not.toBe('jv');
      const key = `${c.teamSlug} ${c.athleteId}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it('agrees with the roster on every stated class year', () => {
    for (const c of raw.commitments) {
      const cls = commitClassOf(c);
      for (const s of c.sources) if (s.statedClassYear !== null) expect(s.statedClassYear, c.fullName).toBe(cls);
    }
  });

  it('holds only colleges and programs somebody committed to, each program with its level', () => {
    for (const college of raw.colleges) {
      expect(getCollegeCommitments(college.slug).length, college.slug).toBeGreaterThan(0);
      for (const p of college.programs) {
        expect(COLLEGE_DIVISIONS).toContain(p.division);
        expect(raw.commitments.some((c) => c.college === college.slug && c.sport === p.sport), `${college.slug} ${p.sport}`).toBe(true);
      }
    }
  });

  it('serves each commitment’s program: its college’s team in its sport', () => {
    for (const c of raw.commitments) {
      const { college, program } = commitProgram(c);
      expect(college.slug).toBe(c.college);
      expect(program.sport).toBe(c.sport);
    }
  });
});

describe('the research of 2026-10-03 and 2026-10-04 (with the 2026-10-04 EAL sweep, no row), as counted in README "College commitments" and DATA-SOURCES §1.1j3', () => {
  // Pinned: change these only with a new sweep, together with those two documents.
  it('holds 16 commitments from 9 schools to 14 colleges (15 programs), all "committed", 15 high and 1 medium', () => {
    expect(raw.capturedAt).toBe('2026-10-04');
    expect(raw.commitments).toHaveLength(16);
    expect(raw.colleges).toHaveLength(14);
    expect(raw.colleges.flatMap((c) => c.programs)).toHaveLength(15);
    expect(new Set(raw.commitments.map((c) => c.teamSlug))).toEqual(
      new Set(['berkeley', 'christopher', 'los-altos', 'marin-catholic', 'redwood', 'saint-francis', 'saratoga', 'st-ignatius', 'stevenson']),
    );
    expect(raw.commitments.every((c) => c.status === 'committed')).toBe(true);
    expect(raw.commitments.filter((c) => c.confidence === 'medium').map((c) => c.fullName)).toEqual(['Ryan Hemeon']);
  });

  it('by sport: 7 field hockey, 7 lacrosse, 1 soccer, 1 basketball', () => {
    const sport = (s: string) => raw.commitments.filter((c) => c.sport === s).length;
    expect([sport('field-hockey'), sport('lacrosse'), sport('soccer'), sport('basketball')]).toEqual([7, 7, 1, 1]);
    // One college holds two programs: UC Davis, field hockey (MPSF) and lacrosse (Big 12).
    expect(getCollege('uc-davis')!.programs.map((p) => [p.sport, p.conference])).toEqual([
      ['field-hockey', 'MPSF'],
      ['lacrosse', 'Big 12'],
    ]);
  });

  it('by class: 13 from 2027 and 3 from 2028; by level: 9 Division I, 1 Division II, 6 Division III', () => {
    const classes = getCommitments().map((c) => commitClassOf(c));
    expect(classes.filter((y) => y === 2027)).toHaveLength(13);
    expect(classes.filter((y) => y === 2028)).toHaveLength(3);
    const level = (d: string) => raw.commitments.filter((c) => commitProgram(c).program.division === d).length;
    expect([level('ncaa-d1'), level('ncaa-d2'), level('ncaa-d3'), level('naia')]).toEqual([9, 1, 6, 0]);
  });

  it('rests on 43 source entries on 36 distinct URLs, and 7 commitments carry a date', () => {
    const entries = raw.commitments.flatMap((c) => c.sources);
    expect(entries).toHaveLength(43);
    expect(new Set(entries.map((s) => s.url)).size).toBe(36);
    expect(raw.commitments.filter((c) => c.asOf !== null).map((c) => c.asOf).sort()).toEqual([
      '2026-02',
      '2026-02-04',
      '2026-04-23',
      '2026-04-23',
      '2026-08-06',
      '2026-09-18',
      '2026-10-01',
    ]);
  });

  it('serves them in display order: class, then school, then name; colleges by players, level, name', () => {
    expect(getCommitments().map((c) => c.fullName)).toEqual([
      'Violet Potts',
      'Alyssa Montejano',
      'Katarina Smith',
      'Claire Johnson',
      'Phoebe Miller',
      'Carolyn Cordoni',
      'Emma Williams',
      'Catherine Cecchini',
      'Gigi Colant',
      'Storey Lewis',
      'Maggie Magnano',
      'Sofie Stiefel',
      'Zola Ducker',
      'Ryan Hemeon',
      'Gianna Rinaldi',
      'Olivia Van De Braak',
    ]);
    expect(getColleges().map((c) => c.slug)).toEqual([
      'uc-davis',
      'bucknell',
      'cal',
      'colgate',
      'iowa',
      'marist',
      'san-diego-state',
      'maryville',
      'bates',
      'bryn-mawr',
      'ithaca',
      'st-lawrence',
      'trinity-ct',
      'vassar',
    ]);
  });
});

describe('lib/commits.ts read API', () => {
  it('serves commitments by class, earliest first, then school, then name', () => {
    const classes = getCommitments().map((c) => commitClassOf(c) ?? Number.POSITIVE_INFINITY);
    expect(classes).toEqual([...classes].sort((a, b) => a - b));
    expect(getCommitments()).toHaveLength(raw.commitments.length);
  });

  it('serves colleges with the most players first', () => {
    const counts = getColleges().map((c) => getCollegeCommitments(c.slug).length);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(getColleges()).toHaveLength(raw.colleges.length);
  });

  it('finds each commitment by player and by team, and nothing for anyone else', () => {
    for (const c of raw.commitments) {
      // By value: lib/commits.ts serves the objects its own parse produced, not this file's.
      expect(getPlayerCommitment(c.teamSlug as never, c.athleteId)).toEqual(c);
      expect(getTeamCommitments(c.teamSlug as never)).toContainEqual(c);
      expect(getCollege(c.college)).toBeDefined();
    }
    const committed = new Set(raw.commitments.map((c) => `${c.teamSlug} ${c.athleteId}`));
    const free = teams.flatMap((t) => t.players.map((p) => ({ t: t.slug, p }))).find(
      ({ t, p }) => p.athleteId !== null && !committed.has(`${t} ${p.athleteId}`),
    )!;
    expect(getPlayerCommitment(free.t as never, free.p.athleteId!)).toBeNull();
  });

  it('dates the page by its last check: capturedAt, or a later college checkedOn', () => {
    const latest = [raw.capturedAt, ...raw.colleges.map((c) => c.checkedOn)].sort().at(-1);
    expect(getCommitsLastChecked()).toBe(latest);
    expect(getCommitsLastChecked() >= raw.capturedAt).toBe(true);
    // The second round of research, 2026-10-04, re-checked the file and added the other sports.
    expect(getCommitsLastChecked()).toBe('2026-10-04');
  });

  it('displays a college by its short name when it has one', () => {
    expect(collegeDisplayName(COLLEGE)).toBe('Example');
    expect(collegeDisplayName({ ...COLLEGE, shortName: null })).toBe('Example College');
  });
});

describe('isCommitDate: a day, a month or a year', () => {
  it.each(['2026-06-15', '2026-06', '2026', '2024-02-29'])('accepts %s', (v) => expect(isCommitDate(v)).toBe(true));
  it.each(['2025-26', '2025-2026', '2026-13', '2026-02-30', '2025-02-29', 'June 2026', '26'])('refuses %s', (v) =>
    expect(isCommitDate(v)).toBe(false),
  );
});

describe('the schema refuses a bad file, naming the path', () => {
  const good = fileWith([commitmentFor(senior)]);

  it('passes a good one', () => {
    expect(schemaIssues(good)).toEqual([]);
    expect(load(good)).not.toThrow();
  });

  it('a duplicate college slug', () => {
    const f = fileWith([commitmentFor(senior)], [COLLEGE, { ...COLLEGE }]);
    expect(schemaIssues(f)).toContain('colleges.1.slug: duplicate college slug example-college');
  });

  it('a commitment to a college the file does not hold', () => {
    const f = fileWith([commitmentFor(senior, { college: 'nowhere' })]);
    expect(schemaIssues(f)).toContain('commitments.0.college: nowhere is not a college in colleges[]');
  });

  it('a second commitment for one player', () => {
    const f = fileWith([commitmentFor(senior), commitmentFor(senior)]);
    expect(schemaIssues(f).join('\n')).toMatch(/commitments\.1: a second commitment for/);
  });

  it('a college nobody committed to', () => {
    const f = fileWith([commitmentFor(senior)], [COLLEGE, { ...COLLEGE, slug: 'orphan-college' }]);
    expect(schemaIssues(f)).toContain('colleges.1: no commitment names orphan-college: drop the college record');
  });

  it('a commitment in a sport its college has no program for', () => {
    const f = fileWith([commitmentFor(senior, { sport: 'lacrosse' })]);
    const issues = schemaIssues(f);
    expect(issues).toContain('commitments.0.sport: example-college has no lacrosse program in colleges[]');
    expect(issues).toContain('colleges.0.programs.0: no field-hockey commitment names example-college: drop the program');
  });

  it('two programs in one sport, or a program nobody committed to', () => {
    const lacrosse = { sport: 'lacrosse', division: 'ncaa-d3', conference: null, url: null } as const;
    const twice = fileWith([commitmentFor(senior)], [{ ...COLLEGE, programs: [...COLLEGE.programs, { ...COLLEGE.programs[0] }] }]);
    expect(schemaIssues(twice)).toContain('colleges.0.programs.1.sport: example-college has two field-hockey programs');
    const orphan = fileWith([commitmentFor(senior)], [{ ...COLLEGE, programs: [...COLLEGE.programs, lacrosse] }]);
    expect(schemaIssues(orphan)).toContain('colleges.0.programs.1: no lacrosse commitment names example-college: drop the program');
  });

  it('takes commitments in two sports at one college, each with its own level', () => {
    const lacrosse = { sport: 'lacrosse', division: 'ncaa-d3', conference: null, url: null } as const;
    const f = fileWith(
      [commitmentFor(senior), commitmentFor(junior, { sport: 'lacrosse' })],
      [{ ...COLLEGE, programs: [...COLLEGE.programs, lacrosse] }],
    );
    expect(schemaIssues(f)).toEqual([]);
    expect(load(f)).not.toThrow();
  });

  it('takes a commitment in any college sport, each with a program in that sport', () => {
    for (const sport of ['wrestling', 'fencing', 'bowling', 'triathlon', 'acrobatics-and-tumbling', 'flag-football'] as const) {
      const college = { ...COLLEGE, programs: [{ sport, division: 'ncaa-d1', conference: null, url: null } as const] };
      expect(schemaIssues(fileWith([commitmentFor(senior, { sport })], [college])), sport).toEqual([]);
    }
    expect(COMMIT_SPORTS).toHaveLength(new Set(COMMIT_SPORTS).size);
  });

  it('a college with no program', () => {
    const f = fileWith([commitmentFor(senior)], [{ ...COLLEGE, programs: [] }]);
    expect(schemaIssues(f)).toContain('colleges.0.programs: a college needs at least one program');
  });

  it('a social-media source, an http source, an over-long quote and a season for a date', () => {
    const c = commitmentFor(senior);
    const bad = fileWith([
      {
        ...c,
        asOf: '2025-26',
        sources: [
          { ...c.sources[0], url: 'https://www.instagram.com/p/abc/' },
          { ...c.sources[0], url: 'http://example.com/commits' },
          { ...c.sources[0], quote: 'x'.repeat(301) },
          { ...c.sources[0], url: 'https://www.threads.net/@player/post/abc' },
          { ...c.sources[0], url: 'https://youtu.be/commitvideo' },
        ],
      },
    ]);
    const issues = schemaIssues(bad);
    expect(issues).toContain('commitments.0.asOf: expected YYYY-MM-DD, YYYY-MM or YYYY');
    expect(issues).toContain('commitments.0.sources.0.url: social media is not a source');
    expect(issues).toContain('commitments.0.sources.1.url: expected an https URL');
    expect(issues.some((i) => i.startsWith('commitments.0.sources.2.quote'))).toBe(true);
    expect(issues).toContain('commitments.0.sources.3.url: social media is not a source');
    expect(issues).toContain('commitments.0.sources.4.url: social media is not a source');
  });

  it('a date after the research was done', () => {
    for (const asOf of ['2026-10-04', '2026-11', '2027']) {
      const f = fileWith([commitmentFor(senior, { asOf })]);
      expect(schemaIssues(f)).toContain(`commitments.0.asOf: ${asOf} is after the research date 2026-10-03`);
    }
    for (const asOf of ['2026-10-03', '2026-10', '2026']) expect(schemaIssues(fileWith([commitmentFor(senior, { asOf })]))).toEqual([]);
  });

  it('a commitment or a college with no source', () => {
    const f = fileWith([commitmentFor(senior, { sources: [] })], [{ ...COLLEGE, sources: [] }]);
    const issues = schemaIssues(f);
    expect(issues).toContain('commitments.0.sources: a commitment needs at least one source');
    expect(issues).toContain('colleges.0.sources: a college needs at least one source');
  });

  it('an unknown division, sport or status', () => {
    const f = fileWith(
      [commitmentFor(senior, { status: 'verbal' as never, sport: 'quidditch' as never })],
      [{ ...COLLEGE, programs: [{ ...COLLEGE.programs[0], division: 'club' as never }] }],
    );
    const issues = schemaIssues(f);
    expect(issues.some((i) => i.startsWith('commitments.0.status'))).toBe(true);
    expect(issues.some((i) => i.startsWith('commitments.0.sport'))).toBe(true);
    expect(issues.some((i) => i.startsWith('colleges.0.programs.0.division'))).toBe(true);
  });
});

describe('the join to the rosters refuses, naming team, player and college', () => {
  it('another season', () => {
    expect(() => loadCommits(fileWith([commitmentFor(senior)]), teams, '27-28')).toThrow(
      `commits.json is for season ${season}, rosters for 27-28`,
    );
  });

  it('an athleteId that is not a row of the team', () => {
    const f = fileWith([commitmentFor(senior, { athleteId: '00000000-0000-0000-0000-000000000000' })]);
    expect(load(f)).toThrow(`commits: ${senior.teamSlug} / ${senior.row.fullName} (example-college): athleteId`);
  });

  it('another spelling of the name', () => {
    const f = fileWith([commitmentFor(senior, { fullName: `${senior.row.fullName}x` })]);
    expect(load(f)).toThrow(`MaxPreps spells this player "${senior.row.fullName}"`);
  });

  it('a JV row', () => {
    const jv = teams.flatMap((t) => t.players.map((row) => ({ teamSlug: t.slug, row }))).find(
      (r) => r.row.level === 'jv' && r.row.athleteId !== null,
    );
    expect(jv, 'Los Gatos lists JV rows on MaxPreps').toBeDefined();
    expect(load(fileWith([commitmentFor(jv!)]))).toThrow('a JV row: commitments list varsity rows only');
  });

  it('a stated class year that disagrees with the grade', () => {
    const c = commitmentFor(junior);
    const f = fileWith([{ ...c, sources: [{ ...c.sources[0], statedClassYear: classOf(season, 12) }] }]);
    expect(load(f)).toThrow(`sportsrecruits source says class of ${classOf(season, 12)}, the roster shows grade 11`);
  });

  it('sources that disagree on the class year of a player with no grade', () => {
    const c = commitmentFor(noGrade);
    const f = fileWith([
      { ...c, sources: [{ ...c.sources[0], statedClassYear: 2027 }, { ...c.sources[0], url: 'https://example.com/b', statedClassYear: 2028 }] },
    ]);
    expect(load(f)).toThrow('sources disagree on the class year (2027, 2028) and the roster has no grade');
  });

  it('a class year no high school roster of the season can hold, for a player with no grade', () => {
    const c = commitmentFor(noGrade);
    for (const year of [classOf(season, 12) - 1, classOf(season, 9) + 1]) {
      const f = fileWith([{ ...c, sources: [{ ...c.sources[0], statedClassYear: year }] }]);
      expect(load(f)).toThrow(`a source says class of ${year}, not a class on a ${season} high school roster`);
    }
  });

  it('but takes a player with no grade whose sources agree', () => {
    const c = commitmentFor(noGrade);
    const f = fileWith([{ ...c, sources: [{ ...c.sources[0], statedClassYear: 2027 }] }]);
    expect(load(f)).not.toThrow();
  });
});

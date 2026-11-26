/**
 * data/commitments.json (SPEC §1.1j3, DESIGN §21), as the field hockey build serves it: the committed file
 * validates and holds every load-time invariant; lib/players/commits.ts serves the commitments of the people on this
 * build's varsity rows in display order (DESIGN §21.1); and a bad file — built in memory, never written to disk —
 * is refused at load with a message that names what is wrong (the path, or the team, player and college).
 *
 * The file is research, not a script's output. The cases below that need a commitment build one
 * from real roster rows, so they hold whatever the committed file holds; the counts pinned against
 * the file change only with a new sweep (update them with README "College commitments" and
 * DATA-SOURCES §1.1j3).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BANNED_HOSTS } from '../lib/players/clubs-schema';
import {
  COLLEGE_DIVISIONS,
  COMMIT_SPORTS,
  CommitsFileSchema,
  isCommitDate,
  isPostBy,
  type College,
  type Commitment,
  type CommitsFile,
  type PersonCommitment,
} from '../lib/players/commits-schema';
import { personOfRow, rowsOfPerson } from '../lib/players/player-index';
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
} from '../lib/players/commits';
import { joinToRoster } from '../lib/players/roster-join';
import { classOf, getAllEnrichedRosters, getRosters, type MergedPlayer, type RosterConflict } from '../lib/players/rosters';
import { getTeamBySlug } from '../lib/teams';
import { loadProblems, REPO } from './helpers';

/** The file as committed: every build's commitments, each under its person. */
const disk = JSON.parse(readFileSync(path.join(REPO, 'data', 'commitments.json'), 'utf8')) as CommitsFile;
/** The file as this build's pages read it: its round's record, its varsity rows' commitments and their colleges. */
const raw = getCommitsFile();
const teams = getAllEnrichedRosters();
const season = getRosters().season;

/**
 * The first varsity row (by roster order) that has an athleteId, is a person the player index knows (someone something
 * is filed under), and matches `pick`.
 */
function findRow(pick: (p: MergedPlayer) => boolean): { teamSlug: string; row: MergedPlayer } {
  for (const t of teams) {
    const row = t.players.find((p) => p.athleteId !== null && p.level !== 'jv' && personOfRow(t.slug, p.athleteId) !== null && pick(p));
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

/** A commitment of the person on `r`'s row (data/field-hockey/player-index.json says who she is). */
function commitmentFor(r: { teamSlug: string; row: MergedPlayer }, over: Partial<PersonCommitment> = {}): PersonCommitment {
  return {
    playerId: personOfRow(r.teamSlug, r.row.athleteId)!,
    name: r.row.fullName,
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

/** A commitment as the pages read it, on `r`'s row. */
function served(c: PersonCommitment, r: { teamSlug: string; row: MergedPlayer }): Commitment {
  const { name, ...rest } = c;
  return { ...rest, teamSlug: r.teamSlug, athleteId: r.row.athleteId!, fullName: name };
}

/** A valid file with one commitment per given row, all to COLLEGE. */
function fileWith(commitments: PersonCommitment[], colleges: College[] = [COLLEGE]): CommitsFile {
  return {
    builtBy: 'test',
    capturedAt: '2026-10-03',
    notes: ['test'],
    rounds: { 'field-hockey': { builtBy: 'test', capturedAt: '2026-10-03', notes: ['test'] } },
    colleges,
    commitments,
  };
}

/** What the schema says about `f`, as `path: message` lines; [] when it passes. */
function schemaIssues(f: unknown): string[] {
  const r = CommitsFileSchema.safeParse(f);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

const load = (f: unknown) => () => loadCommits(f, teams, season);
/** The error loadCommits throws on `f`, else the roster drift it reports, else '' (tests/helpers.ts loadProblems). */
const problems = (f: unknown) => loadProblems(load(f));

describe('the committed data/commitments.json', () => {
  it('validates and loads against the rosters', () => {
    expect(schemaIssues(disk)).toEqual([]);
    // The contract is strict: a key it does not know is refused, so the parse is the file.
    expect(CommitsFileSchema.parse(disk)).toEqual(disk);
    expect(loadCommits(disk, teams, season)).toEqual(raw);
    expect(raw.season).toBe(season);
    // This build's round's record is what its pages date and explain.
    expect([raw.builtBy, raw.capturedAt, raw.notes]).toEqual([disk.rounds['field-hockey']!.builtBy, disk.rounds['field-hockey']!.capturedAt, disk.rounds['field-hockey']!.notes]);
  });

  it('serves the commitment of every person on a varsity row here, and keeps the rest for the builds they play in', () => {
    const shown = new Set(raw.commitments.map((c) => c.playerId));
    for (const c of disk.commitments) {
      const varsity = rowsOfPerson(c.playerId).some((r) => r.athleteId !== null && r.level === 'varsity');
      expect(shown.has(c.playerId), `${c.name} (${c.college})`).toBe(varsity);
    }
    // Katarina Smith's, one record since 2026-11-26, is on both her field hockey and her soccer row.
    expect(disk.commitments.filter((c) => c.name === 'Katarina Smith')).toHaveLength(1);
    expect(raw.commitments.find((c) => c.fullName === 'Katarina Smith')?.college).toBe('ithaca');
  });

  it('cites only https pages, social media only as an official account\'s post', () => {
    const social = (url: string) => BANNED_HOSTS.some((h) => new URL(url).hostname === h || new URL(url).hostname.endsWith(`.${h}`));
    const sources = raw.commitments.flatMap((c) => c.sources);
    const urls = [
      ...raw.colleges.flatMap((c) => [...c.programs.map((p) => p.url), ...c.sources.map((s) => s.url)]),
      ...sources.map((s) => s.url),
      ...sources.flatMap((s) => (s.account ? [s.account.proof] : [])),
    ].filter((u): u is string => u !== null);
    for (const url of urls) expect(new URL(url).protocol, url).toBe('https:');
    for (const c of raw.colleges) {
      for (const url of [...c.programs.map((p) => p.url), ...c.sources.map((s) => s.url)]) if (url) expect(social(url), url).toBe(false);
    }
    for (const s of sources) {
      expect(social(s.url), s.url).toBe(s.kind === 'official-social');
      if (s.account) {
        expect(isPostBy(s.url, s.account.platform, s.account.handle), s.url).toBe(true);
        expect(social(s.account.proof), s.account.proof).toBe(false);
      }
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

describe('the research of 2026-10-03, 2026-10-04, 2026-10-06, 2026-10-12, 2026-10-22, 2026-11-03, 2026-11-06, 2026-11-13, 2026-11-22 and 2026-11-25 (the EAL sweeps found no row; the Southern California round twelve; the 2026-10-12 round three; the 2026-10-22 round two; the 2026-11-03 round two, one of them on the owner confirming it; the 2026-11-06 round two; the 2026-11-13 round one, a signing and five sources; the 2026-11-22 round one and eight sources; the 2026-11-25 round fifteen sources and one commitment raised to high), as counted in README "College commitments" and DATA-SOURCES §1.1j3', () => {
  // Pinned: change these only with a new sweep, together with those two documents.
  const SOCAL = new Set(['sunset', 'city', 'north-county', 'metro', 'independents']);
  const socal = raw.commitments.filter((c) => SOCAL.has(getTeamBySlug(c.teamSlug)!.league));
  const norcal = raw.commitments.filter((c) => !SOCAL.has(getTeamBySlug(c.teamSlug)!.league));

  it('holds 39 commitments from 23 schools to 30 colleges (33 programs), 38 "committed" and 1 "signed", 36 high and 3 medium', () => {
    expect(raw.capturedAt).toBe('2026-11-25');
    expect(raw.commitments).toHaveLength(39);
    expect(raw.colleges).toHaveLength(30);
    expect(raw.colleges.flatMap((c) => c.programs)).toHaveLength(33);
    expect(new Set(norcal.map((c) => c.teamSlug))).toEqual(
      new Set([
        'berkeley',
        'christopher',
        'gilroy',
        'leigh',
        'lick-wilmerding',
        'los-altos',
        'marin-catholic',
        'mitty',
        'redwood',
        'saint-francis',
        'saratoga',
        'st-ignatius',
        'stevenson',
        'valley-christian',
      ]),
    );
    expect(norcal).toHaveLength(23);
    expect(new Set(socal.map((c) => c.teamSlug))).toEqual(
      new Set(['bishops', 'canyon-hills', 'cathedral-catholic', 'harvard-westlake', 'san-dieguito-academy', 'san-marcos', 'scripps-ranch', 'temecula-valley', 'torrey-pines']),
    );
    // Abby Feldman (Torrey Pines, Macalester soccer) is the 2026-11-22 round's one.
    expect(socal).toHaveLength(16);
    // Phoebe Miller (Redwood, San Diego State lacrosse) signed on 2026-11-11: SDSU's own release of that day.
    expect(raw.commitments.filter((c) => c.status === 'signed').map((c) => [c.fullName, c.college, c.sport])).toEqual([['Phoebe Miller', 'san-diego-state', 'lacrosse']]);
    expect(raw.commitments.filter((c) => c.confidence === 'medium').map((c) => c.fullName).sort()).toEqual(['Reese Roldan', 'Sami Lee', 'Shyla Paredes']);
    // Kendall Gann (Temecula Valley, Barton) is high since 2026-11-25: her own FieldLevel page names the school.
    // Frankie Lemieux's and Clara Froemming's (both 2026-11-03, medium) went to high on 2026-11-06: Stick Together's
    // Nov 5 issue names each one's school. That issue also added Hailey Moncada (Gilroy, Mercyhurst) and Evie Ferrini
    // (Saint Francis, Wellesley), both high.
    // Rylie Storm's went from medium to high on 2026-11-03: her own SportsRecruits profile now shows Harvard.
    // Ryan Hemeon's went from medium to high on 2026-10-22: Stick Together's Oct 6 issue names her school.
    // Kendall Gann's rests on MAX Field Hockey alone, whose commitments its users report. Since 2026-11-13 MAX's player
    // pages name Reese Roldan's and Sami Lee's school too; MAX being self-reported, both stay medium.
    // Sami Lee's rests on the revised nickname rule (2026-10-06): the pages say Samantha; her own MaxPreps page backs the club.
    const lee = socal.find((c) => c.fullName === 'Sami Lee')!;
    expect([lee.college, lee.sport, lee.sources.map((s) => s.kind)]).toEqual(['columbia', 'field-hockey', ['event', 'club-site', 'maxpreps', 'other']]);
  });

  it('joins nothing to the six EAL teams: both 2026-10-04 sweeps of their 95 rows found no commitment', () => {
    const eal = getRosters().teams.filter((t) => t.division === 'eal');
    expect(eal.map((t) => t.slug).sort()).toEqual(['bella-vista', 'chico', 'corning', 'davis', 'lassen', 'pleasant-valley']);
    // 95 rows when swept; MaxPreps lists 111 since the 2026-11-13 re-read (the 16 added are not swept yet).
    expect(eal.reduce((n, t) => n + t.players.length, 0)).toBe(111);
    const ealSlugs = new Set<string>(eal.map((t) => t.slug));
    expect(raw.commitments.filter((c) => ealSlugs.has(c.teamSlug))).toEqual([]);
  });

  it('by sport: 23 field hockey, 12 lacrosse, 2 soccer, 1 basketball, 1 softball (SoCal: 12 field hockey, 3 lacrosse, 1 soccer)', () => {
    const sport = (s: string, list = raw.commitments) => list.filter((c) => c.sport === s).length;
    expect([sport('field-hockey'), sport('lacrosse'), sport('soccer'), sport('basketball'), sport('softball')]).toEqual([23, 12, 2, 1, 1]);
    expect([sport('field-hockey', socal), sport('lacrosse', socal), sport('soccer', socal)]).toEqual([12, 3, 1]);
    // Three colleges hold two programs: UC Davis (field hockey in the MPSF, lacrosse in the Big 12),
    // Cal (field hockey and lacrosse, both ACC) and Harvard (both Ivy League).
    expect(getCollege('uc-davis')!.programs.map((p) => [p.sport, p.conference])).toEqual([
      ['field-hockey', 'MPSF'],
      ['lacrosse', 'Big 12'],
    ]);
    expect(getCollege('cal')!.programs.map((p) => [p.sport, p.conference])).toEqual([
      ['field-hockey', 'ACC'],
      ['lacrosse', 'ACC'],
    ]);
    expect(getCollege('harvard')!.programs.map((p) => [p.sport, p.conference])).toEqual([
      ['field-hockey', 'Ivy League'],
      ['lacrosse', 'Ivy League'],
    ]);
  });

  it('by class: 26 from 2027 and 13 from 2028; by level: 25 Division I, 3 Division II, 11 Division III', () => {
    const classes = getCommitments().map((c) => commitClassOf(c));
    expect(classes.filter((y) => y === 2027)).toHaveLength(26);
    expect(classes.filter((y) => y === 2028)).toHaveLength(13);
    const level = (d: string) => raw.commitments.filter((c) => commitProgram(c).program.division === d).length;
    expect([level('ncaa-d1'), level('ncaa-d2'), level('ncaa-d3'), level('naia')]).toEqual([25, 3, 11, 0]);
  });

  it('rests on 132 source entries on 98 distinct URLs (SoCal: 60 on 51), and 23 commitments carry a date', () => {
    const entries = raw.commitments.flatMap((c) => c.sources);
    expect(entries).toHaveLength(132);
    expect(new Set(entries.map((s) => s.url)).size).toBe(98);
    const socalEntries = socal.flatMap((c) => c.sources);
    // The 2026-11-25 round: The Tower (Bishop's student paper) for Lola Conway and Emerson Davis, seven players'
    // own MAX pages and Kendall Gann's FieldLevel page.
    expect(socalEntries).toHaveLength(60);
    expect(new Set(socalEntries.map((s) => s.url)).size).toBe(51);
    expect(raw.commitments.filter((c) => c.asOf !== null).map((c) => c.asOf).sort()).toEqual([
      '2025-09-22',
      '2026-02',
      '2026-02-04',
      '2026-04-23',
      '2026-06-19',
      '2026-07',
      '2026-07-12',
      '2026-08-06',
      '2026-09-16',
      '2026-09-18',
      '2026-10-01',
      '2026-10-06',
      '2026-11-05',
      '2026-11-05',
      '2026-11-05',
      '2026-11-05',
      // St. Ignatius' College Athlete Recognition Day (Sofie Stiefel, Catherine Cecchini, Gigi Colant: undated until 2026-11-22).
      '2026-11-10',
      '2026-11-10',
      '2026-11-10',
      // Phoebe Miller's signing: San Diego State's release (her commitment dates from Apr 23, 2026).
      '2026-11-11',
      // Abby Feldman: TopDrawerSoccer's Recruiting Roundup.
      '2026-11-16',
      // Lola Conway and Emerson Davis: The Tower's story of Nov 23 (the 2026-11-25 round).
      '2026-11-23',
      '2026-11-23',
    ]);
  });

  it('serves them in display order: class, then school, then name; colleges by players, level, name', () => {
    expect(getCommitments().map((c) => c.fullName)).toEqual([
      'Violet Potts',
      'Sami Lee',
      'Reese Roldan',
      'Alyssa Montejano',
      'Hailey Moncada',
      'Margaux Schlumberger',
      'Clara Froemming',
      'Katarina Smith',
      'Claire Johnson',
      'Phoebe Miller',
      'Carolyn Cordoni',
      'Evie Ferrini',
      'Ella Rennie',
      'McKenzie Rackleff',
      'Emma Williams',
      'Samantha Ippolito',
      'Catherine Cecchini',
      'Gigi Colant',
      'Storey Lewis',
      'Maggie Magnano',
      'Sofie Stiefel',
      'Zola Ducker',
      'Kendall Gann',
      'Abby Feldman',
      'Ava Hauer',
      'Dylan Rietti',
      'Molly Waltz',
      'Lola Conway',
      'Emerson Davis',
      'Eva Allen',
      'Rylie Storm',
      'Lia Palecek',
      'Campbell Trocha',
      'Ryan Hemeon',
      'Frankie Lemieux',
      'Gianna Rinaldi',
      'Olivia Van de Braak',
      'Kaye Zilinskas',
      'Shyla Paredes',
    ]);
    expect(getColleges().map((c) => c.slug)).toEqual([
      'uc-davis',
      'harvard',
      'cal',
      'wellesley',
      'bucknell',
      'cal-baptist',
      'colgate',
      'columbia',
      'dartmouth',
      'iowa',
      'lock-haven',
      'marist',
      'mercyhurst',
      'michigan',
      'michigan-state',
      'oregon',
      'richmond',
      'san-diego-state',
      'barton',
      'florida-tech',
      'maryville',
      'bates',
      'bryn-mawr',
      'ithaca',
      'johns-hopkins',
      'macalester',
      'muhlenberg',
      'st-lawrence',
      'trinity-ct',
      'vassar',
    ]);
  });
});

describe('lib/players/commits.ts read API', () => {
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
      // By value: lib/players/commits.ts serves the objects its own parse produced, not this file's.
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
    // The 2026-11-25 round: fifteen more sources (The Tower, eleven players' own MAX pages, a FieldLevel page).
    expect(getCommitsLastChecked()).toBe('2026-11-25');
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

  it('a social-media post is a source only from the official account it names', () => {
    const c = commitmentFor(senior);
    const account = {
      platform: 'x',
      handle: 'ExampleHS',
      owner: 'school',
      ownerName: 'Example High athletics',
      proof: 'https://examplehs.org/athletics',
    } as const;
    const post = { ...c.sources[0], kind: 'official-social', url: 'https://x.com/ExampleHS/status/123', account } as const;
    expect(schemaIssues(fileWith([{ ...c, sources: [post] }]))).toEqual([]);
    // The handle is matched case-insensitively, on either of X's hosts.
    expect(schemaIssues(fileWith([{ ...c, sources: [{ ...post, url: 'https://twitter.com/examplehs/status/123' }] }]))).toEqual([]);
    const instagram = { ...account, platform: 'instagram', handle: 'examplehs_softball' } as const;
    const igPost = { ...post, url: 'https://www.instagram.com/examplehs_softball/p/AbC123/', account: instagram };
    expect(schemaIssues(fileWith([{ ...c, sources: [igPost] }]))).toEqual([]);
    const bad = fileWith([
      {
        ...c,
        sources: [
          { ...post, account: undefined },
          { ...post, url: 'https://x.com/SomePlayer/status/123' },
          { ...post, url: 'https://www.instagram.com/p/AbC123/', account: instagram },
          { ...post, url: 'https://x.com/ExampleHS' },
          { ...post, account: { ...account, proof: 'https://www.instagram.com/examplehs/' } },
          { ...c.sources[0], account },
          { ...post, kind: 'news' },
        ],
      },
    ]);
    const issues = schemaIssues(bad);
    expect(issues).toContain('commitments.0.sources.0.account: an official-social source names the account');
    expect(issues).toContain('commitments.0.sources.1.url: not a post by ExampleHS on x');
    expect(issues).toContain('commitments.0.sources.2.url: not a post by examplehs_softball on instagram');
    expect(issues).toContain('commitments.0.sources.3.url: not a post by ExampleHS on x');
    expect(issues).toContain('commitments.0.sources.4.account.proof: social media is not a source');
    expect(issues).toContain('commitments.0.sources.5.account: only an official-social source names an account');
    expect(issues).toContain('commitments.0.sources.6.url: social media is not a source');
    expect(issues).toContain('commitments.0.sources.6.account: only an official-social source names an account');
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

describe('the join to the rosters refuses a file, or leaves a commitment out as roster drift, naming team, player and college', () => {
  it('a person on no varsity row of this build: kept in the file, shown nowhere here, and no drift', () => {
    const f = fileWith([commitmentFor(senior, { playerId: 'p0000000000' })]);
    expect(problems(f)).toBe('');
    expect(loadCommits(f, teams, season).commitments).toEqual([]);
  });

  it('shows the row\'s own name, whatever the record calls her (pnpm build-players keeps it the registry\'s)', () => {
    const f = fileWith([commitmentFor(senior, { name: `${senior.row.fullName}x` })]);
    expect(loadCommits(f, teams, season).commitments.map((c) => c.fullName)).toEqual([senior.row.fullName]);
  });

  it('a JV row: commitments list varsity rows only, so a JV player\'s is shown nowhere here', () => {
    const jv = teams.flatMap((t) => t.players.map((row) => ({ teamSlug: t.slug, row }))).find(
      (r) => r.row.level === 'jv' && r.row.athleteId !== null && personOfRow(r.teamSlug, r.row.athleteId) !== null,
    );
    expect(jv, 'Los Gatos lists JV rows on MaxPreps').toBeDefined();
    expect(loadCommits(fileWith([commitmentFor(jv!)]), teams, season).commitments).toEqual([]);
  });

  it('a stated class year that disagrees with the grade', () => {
    const c = commitmentFor(junior);
    const f = fileWith([{ ...c, sources: [{ ...c.sources[0], statedClassYear: classOf(season, 12) }] }]);
    expect(problems(f)).toContain(`sportsrecruits source says class of ${classOf(season, 12)}, the roster shows grade 11`);
  });

  it('sources that disagree on the class year of a player with no grade', () => {
    const c = commitmentFor(noGrade);
    const f = fileWith([
      { ...c, sources: [{ ...c.sources[0], statedClassYear: 2027 }, { ...c.sources[0], url: 'https://example.com/b', statedClassYear: 2028 }] },
    ]);
    expect(problems(f)).toContain('sources disagree on the class year (2027, 2028) and the roster has no grade');
    // A refresh that takes the grade away makes this; it is left out, not thrown.
    expect(loadCommits(f, teams, season).commitments).toEqual([]);
  });

  it('a class year no high school roster of the season can hold, for a player with no grade', () => {
    const c = commitmentFor(noGrade);
    for (const year of [classOf(season, 12) - 1, classOf(season, 9) + 1]) {
      const f = fileWith([{ ...c, sources: [{ ...c.sources[0], statedClassYear: year }] }]);
      expect(problems(f)).toContain(`a source says class of ${year}, not a class on a ${season} high school roster`);
    }
  });

  it('but takes a player with no grade whose sources agree', () => {
    const c = commitmentFor(noGrade);
    const f = fileWith([{ ...c, sources: [{ ...c.sources[0], statedClassYear: 2027 }] }]);
    expect(load(f)).not.toThrow();
  });
});

describe('a roster row whose MaxPreps grade is last season\'s (a rosterBehind grade conflict)', () => {
  const behind = (row: MergedPlayer, marked: boolean): RosterConflict => ({
    field: 'grade',
    kept: String(row.grade),
    other: String(row.grade! + 1),
    kind: 'hudl',
    source: 'https://www.hudl.com/profile/123456/Example-Player',
    note: null,
    ...(marked ? { rosterBehind: true as const } : {}),
  });
  /** The merged rosters with `junior`'s row carrying `conflict`. */
  const teamsWith = (conflict: RosterConflict) =>
    teams.map((t) =>
      t.slug !== junior.teamSlug
        ? t
        : { ...t, players: t.players.map((p) => (p.athleteId === junior.row.athleteId ? { ...p, conflicts: [...p.conflicts, conflict] } : p)) },
    );
  const stating = (year: number) => {
    const c = commitmentFor(junior);
    return { ...c, sources: [{ ...c.sources[0], statedClassYear: year }] };
  };
  const marked = teamsWith(behind(junior.row, true));
  const unmarked = teamsWith(behind(junior.row, false));

  it('takes a commitment source one class year ahead only with the marker', () => {
    const senior = stating(classOf(season, 12));
    expect(loadProblems(() => loadCommits(fileWith([senior]), marked, season))).toBe('');
    expect(loadProblems(() => loadCommits(fileWith([senior]), unmarked, season))).toContain(
      `sportsrecruits source says class of ${classOf(season, 12)}, the roster shows grade 11`,
    );
    // The roster grade's own class still passes; a class year two off still fails.
    expect(loadProblems(() => loadCommits(fileWith([stating(classOf(season, 11))]), marked, season))).toBe('');
    expect(loadProblems(() => loadCommits(fileWith([stating(classOf(season, 10))]), marked, season))).toContain(
      `sportsrecruits source says class of ${classOf(season, 10)}, the roster shows grade 11`,
    );
  });

  it('takes a club-tie source one class year ahead only with the marker (the same join)', () => {
    const tie = { teamSlug: junior.teamSlug, athleteId: junior.row.athleteId!, fullName: junior.row.fullName, club: 'x' };
    const join = (t: typeof teams, year: number) =>
      loadProblems(() =>
        joinToRoster([{ ...tie, sources: [{ kind: 'event', statedClassYear: year }] }], t, season, {
          label: 'clubs',
          noun: 'clubs',
          subject: (r) => r.club,
        }),
      );
    expect(join(marked, classOf(season, 12))).toBe('');
    expect(join(unmarked, classOf(season, 12))).toContain(`event source says class of ${classOf(season, 12)}, the roster shows grade 11`);
    expect(join(marked, classOf(season, 13))).toContain(`event source says class of ${classOf(season, 13)}, the roster shows grade 11`);
  });

  it('lists the player under the corrected class: commitClassOf reads the grade the conflict gives', () => {
    const c = served(commitmentFor(junior), junior);
    const row = (t: typeof teams) => t.find((x) => x.slug === junior.teamSlug)!.players.find((p) => p.athleteId === junior.row.athleteId)!;
    expect(commitClassOf(c, row(marked))).toBe(classOf(season, 12));
    expect(commitClassOf(c, row(unmarked))).toBe(classOf(season, 11));
    expect(commitClassOf(c, junior.row)).toBe(classOf(season, 11));
  });
});

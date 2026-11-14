/**
 * The player registry: the resolver's rules on made-up rows, then the committed data/players.json
 * against the files it was built from.
 *
 * The committed-file checks tolerate a registry that LAGS its sources (a weekly roster refresh can
 * add a row before anyone runs `pnpm build-players`): they hold what the file says to be true and
 * stable, not complete.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO as ROOT } from './helpers';
import { bannedChain, repoPath, resolveFile, sourceFiles, specifierBase, type Target } from './import-graph';
import { buildRegistry, classOfFor, isShortName, nameKey, namesCompatible, positionCodes, type BuildInput, type Sighting } from '../lib/players/registry-build';
import { readBuildInput, readPlayerIdentity, readPlayersFile, sportDataDir } from '../lib/players/registry-file';
import {
  PlayersFileSchema,
  identifierKey,
  type Observation,
  type Player,
  type PlayerIdentity,
  type PlayersFile,
} from '../lib/players/registry-schema';
import { currentSeasonSightings, pastSeasonSightings } from '../lib/players/registry-sources';
import { SPORT_IDS } from '../lib/sports/current';
import { stampCuratedFiles, stampIndex } from '../scripts/build-players';

const NO_IDENTITY: PlayerIdentity = { notes: [], sameAs: [], rowSplits: [], distinct: [], notSame: [] };

/** A roster-row sighting: field hockey, 26-27, varsity unless said otherwise. */
function row(over: Partial<Sighting> & { name: string; obs?: Partial<Observation> }): Sighting {
  const { name, obs, ...rest } = over;
  const [firstName, ...last] = name.split(' ');
  return {
    sport: 'field-hockey',
    season: '26-27',
    team: 'alpha',
    level: 'varsity',
    careerIds: [],
    nameKeys: [nameKey(name)],
    firstName,
    lastName: last.join(' ') || null,
    observations: [{ src: rest.level === 'jv' ? 'maxpreps-jv-roster' : 'maxpreps-roster', name, ...obs }],
    ...rest,
  };
}

function build(sightings: Sighting[], over: Partial<BuildInput> = {}): PlayersFile {
  const pairs = new Map(sightings.map((s) => [`${s.sport} ${s.season}`, { sport: s.sport, season: s.season }]));
  return buildRegistry({ previous: null, identity: NO_IDENTITY, built: [...pairs.values()], sightings, builtBy: 'test', ...over });
}

const named = (file: PlayersFile, name: string): Player[] => file.players.filter((p) => p.names.includes(name));

describe('names and class years', () => {
  it('nameKey folds case, accents, spaces and punctuation', () => {
    expect(nameKey("Zoë  O'Brien-Smith")).toBe('zoeobriensmith');
    expect(nameKey('OLIVIA VAN DE BRAAK')).toBe(nameKey('Olivia Van de Braak'));
    expect(nameKey('Téa Hunnius')).toBe(nameKey('Tea Hunnius'));
  });

  it('a stat sheet short name is not a name', () => {
    expect(isShortName('S. Lewis')).toBe(true);
    expect(isShortName('Storey Lewis')).toBe(false);
    expect(isShortName('AJ Lewis')).toBe(false);
  });

  it('classOfFor reads a grade against its season', () => {
    expect(classOfFor('26-27', 12)).toBe(2027);
    expect(classOfFor('25-26', 11)).toBe(2027);
    expect(classOfFor('26-27', 9)).toBe(2030);
  });

  it('positionCodes reads words and codes as the same thing', () => {
    expect([...positionCodes(['Midfield/Defense'])].sort()).toEqual(['D', 'M']);
    expect([...positionCodes(['F', 'M'])].sort()).toEqual(['F', 'M']);
    expect([...positionCodes(['Goalkeeper'])]).toEqual(['G']);
  });
});

describe('who is who', () => {
  it('one career id is one player across seasons, schools, levels and sports', () => {
    const file = build([
      row({ name: 'Ada Stone', careerIds: ['c1'], obs: { grade: 11, jersey: '9' } }),
      row({ name: 'Ada Stone', careerIds: ['c1'], level: 'jv', obs: { grade: 11, jersey: '10' } }),
      row({ name: 'Ada Stone', careerIds: ['c1'], season: '25-26', team: 'beta', obs: { grade: 10, jersey: '4' } }),
      row({ name: 'Ada Stone', careerIds: ['c1'], sport: 'soccer', obs: { grade: 11 } }),
    ]);
    expect(file.players).toHaveLength(1);
    const [p] = file.players;
    expect(p.stints).toHaveLength(4);
    expect(p.classOf).toBe(2028);
    expect(p.classOfConflicts).toEqual([]);
    expect(file.counts).toMatchObject({ players: 1, multiSeason: 1, multiSport: 1, withCareer: 1 });
    // A varsity 9 and a JV 10 are two stints, not a disagreement.
    expect(p.stints.flatMap((s) => s.conflicts)).toEqual([]);
    expect(p.stints.map((s) => `${s.season} ${s.sport} ${s.team} ${s.level} ${s.jersey}`)).toEqual([
      '25-26 field-hockey beta varsity 4',
      '26-27 field-hockey alpha varsity 9',
      '26-27 field-hockey alpha jv 10',
      '26-27 soccer alpha varsity null',
    ]);
  });

  it('a row with no id joins the one player of its team with that name', () => {
    const file = build([
      row({ name: "Bea O'Neil", careerIds: ['c1'], obs: { grade: 10 } }),
      row({ name: 'Bea ONeil', level: 'jv', observations: [{ src: 'school-jv-roster', name: 'Bea ONeil', grade: 10, jersey: '7' }] }),
    ]);
    expect(file.players).toHaveLength(1);
    expect(file.players[0].names).toEqual(["Bea O'Neil", 'Bea ONeil']);
    expect(file.players[0].identifiers).toEqual([{ kind: 'maxpreps-career', careerId: 'c1', careerProfileId: null }]);
    expect(file.review).toEqual([]);
  });

  it('a name never joins across teams or sports', () => {
    const file = build([
      row({ name: 'Cy Park', careerIds: ['c1'] }),
      row({ name: 'Cy Park', team: 'beta', observations: [{ src: 'school-jv-roster', name: 'Cy Park' }], level: 'jv' }),
      row({ name: 'Cy Park', sport: 'soccer', observations: [{ src: 'school-jv-roster', name: 'Cy Park' }], level: 'jv' }),
    ]);
    expect(file.players).toHaveLength(3);
    expect(file.counts.nameOnly).toBe(2);
  });

  it('a row with no id and no match is a player known by name, and its other rows join it', () => {
    const file = build([
      row({ name: 'Dee Ruiz', level: 'jv', observations: [{ src: 'school-jv-roster', name: 'Dee Ruiz', grade: 9 }] }),
      row({ name: 'Dee Ruiz', level: 'jv', observations: [{ src: 'profile', kind: 'hudl', url: 'https://www.hudl.com/profile/1', name: 'Dee Ruiz', classOf: 2030 }] }),
    ]);
    expect(file.players).toHaveLength(1);
    expect(file.players[0].identifiers).toEqual([{ kind: 'name', sport: 'field-hockey', team: 'alpha', name: 'deeruiz' }]);
    expect(file.players[0].classOf).toBe(2030);
    expect(file.players[0].stints[0].observations.map((o) => o.src)).toEqual(['school-jv-roster', 'profile']);
  });

  it('a name whose class year is two or more years off is kept apart and listed', () => {
    const file = build([
      row({ name: 'Eve Lund', careerIds: ['c1'], obs: { grade: 9 } }),
      row({ name: 'Eve Lund', season: '25-26', observations: [{ src: 'all-league', name: 'Eve Lund', grade: 12, award: 'firstTeam' }] }),
    ]);
    expect(file.players).toHaveLength(2);
    expect(file.review.map((r) => r.kind)).toEqual(['name-class-mismatch']);
    expect(file.review[0].players).toHaveLength(2);
  });

  it('a name one class year off joins, and the disagreement is a class-year conflict', () => {
    const file = build([
      row({ name: 'Fay Ito', careerIds: ['c1'], obs: { grade: 11 } }),
      row({ name: 'Fay Ito', season: '25-26', observations: [{ src: 'all-league', name: 'Fay Ito', grade: 11, award: 'secondTeam' }] }),
    ]);
    expect(file.players).toHaveLength(1);
    expect(file.players[0].classOf).toBe(2028);
    expect(file.players[0].classOfConflicts).toEqual([
      { classOf: 2027, season: '25-26', sport: 'field-hockey', team: 'alpha', level: 'varsity', src: 'all-league' },
    ]);
  });

  it('two careers under one name on one team are one player when their class years agree, and listed', () => {
    const file = build([
      row({ name: 'Gia Moss', careerIds: ['c1'], obs: { grade: 11, jersey: '15' } }),
      row({ name: 'Gia Moss', careerIds: ['c2'], obs: { grade: 11 } }),
    ]);
    expect(file.players).toHaveLength(1);
    expect(file.players[0].identifiers.map(identifierKey)).toEqual(['mp:c1', 'mp:c2']);
    expect(file.players[0].stints).toHaveLength(1);
    expect(file.players[0].stints[0].jersey).toBe('15');
    expect(file.review.map((r) => r.kind)).toEqual(['same-name-two-careers']);
  });

  it('two careers under one name stay apart when their class years contradict, or a person says so', () => {
    const rows = [
      row({ name: 'Hana Cho', careerIds: ['c1'], obs: { grade: 12 } }),
      row({ name: 'Hana Cho', careerIds: ['c2'], obs: { grade: 9 } }),
      row({ name: 'Ivy Roe', careerIds: ['c3'], obs: { grade: 10 } }),
      row({ name: 'Ivy Roe', careerIds: ['c4'], obs: { grade: 10 } }),
    ];
    const file = build(rows, {
      identity: { ...NO_IDENTITY, distinct: [{ sport: 'field-hockey', team: 'alpha', careerIds: ['c3', 'c4'], basis: 'twins, as it happens' }] },
    });
    expect(file.players).toHaveLength(4);
    expect(file.review.map((r) => r.kind)).toEqual(['same-name-two-careers']);
    expect(file.review[0].note).toMatch(/kept as two players/);
  });

  it('a bare name that fits two players of the team joins neither', () => {
    const file = build([
      row({ name: 'Hana Cho', careerIds: ['c1'], obs: { grade: 12 } }),
      row({ name: 'Hana Cho', careerIds: ['c2'], obs: { grade: 9 } }),
      row({ name: 'Hana Cho', level: 'jv', observations: [{ src: 'school-jv-roster', name: 'Hana Cho' }] }),
      // …but one whose class year fits only one of them joins her.
      row({ name: 'Hana Cho', level: 'jv', observations: [{ src: 'profile', kind: 'ncsa', url: 'https://x.test/1', name: 'Hana Cho', classOf: 2030 }] }),
    ]);
    expect(file.players).toHaveLength(3);
    expect(file.review.map((r) => r.kind).sort()).toEqual(['name-ambiguous', 'same-name-two-careers']);
    const freshman = file.players.find((p) => p.identifiers.some((i) => identifierKey(i) === 'mp:c2')) as Player;
    expect(freshman.stints.flatMap((s) => s.observations.map((o) => o.src))).toContain('profile');
  });

  it('a nickname or a near spelling is only suggested, never joined', () => {
    const file = build([
      row({ name: 'Gabrielle Moll', careerIds: ['c1'], obs: { grade: 11 } }),
      row({ name: 'Gabby Moll', season: '25-26', observations: [{ src: 'all-league', name: 'Gabby Moll', grade: 10, award: 'firstTeam' }] }),
    ]);
    expect(file.players).toHaveLength(2);
    expect(file.review).toHaveLength(1);
    expect(file.review[0]).toMatchObject({ kind: 'possible-match', names: ['Gabrielle Moll', 'Gabby Moll'], seasons: ['25-26', '26-27'] });
  });

  it('sameAs joins what a person has decided, to a career or to another name', () => {
    const rows = [
      row({ name: 'Gabrielle Moll', careerIds: ['c1'], obs: { grade: 11 } }),
      row({ name: 'Gabby Moll', season: '25-26', observations: [{ src: 'all-league', name: 'Gabby Moll', grade: 10, award: 'firstTeam' }] }),
      row({ name: 'Jo Marsh', level: 'jv', observations: [{ src: 'school-jv-roster', name: 'Jo Marsh' }] }),
      row({ name: 'Josephine Marsh', season: '25-26', level: 'jv', observations: [{ src: 'all-league', name: 'Josephine Marsh', award: 'firstTeam' }] }),
    ];
    const file = build(rows, {
      identity: {
        ...NO_IDENTITY,
        sameAs: [
          { sport: 'field-hockey', team: 'alpha', name: 'Gabby Moll', careerId: 'c1', basis: 'the owner says so' },
          { sport: 'field-hockey', team: 'alpha', name: 'Josephine Marsh', isName: 'Jo Marsh', basis: 'the owner says so' },
        ],
      },
    });
    expect(file.players).toHaveLength(2);
    expect(named(file, 'Gabby Moll')[0].names).toEqual(['Gabrielle Moll', 'Gabby Moll']);
    expect(named(file, 'Jo Marsh')[0].stints.map((s) => s.season)).toEqual(['25-26', '26-27']);
    expect(file.review).toEqual([]);
  });

  it('one career under two unrelated names is two players, and the id stays with the latest', () => {
    const file = build([
      // The same season: the varsity roster's row keeps the id.
      row({ name: 'Adriana Yam', careerIds: ['c1'] }),
      row({ name: 'Ayva Garcia', careerIds: ['c1'], level: 'jv' }),
      // A nickname is one person.
      row({ name: 'Cameron Pearce', careerIds: ['c2'] }),
      row({ name: 'Cammie Pearce', careerIds: ['c2'], level: 'jv' }),
      // A coach retyped this year's players over last year's rows: each id carries two people, and
      // the player who moved from one id to the other is found again by his name.
      row({ name: 'Andrew Duong', careerIds: ['c3'], obs: { grade: 12, jersey: '21' } }),
      row({ name: 'Nicolas Finuliar', careerIds: ['c4'], obs: { grade: 12, jersey: '24' } }),
      { ...row({ name: 'Nicolas Finuliar', careerIds: ['c3'], season: '25-26' }), softLevel: true, observations: [{ src: 'maxpreps-stats', name: 'Nicolas Finuliar', grade: 11, jersey: '21' }] },
      { ...row({ name: 'Bodi Anderson', careerIds: ['c4'], season: '25-26' }), softLevel: true, observations: [{ src: 'maxpreps-stats', name: 'Bodi Anderson', grade: 11, jersey: '24' }] },
      // This season's stat line, an initial and a last name, goes with this season's row.
      { ...row({ name: 'A. Duong', careerIds: ['c3'] }), softLevel: true, nameKeys: [], observations: [{ src: 'maxpreps-stats', name: 'A. Duong', jersey: '21' }] },
    ]);
    const who = (name: string) => {
      const [p, ...rest] = named(file, name);
      expect(rest, name).toEqual([]);
      return `${p.identifiers.map(identifierKey).join(',')} | ${p.stints.map((s) => `${s.season} ${s.level} ${s.jersey}`).join('; ')}`;
    };
    expect(file.players).toHaveLength(6);
    expect(who('Adriana Yam')).toBe('mp:c1 | 26-27 varsity null');
    expect(who('Ayva Garcia')).toBe('name:field-hockey:alpha:ayvagarcia | 26-27 jv null');
    expect(who('Cameron Pearce')).toBe('mp:c2 | 26-27 varsity null; 26-27 jv null');
    expect(who('Andrew Duong')).toBe('mp:c3 | 26-27 varsity 21');
    expect(who('Nicolas Finuliar')).toBe('mp:c4 | 25-26 varsity 21; 26-27 varsity 24');
    expect(who('Bodi Anderson')).toBe('name:field-hockey:alpha:bodianderson | 25-26 varsity 24');
    expect(file.review.map((r) => `${r.kind} ${r.names.join('/')}`)).toEqual([
      'career-two-names Adriana Yam/Ayva Garcia',
      'career-two-names Andrew Duong/Nicolas Finuliar',
      'career-two-names Nicolas Finuliar/Bodi Anderson',
    ]);
    // Carried forward whole by a build that reads none of these seasons, nobody moves.
    expect(build([], { previous: file, built: [] }).players).toEqual(file.players);
  });

  it('namesCompatible tells a respelling from another person', () => {
    const same = [['Cammie Pearce', 'Cameron Pearce'], ['Kate Keenan', 'Kate Kennan 12'], ['Sienna Steele', 'Sienna Steele (GK) 10'], ['Téa Hunnius', 'Tea Hunnius'], ['Savannah Wiedeck', 'Savannah Weideck'], ['Izzy Adams', 'Isabelle Adams'], ['Lupita Cervantes', '𝐿𝓊𝓅𝒾𝓉𝒶 Cervantes']];
    const other = [['Andrew Duong', 'Nicolas Finuliar'], ['Ayelet Ron', 'Annika Mody'], ['Lupita Cervantes', 'Zoe Blue']];
    for (const [a, b] of same) expect(namesCompatible(a, b), `${a} / ${b}`).toBe(true);
    for (const [a, b] of other) expect(namesCompatible(a, b), `${a} / ${b}`).toBe(false);
  });
});

describe('what a stint shows', () => {
  it('fields come from the first source to state them, and every other statement is a conflict', () => {
    const file = build([
      {
        ...row({ name: 'Kai Lowe', careerIds: ['c1'], obs: { jersey: '6', positions: ['F'], athleteId: 'a1' } }),
        observations: [
          { src: 'maxpreps-roster', name: 'Kai Lowe', jersey: '6', positions: ['F'], athleteId: 'a1' },
          { src: 'enrichment', name: 'Kailani Lowe' },
          { src: 'enrichment', kind: 'school-site', url: 'https://s.test/r', grade: 11 },
          { src: 'enrichment', kind: 'news', url: 'https://n.test/a', jersey: '4', rejected: true },
          { src: 'enrichment', kind: 'school-site', url: 'https://s.test/r', positions: ['Forward/Midfield'] },
        ],
      },
      { ...row({ name: 'K. Lowe', careerIds: ['c1'] }), softLevel: true, nameKeys: [], observations: [{ src: 'maxpreps-stats', name: 'K. Lowe', jersey: '16' }] },
    ]);
    const [p] = file.players;
    expect(p.names).toEqual(['Kai Lowe', 'Kailani Lowe']);
    const [s] = p.stints;
    expect(s).toMatchObject({ name: 'Kai Lowe', grade: 11, jersey: '6', positions: ['F'], captain: false });
    expect(s.conflicts).toEqual([
      { field: 'jersey', kept: '6', other: '4', src: 'enrichment', kind: 'news', url: 'https://n.test/a' },
      { field: 'jersey', kept: '6', other: '16', src: 'maxpreps-stats' },
    ]);
  });

  it('a rejected statement never decides a field or a class year', () => {
    const file = build([
      {
        ...row({ name: 'Lea Voss', careerIds: ['c1'] }),
        observations: [
          { src: 'maxpreps-roster', name: 'Lea Voss' },
          { src: 'enrichment', kind: 'school-site', url: 'https://s.test/1', grade: 10, rejected: true },
          { src: 'enrichment', kind: 'news', url: 'https://n.test/1', grade: 11, rejected: true },
        ],
      },
    ]);
    const [p] = file.players;
    expect(p.stints[0].grade).toBeNull();
    expect(p.classOf).toBeNull();
    expect(p.stints[0].conflicts.map((c) => `${c.kept} ${c.other}`)).toEqual(['null 10', 'null 11']);
    expect(p.classOfConflicts.map((c) => c.classOf)).toEqual([2029, 2028]);
  });

  it('a stat sheet line follows the player to her only squad', () => {
    const file = build([
      row({ name: 'Mae Tran', careerIds: ['c1'], level: 'jv', observations: [{ src: 'maxpreps-roster', name: 'Mae Tran' }] }),
      { ...row({ name: 'M. Tran', careerIds: ['c1'] }), softLevel: true, nameKeys: [], observations: [{ src: 'maxpreps-stats', name: 'M. Tran', jersey: '3' }] },
    ]);
    expect(file.players[0].stints.map((s) => `${s.level} ${s.name} ${s.jersey}`)).toEqual(['jv Mae Tran 3']);
  });

  it('a freshman team is its own level, and a stat line follows the highest squad a player is listed on', () => {
    const file = build([
      row({ name: 'Ty Boone', careerIds: ['c1'], sport: 'basketball', level: 'freshman', observations: [{ src: 'school-jv-roster', name: 'Ty Boone', grade: 9, jersey: '11' }] }),
      row({ name: 'Ty Boone', careerIds: ['c1'], sport: 'basketball', level: 'jv', obs: { grade: 9, jersey: '30' } }),
      { ...row({ name: 'T. Boone', careerIds: ['c1'], sport: 'basketball' }), softLevel: true, nameKeys: [], observations: [{ src: 'maxpreps-stats', name: 'T. Boone', jersey: '30' }] },
    ]);
    expect(file.players).toHaveLength(1);
    expect(file.players[0].stints.map((s) => `${s.level} ${s.jersey} ${s.observations.length}`)).toEqual(['jv 30 2', 'freshman 11 1']);
    expect(file.players[0].stints.flatMap((s) => s.conflicts)).toEqual([]);
  });

  it('the name shown is the latest season\'s, and a stat sheet\'s only when no other source spells it', () => {
    const file = build([
      row({ name: "Nia D'Souza", careerIds: ['c1'] }),
      { ...row({ name: 'Nia D Souza', careerIds: ['c1'], season: '25-26' }), softLevel: true, observations: [{ src: 'maxpreps-stats', name: 'Nia D Souza', grade: 10 }] },
      { ...row({ name: 'Ola Berg', careerIds: ['c2'], season: '25-26' }), softLevel: true, observations: [{ src: 'maxpreps-stats', name: 'Ola Berg', grade: 12 }] },
    ]);
    expect(named(file, "Nia D'Souza")[0].names).toEqual(["Nia D'Souza"]);
    expect(named(file, 'Ola Berg')[0]).toMatchObject({ name: 'Ola Berg', classOf: 2026 });
  });
});

describe('ids', () => {
  const first = () =>
    build([
      row({ name: 'Pia Kent', careerIds: ['c1'], obs: { grade: 10 } }),
      row({ name: 'Rae Diaz', level: 'jv', observations: [{ src: 'school-jv-roster', name: 'Rae Diaz', grade: 9 }] }),
    ]);

  it('a build from nothing gives the same ids every time, whatever the order', () => {
    const a = first();
    const b = build([
      row({ name: 'Rae Diaz', level: 'jv', observations: [{ src: 'school-jv-roster', name: 'Rae Diaz', grade: 9 }] }),
      row({ name: 'Pia Kent', careerIds: ['c1'], obs: { grade: 10 } }),
    ]);
    expect(b).toEqual(a);
    expect(a.players.every((p) => /^p[0-9a-f]{10}$/.test(p.id))).toBe(true);
  });

  it('a player known by name keeps her id when a career id arrives', () => {
    const before = first();
    const rae = named(before, 'Rae Diaz')[0];
    const after = build(
      [
        row({ name: 'Pia Kent', careerIds: ['c1'], obs: { grade: 10 } }),
        row({ name: 'Rae Diaz', level: 'jv', observations: [{ src: 'school-jv-roster', name: 'Rae Diaz', grade: 9 }] }),
        row({ name: 'Rae Diaz', careerIds: ['c9'], level: 'jv', obs: { grade: 9 } }),
      ],
      { previous: before },
    );
    expect(named(after, 'Rae Diaz')).toHaveLength(1);
    expect(named(after, 'Rae Diaz')[0]).toMatchObject({ id: rae.id, formerIds: [] });
    expect(named(after, 'Rae Diaz')[0].identifiers).toEqual([{ kind: 'maxpreps-career', careerId: 'c9', careerProfileId: null }]);
    // And she keeps it on the build after that, now that only the career id is written down.
    const again = build(
      [row({ name: 'Pia Kent', careerIds: ['c1'] }), row({ name: 'Rae Diaz', careerIds: ['c9'], level: 'jv' })],
      { previous: after },
    );
    expect(named(again, 'Rae Diaz')[0].id).toBe(rae.id);
  });

  it('two players found to be one keep one id, and the other becomes a former id', () => {
    const before = build([
      row({ name: 'Sol Reyes', careerIds: ['c1'], obs: { grade: 12 } }),
      row({ name: 'Sol Reyes', careerIds: ['c2'], obs: { grade: 9 } }),
    ]);
    expect(before.players).toHaveLength(2);
    const ids = before.players.map((p) => p.id).sort();
    const after = build(
      [row({ name: 'Sol Reyes', careerIds: ['c1'], obs: { grade: 12 } }), row({ name: 'Sol Reyes', careerIds: ['c2'], obs: { grade: 12 } })],
      { previous: before },
    );
    expect(after.players).toHaveLength(1);
    expect([after.players[0].id, ...after.players[0].formerIds].sort()).toEqual(ids);
    expect(PlayersFileSchema.safeParse(after).success).toBe(true);
  });

  it('a season the build does not read is carried forward as it was', () => {
    const lastYear = build([
      row({ name: 'Tess Ward', careerIds: ['c1'], season: '25-26', obs: { grade: 10, jersey: '8', athleteId: 'old' } }),
      row({ name: 'Uma Hale', careerIds: ['c2'], season: '25-26', obs: { grade: 12 } }),
    ]);
    const thisYear = build([row({ name: 'Tess Ward', careerIds: ['c1'], obs: { grade: 11, jersey: '2', athleteId: 'new' } })], { previous: lastYear });
    expect(thisYear.players).toHaveLength(2);
    const tess = named(thisYear, 'Tess Ward')[0];
    expect(tess.id).toBe(named(lastYear, 'Tess Ward')[0].id);
    expect(tess.stints.map((s) => `${s.season} ${s.jersey}`)).toEqual(['25-26 8', '26-27 2']);
    expect(tess.stints[0]).toEqual(named(lastYear, 'Tess Ward')[0].stints[0]);
    // A graduate no current file lists is still here.
    expect(named(thisYear, 'Uma Hale')[0].stints.map((s) => s.season)).toEqual(['25-26']);
    expect(thisYear.counts.multiSeason).toBe(1);
  });

  it('a season seen live is only topped up from its later files', () => {
    const live = build([row({ name: 'Vera Oh', careerIds: ['c1'], season: '25-26', obs: { grade: 11, jersey: '5' } })]);
    const later = buildRegistry({
      previous: live,
      identity: NO_IDENTITY,
      builtBy: 'test',
      built: [{ sport: 'field-hockey', season: '25-26', sources: ['all-league'] }],
      sightings: [row({ name: 'Vera Oh', season: '25-26', observations: [{ src: 'all-league', name: 'Vera Oh', grade: 11, award: 'firstTeam' }] })],
    });
    expect(later.players).toHaveLength(1);
    expect(later.players[0].stints[0].observations.map((o) => o.src)).toEqual(['maxpreps-roster', 'all-league']);
    // Topping up twice changes nothing.
    const again = buildRegistry({
      previous: later,
      identity: NO_IDENTITY,
      builtBy: 'test',
      built: [{ sport: 'field-hockey', season: '25-26', sources: ['all-league'] }],
      sightings: [row({ name: 'Vera Oh', season: '25-26', observations: [{ src: 'all-league', name: 'Vera Oh', grade: 11, award: 'firstTeam' }] })],
    });
    expect(again).toEqual(later);
    expect(() =>
      buildRegistry({
        previous: live,
        identity: NO_IDENTITY,
        builtBy: 'test',
        built: [{ sport: 'field-hockey', season: '25-26', sources: ['all-league'] }],
        sightings: [row({ name: 'Vera Oh', season: '25-26' })],
      }),
    ).toThrow(/only topped up/);
  });

  it('refuses a sighting for a pair it was not told it is building', () => {
    expect(() => buildRegistry({ previous: null, identity: NO_IDENTITY, built: [], sightings: [row({ name: 'Wyn Poe', careerIds: ['c1'] })], builtBy: 'test' })).toThrow(
      /not one of the pairs being built/,
    );
  });
});

describe('what the reviewers broke', () => {
  const jv = (name: string, obs: Partial<Observation> = {}, over: Partial<Sighting> = {}): Sighting =>
    row({ name, level: 'jv', observations: [{ src: 'school-jv-roster', name, ...obs }], ...over });
  const stat = (name: string, careerId: string, over: Partial<Sighting> = {}, obs: Partial<Observation> = {}): Sighting => ({
    ...row({ name, careerIds: [careerId], ...over }),
    softLevel: true,
    nameKeys: isShortName(name) ? [] : [nameKey(name)],
    observations: [{ src: 'maxpreps-stats', name, ...obs }],
  });
  const shuffles = <T,>(items: T[]): T[][] => [items, [...items].reverse(), [...items.slice(1), items[0]], [...items.slice(2), ...items.slice(0, 2)]];
  const rebuilt = (sightings: Sighting[], times = 3, over: Partial<BuildInput> = {}) => {
    const out = [build(sightings, over)];
    for (let i = 0; i < times; i += 1) out.push(build(sightings, { ...over, previous: out[out.length - 1] }));
    return out;
  };

  it('the result does not depend on the order the rows arrive in', () => {
    const rows = [
      row({ name: 'Sam Kim', careerIds: ['a'], obs: { grade: 12, jersey: '9' } }),
      row({ name: 'Sam Kim', careerIds: ['b'], obs: { grade: 11, jersey: '19' } }),
      row({ name: 'Sam Kim', careerIds: ['c'], obs: { grade: 10 } }),
      row({ name: 'Sam Kim', careerIds: ['a'], obs: { grade: 12, jersey: '19' } }),
      jv('Sam Kim', { grade: 11 }),
      jv('Sam Kim', { grade: 10 }),
      row({ name: 'Zed Young', careerIds: ['d'], level: 'jv' }),
      row({ name: 'Amy Young', careerIds: ['d'], level: 'jv' }),
      row({ name: 'Bob Marsh', careerIds: ['d'], team: 'beta', level: 'jv' }),
    ];
    const [first, ...others] = shuffles(rows).map((r) => build(r));
    for (const other of others) expect(other).toEqual(first);
    // Three careers a year apart each are not one player spanning three classes.
    expect(first.players.filter((p) => p.names.includes('Sam Kim')).length).toBeGreaterThan(1);
  });

  it('a rebuild of the same rows never moves an id', () => {
    // A career player, an all-league row that joins her, and a namesake kept apart for her class year.
    const rows = [
      row({ name: 'Sam Kim', careerIds: ['c1'], season: '25-26', obs: { grade: 10 } }),
      row({ name: 'Sam Kim', observations: [{ src: 'all-league', name: 'Sam Kim', grade: 11, award: 'firstTeam' }] }),
      jv('Sam Kim', { grade: 9 }),
    ];
    const [first, ...later] = rebuilt(rows);
    expect(first.players).toHaveLength(2);
    for (const again of later) expect(again).toEqual(first);
  });

  it('what a person decided is not undone by the career guard', () => {
    const identity: PlayerIdentity = { ...NO_IDENTITY, sameAs: [{ sport: 'field-hockey', team: 'alpha', name: 'Liz Smyth', careerId: 'c1', basis: 'the owner says so' }] };
    for (const season of ['26-27', '25-26']) {
      const file = build([row({ name: 'Elizabeth Smith', careerIds: ['c1'], season }), jv('Liz Smyth')], { identity });
      expect(file.players).toHaveLength(1);
      expect(file.players[0].identifiers.map(identifierKey)).toEqual(['mp:c1']);
      expect(file.players[0].names).toContain('Liz Smyth');
      expect(file.review).toEqual([]);
    }
    // A name tied to another name joins it whatever the class years say.
    const tied = build([row({ name: 'Elizabeth Smith', careerIds: ['c1'], obs: { grade: 12 } }), jv('Liz Smyth', { grade: 9 })], {
      identity: { ...NO_IDENTITY, sameAs: [{ sport: 'field-hockey', team: 'alpha', name: 'Liz Smyth', isName: 'Elizabeth Smith', basis: 'the owner says so' }] },
    });
    expect(tied.players).toHaveLength(1);
    // A career nobody lists is a mistake in the curation file, not a new player.
    expect(() => build([jv('Liz Smyth')], { identity })).toThrow(/which no source lists/);
  });

  it('adding a sameAs keeps the id the name had, as a former id', () => {
    const rows = [row({ name: 'Elizabeth Smith', careerIds: ['c1'] }), jv('Liz Smyth')];
    const before = build(rows);
    const liz = named(before, 'Liz Smyth')[0];
    const after = build(rows, {
      previous: before,
      identity: { ...NO_IDENTITY, sameAs: [{ sport: 'field-hockey', team: 'alpha', name: 'Liz Smyth', careerId: 'c1', basis: 'the owner says so' }] },
    });
    expect(after.players).toHaveLength(1);
    expect([after.players[0].id, ...after.players[0].formerIds]).toContain(liz.id);
  });

  it('a name-only player whose list row gives way to a MaxPreps row keeps her id', () => {
    const before = build([jv('Ann Lee')]);
    const after = build([row({ name: 'Ann Lee', careerIds: ['c9'], level: 'jv' })], { previous: before });
    expect(after.players).toHaveLength(1);
    expect(after.players[0].id).toBe(before.players[0].id);
  });

  it('the record with the most behind it keeps its id when two become one', () => {
    for (const name of ['Ana Ruiz', 'Bo Chen', 'Cat Diaz', 'Dee Evans', 'Eli Ford', 'Fay Gomez']) {
      const career = [
        row({ name, careerIds: ['c1'], season: '24-25', obs: { grade: 10 } }),
        row({ name, careerIds: ['c1'], season: '25-26', obs: { grade: 11 } }),
        row({ name, careerIds: ['c1'], obs: { grade: 12 } }),
      ];
      // A namesake three classes younger, kept apart…
      const before = build([...career, jv(name, { grade: 9 })]);
      expect(before.players).toHaveLength(2);
      const established = before.players.find((p) => p.stints.length === 3) as Player;
      // …until a person says the grade was a mistake.
      const after = build([...career, jv(name)], { previous: before });
      expect(after.players).toHaveLength(1);
      expect(after.players[0].id, name).toBe(established.id);
      expect(after.players[0].formerIds).toHaveLength(1);
    }
  });

  it('a merge undone gives each player back the id she had', () => {
    const apart = [row({ name: 'Sol Reyes', careerIds: ['c1'], obs: { grade: 12 } }), row({ name: 'Sol Reyes', careerIds: ['c2'], obs: { grade: 9 } })];
    const together = [row({ name: 'Sol Reyes', careerIds: ['c1'], obs: { grade: 12 } }), row({ name: 'Sol Reyes', careerIds: ['c2'], obs: { grade: 12 } })];
    const b0 = build(apart);
    const b1 = build(together, { previous: b0 });
    const b2 = build(apart, { previous: b1 });
    const b3 = build(together, { previous: b2 });
    const b4 = build(apart, { previous: b3 });
    const ids = (f: PlayersFile) => Object.fromEntries(f.players.map((p) => [p.identifiers.map(identifierKey).join('+'), [p.id, ...p.formerIds].join(',')]));
    expect(ids(b2)).toEqual(ids(b0));
    expect(ids(b4)).toEqual(ids(b0));
    expect(ids(b3)).toEqual(ids(b1));
  });

  it('an id never passes to another person with the career id', () => {
    const before = build([stat('Nicolas Finuliar', 'c1', { season: '25-26' }, { grade: 11 })]);
    const nicolas = before.players[0].id;
    const after = build([stat('Nicolas Finuliar', 'c1', { season: '25-26' }, { grade: 11 }), row({ name: 'Andrew Duong', careerIds: ['c1'], obs: { grade: 12 } })], { previous: before });
    expect(named(after, 'Nicolas Finuliar')[0].id).toBe(nicolas);
    expect(named(after, 'Andrew Duong')[0]).toMatchObject({ formerIds: [] });
    expect(named(after, 'Andrew Duong')[0].id).not.toBe(nicolas);
    // Even when last year's row is gone from the sources and only the registry remembers it.
    const later = build([row({ name: 'Andrew Duong', careerIds: ['c1'], obs: { grade: 12 } })], { previous: before });
    expect(named(later, 'Andrew Duong')[0].id).not.toBe(nicolas);
    expect(named(later, 'Nicolas Finuliar')[0]).toMatchObject({ id: nicolas, identifiers: [{ kind: 'name', sport: 'field-hockey', team: 'alpha', name: 'nicolasfinuliar' }] });
  });

  it('a row split off two careers at once leaves both', () => {
    const before = build([row({ name: 'Old Person', careerIds: ['c1'], season: '25-26', obs: { grade: 12 } }), row({ name: 'Old Person', careerIds: ['c2'], season: '25-26', obs: { grade: 12 } })]);
    expect(before.players).toHaveLength(1);
    const after = build([row({ name: 'Xavier Yu', careerIds: ['c1'] }), row({ name: 'Zane Wolfe', careerIds: ['c2'] })], { previous: before });
    expect(after.players.map((p) => `${p.name}: ${p.identifiers.map(identifierKey).join(',')}`).sort()).toEqual([
      'Old Person: name:field-hockey:alpha:oldperson',
      'Xavier Yu: mp:c1',
      'Zane Wolfe: mp:c2',
    ]);
    expect(named(after, 'Old Person')[0].id).toBe(before.players[0].id);
  });

  it('a player known by name on two teams is carried forward as one, short names and all', () => {
    const rows = [
      row({ name: 'Ann Lee', careerIds: ['c1'] }),
      row({ name: 'Liz Smyth', careerIds: ['c1'], season: '25-26' }),
      row({ name: 'Liz Smyth', careerIds: ['c1'], season: '25-26', team: 'beta' }),
      row({ name: 'Kim Park', careerIds: ['c3'] }),
      row({ name: 'Ann Lee', careerIds: ['c3'], level: 'jv' }),
      stat('A. Lee', 'c3', { team: 'beta' }),
      stat('Nicolas Finuliar', 'c5', { team: 'beta' }),
      row({ name: 'Andrew Duong', careerIds: ['c5'] }),
    ];
    const first = build(rows);
    const carriedOn = buildRegistry({ previous: first, identity: NO_IDENTITY, built: [], sightings: [], builtBy: 'test' });
    expect(carriedOn.players).toEqual(first.players);
    expect(named(first, 'Liz Smyth')).toHaveLength(1);
    expect(named(first, 'Nicolas Finuliar')[0].identifiers).toEqual([{ kind: 'name', sport: 'field-hockey', team: 'beta', name: 'nicolasfinuliar' }]);
  });

  it('a name with no Latin letter names nobody, and is never a reason to join', () => {
    const file = build([
      row({ name: '李明', careerIds: ['c1'], nameKeys: [nameKey('李明')], obs: { grade: 10 } }),
      row({ name: '王芳', careerIds: ['c2'], nameKeys: [nameKey('王芳')], obs: { grade: 10 } }),
      row({ name: '李明', careerIds: ['c3'], season: '25-26', obs: { grade: 9 } }),
      row({ name: '#12', nameKeys: [''], level: 'jv', observations: [{ src: 'school-jv-roster', name: '#12' }] }),
    ]);
    expect(file.players.map((p) => p.identifiers.map(identifierKey).join(',')).sort()).toEqual(['mp:c1', 'mp:c2', 'mp:c3']);
    expect(nameKey('Đỗ Minh')).toBe(nameKey('Do Minh'));
    expect(nameKey('Søren Łukasz')).toBe('sorenlukasz');
  });

  it('namesCompatible is not fooled by short last names or a last name that is the other\'s first', () => {
    const other = [['Emma Lee', 'Emma Liu'], ['Andrew Do', 'Andrew Ha'], ['James Taylor', 'Taylor Swift'], ['Olivia Van de Braak', 'Kim De'], ['李明', '王芳']];
    const same = [['Katie Keenan', 'Kate Kennan'], ['Olivia Van De Braak', 'Olivia Braak'], ['李明', '李明']];
    for (const [a, b] of other) expect(namesCompatible(a, b), `${a} / ${b}`).toBe(false);
    for (const [a, b] of same) expect(namesCompatible(a, b), `${a} / ${b}`).toBe(true);
    expect(isShortName('S.Lewis')).toBe(true);
  });

  it('the class year is the one most sources give, and a tie goes to the latest season', () => {
    // A coach copied last year's grades into this year's roster: last year's two sources outvote it.
    const file = build([
      row({ name: 'Milo Grant', careerIds: ['c1'], obs: { grade: 9 } }),
      stat('Milo Grant', 'c1', { season: '25-26' }, { grade: 9 }),
      row({ name: 'Milo Grant', season: '25-26', observations: [{ src: 'all-league', name: 'Milo Grant', grade: 9, award: 'firstTeam' }] }),
    ]);
    expect(file.players).toHaveLength(1);
    expect(file.players[0].classOf).toBe(2029);
    expect(file.players[0].classOfConflicts).toEqual([{ classOf: 2030, season: '26-27', sport: 'field-hockey', team: 'alpha', level: 'varsity', src: 'maxpreps-roster' }]);
  });

  it('a varsity stat line stays on varsity when the player\'s only other row is a JV award', () => {
    const file = build([
      stat('Rocco Lane', 'c1', { season: '25-26' }, { jersey: '32' }),
      row({ name: 'Rocco Lane', season: '25-26', level: 'jv', observations: [{ src: 'all-league', name: 'Rocco Lane', grade: 10, award: 'firstTeam' }] }),
    ]);
    expect(file.players[0].stints.map((s) => `${s.level} ${s.observations.map((o) => o.src).join('+')}`)).toEqual(['varsity maxpreps-stats', 'jv all-league']);
  });

  it('a rejected statement that says what the stint shows is not a conflict', () => {
    const file = build([
      { ...row({ name: 'Una Hale', careerIds: ['c1'] }), observations: [{ src: 'maxpreps-roster', name: 'Una Hale', grade: 10 }, { src: 'enrichment', kind: 'news', url: 'https://n.test', grade: 10, rejected: true }] },
    ]);
    expect(file.players[0].stints[0].conflicts).toEqual([]);
    expect([...positionCodes(['Center Mid', 'CAM', 'Point Guard', 'Right Wing', 'Left Back', 'MF', 'LW'])].sort()).toEqual(['D', 'F', 'G', 'M']);
  });

  it('a season being rebuilt does not forget a player or a stint no source lists any more', () => {
    const september = build([
      row({ name: 'Ada Stone', careerIds: ['c1'], obs: { grade: 11, jersey: '9' } }),
      row({ name: 'Ada Stone', careerIds: ['c1'], level: 'jv', obs: { grade: 11 } }),
      row({ name: 'Quit Early', careerIds: ['c2'], obs: { grade: 10, jersey: '4' } }),
    ]);
    const november = build([row({ name: 'Ada Stone', careerIds: ['c1'], obs: { grade: 11, jersey: '9' } })], { previous: september });
    expect(november.players).toHaveLength(2);
    expect(named(november, 'Ada Stone')[0].stints.map((s) => `${s.level} ${s.gone ?? false}`)).toEqual(['varsity false', 'jv true']);
    const quit = named(november, 'Quit Early')[0];
    expect(quit).toMatchObject({ id: named(september, 'Quit Early')[0].id, classOf: 2029 });
    expect(quit.stints).toEqual([{ ...named(september, 'Quit Early')[0].stints[0], gone: true }]);
    // Built again, nothing moves; and a row that comes back is read afresh.
    expect(build([row({ name: 'Ada Stone', careerIds: ['c1'], obs: { grade: 11, jersey: '9' } })], { previous: november })).toEqual(november);
    const back = build([row({ name: 'Quit Early', careerIds: ['c2'], obs: { grade: 10, jersey: '14' } })], { previous: november });
    expect(named(back, 'Quit Early')[0].stints.map((s) => `${s.jersey} ${s.gone ?? false}`)).toEqual(['14 false']);
  });

  it('a player whose career id passes to somebody else between builds is kept, under her name', () => {
    const before = build([row({ name: 'Ada Stone', careerIds: ['c1'], obs: { grade: 11, jersey: '9' } })]);
    const after = build([row({ name: 'Bob Jones', careerIds: ['c1'], obs: { grade: 10 } })], { previous: before });
    expect(after.players).toHaveLength(2);
    expect(named(after, 'Ada Stone')[0]).toMatchObject({ id: before.players[0].id, identifiers: [{ kind: 'name', sport: 'field-hockey', team: 'alpha', name: 'adastone' }] });
    expect(named(after, 'Ada Stone')[0].stints).toEqual([{ ...before.players[0].stints[0], gone: true }]);
    expect(named(after, 'Bob Jones')[0].id).not.toBe(before.players[0].id);
    expect(build([row({ name: 'Bob Jones', careerIds: ['c1'], obs: { grade: 10 } })], { previous: after })).toEqual(after);
  });

  it('a gone stint is still gone once its season is only carried forward', () => {
    const september = build([row({ name: 'Ada Stone', careerIds: ['c1'] }), row({ name: 'Quit Early', careerIds: ['c2'] })]);
    const november = build([row({ name: 'Ada Stone', careerIds: ['c1'] })], { previous: september });
    const nextYear = build([row({ name: 'Ada Stone', careerIds: ['c1'], season: '27-28' })], { previous: november });
    expect(named(nextYear, 'Quit Early')[0].stints.map((s) => `${s.season} ${s.gone ?? false}`)).toEqual(['26-27 true']);
    expect(named(nextYear, 'Ada Stone')[0].stints.map((s) => `${s.season} ${s.gone ?? false}`)).toEqual(['26-27 false', '27-28 false']);
  });

  it('sameAs joins two records that each have a career, and keeps both ids', () => {
    const rows = [
      stat('Addison Paradiso', 'c1', { season: '25-26' }, { grade: 10, jersey: '24' }),
      row({ name: 'Addy Paradiso', careerIds: ['c2'], obs: { grade: 11, jersey: '24' } }),
    ];
    const before = build(rows);
    expect(before.players).toHaveLength(2);
    expect(before.review.map((r) => r.kind)).toEqual(['possible-match']);
    for (const entry of [{ name: 'Addy Paradiso', careerId: 'c1' }, { name: 'Addison Paradiso', isName: 'Addy Paradiso' }]) {
      const after = build(rows, { previous: before, identity: { ...NO_IDENTITY, sameAs: [{ sport: 'field-hockey', team: 'alpha', basis: 'same number, same class', ...entry }] } });
      expect(after.players).toHaveLength(1);
      expect(after.players[0].identifiers.map(identifierKey)).toEqual(['mp:c1', 'mp:c2']);
      expect([after.players[0].id, ...after.players[0].formerIds].sort()).toEqual(before.players.map((p) => p.id).sort());
      expect(after.review).toEqual([]);
    }
  });

  it('look-alikes are listed whoever they are, unless one list names both', () => {
    const file = build([
      // Last year's career and this year's, the same number: one player, probably.
      stat('Addison Paradiso', 'c1', { season: '25-26' }, { grade: 10, jersey: '24' }),
      row({ name: 'Addy Paradiso', careerIds: ['c2'], obs: { grade: 11, jersey: '24' } }),
      // Sisters on one roster: not a question.
      row({ name: 'Evelyn Williams', careerIds: ['c3'], obs: { grade: 11, jersey: '2' } }),
      row({ name: 'Emma Williams', careerIds: ['c4'], obs: { grade: 10, jersey: '3' } }),
      // Two rows of one roster with one number: a duplicate, probably.
      row({ name: 'Brooklyn Green', careerIds: ['c5'], obs: { jersey: '69' } }),
      row({ name: 'Brooklynn Green', careerIds: ['c6'], obs: { jersey: '69' } }),
      // Two names with no id.
      jv('Kalia Scott'),
      row({ name: 'Kaila Scott', season: '25-26', level: 'jv', observations: [{ src: 'all-league', name: 'Kaila Scott', award: 'firstTeam' }] }),
      // A middle name.
      jv('Shruti Shiv Mishra'),
      row({ name: 'Shruti Mishra', careerIds: ['c7'], level: 'jv' }),
      // The same name in another sport.
      row({ name: 'Lea Kim', careerIds: ['c8'], obs: { grade: 12 } }),
      row({ name: 'Lea Kim', careerIds: ['c9'], sport: 'soccer', obs: { grade: 12 } }),
    ]);
    expect(file.review.map((r) => `${r.kind}: ${[...r.names].sort().join(' / ')}`).sort()).toEqual([
      'possible-match: Addison Paradiso / Addy Paradiso',
      'possible-match: Brooklyn Green / Brooklynn Green',
      'possible-match: Kaila Scott / Kalia Scott',
      'possible-match: Shruti Mishra / Shruti Shiv Mishra',
      'same-name-other-sport: Lea Kim',
    ]);
    expect(file.review.find((r) => r.names.includes('Addy Paradiso'))?.note).toMatch(/both wear #24/);
  });

  it('a pair a person has said is two people is no longer listed, in one sport or across two', () => {
    const rows = [
      stat('Audrey Teuben', 'c1', { season: '25-26' }, { grade: 12 }),
      jv('Abigail Teuben'),
      row({ name: 'Lea Kim', careerIds: ['c8'], obs: { grade: 12 } }),
      row({ name: 'Lea Kim', careerIds: ['c9'], sport: 'soccer', obs: { grade: 12 } }),
    ];
    expect(build(rows).review.map((r) => r.kind).sort()).toEqual(['possible-match', 'same-name-other-sport']);
    const settled = build(rows, {
      identity: {
        ...NO_IDENTITY,
        notSame: [
          { sport: 'field-hockey', team: 'alpha', names: ['Abigail Teuben', 'Audrey Teuben'], basis: 'sisters' },
          { sport: 'field-hockey', team: 'alpha', names: ['Lea Kim', 'Lea Kim'], basis: 'namesakes' },
        ],
      },
    });
    expect(settled.review).toEqual([]);
    expect(settled.players).toHaveLength(4);
    // The answer also clears an item carried forward from a season no build reads any more.
    const before = build(rows);
    const carried = buildRegistry({ previous: before, identity: NO_IDENTITY, built: [], sightings: [], builtBy: 'test' });
    expect(carried.review).toHaveLength(2);
    const answered = buildRegistry({
      previous: before,
      built: [],
      sightings: [],
      builtBy: 'test',
      identity: {
        ...NO_IDENTITY,
        notSame: [
          { sport: 'field-hockey', team: 'alpha', names: ['Audrey Teuben', 'Abigail Teuben'], basis: 'sisters' },
          { sport: 'field-hockey', team: 'alpha', names: ['Lea Kim', 'Lea Kim'], basis: 'namesakes' },
        ],
      },
    });
    expect(answered.review).toEqual([]);
    expect(answered.players).toEqual(before.players);
  });

  it('review items about seasons a build no longer reads are kept', () => {
    const first = build([row({ name: 'Gabrielle Moll', careerIds: ['c1'], season: '25-26' }), jv('Gabby Moll', {}, { season: '25-26' })]);
    expect(first.review).toHaveLength(1);
    const next = build([row({ name: 'Gabrielle Moll', careerIds: ['c1'] })], { previous: first });
    expect(next.review.map((r) => `${r.kind} ${r.names.join('/')} ${r.players.join('/')}`)).toEqual(first.review.map((r) => `${r.kind} ${r.names.join('/')} ${r.players.join('/')}`));
    // …and one about a season nothing lists any more, between players the build cannot compare again.
    const kept = buildRegistry({ previous: first, identity: NO_IDENTITY, built: [], sightings: [], builtBy: 'test' });
    expect(kept.review).toEqual(first.review);
  });
});

describe('the sources as sightings', () => {
  const rosterRow = (over: Record<string, unknown>) => ({
    athleteId: 'a1', careerProfileId: 'guid-1', careerId: 'c1', firstName: 'Xia', lastName: 'Lam', fullName: 'Xia Lam',
    jersey: '6', grade: null, positions: ['F'], height: null, isCaptain: true, ...over,
  });

  it('a roster row and its overlay record are one sighting, moved to the squad the school names', () => {
    const { season, sightings } = currentSeasonSightings(
      {
        sport: 'field-hockey',
        rosters: { season: '26-27', teams: [{ slug: 'alpha', players: [rosterRow({})] }] },
        jvRosters: null,
        enrichment: {
          season: '26-27',
          teams: [
            {
              slug: 'alpha',
              players: [
                {
                  athleteId: 'a1', fullName: 'Xia Lam', sourceName: 'Alexia Lam', level: 'jv',
                  grade: { value: 10, derived: true, kind: 'maxpreps-career', source: 'https://m.test/c' },
                  positions: null, jersey: null, height: null,
                  conflicts: [{ field: 'jersey', other: '4', kind: 'school-site', source: 'https://s.test/r' }, { field: 'grade', other: 'Jr.', kind: 'news', source: 'https://n.test' }],
                  profiles: [{ platform: 'ncsa', url: 'https://ncsasports.org/x', classOf: 2029 }],
                },
              ],
            },
          ],
        },
        playerStats: { season: '26-27', teams: [{ slug: 'alpha', players: [{ careerId: 'c1', fullName: 'Xia Lam', shortName: 'X. Lam', jersey: '6', onRoster: true }, { careerId: null, fullName: 'Z. Nobody', shortName: 'Z. Nobody', jersey: null, onRoster: false }] }] },
        jvSchoolSites: null,
        jvProfiles: null,
      },
      NO_IDENTITY,
    );
    expect(season).toBe('26-27');
    expect(sightings).toHaveLength(2);
    expect(sightings[0]).toMatchObject({ level: 'jv', careerIds: ['c1'], careerProfileIds: { c1: 'guid-1' }, nameKeys: ['xialam', 'alexialam'] });
    expect(sightings[0].observations).toEqual([
      { src: 'maxpreps-roster', name: 'Xia Lam', jersey: '6', positions: ['F'], captain: true, athleteId: 'a1' },
      { src: 'enrichment', name: 'Alexia Lam' },
      { src: 'enrichment', kind: 'maxpreps-career', url: 'https://m.test/c', grade: 10, derived: true },
      { src: 'enrichment', kind: 'school-site', url: 'https://s.test/r', jersey: '4', rejected: true },
      { src: 'profile', kind: 'ncsa', url: 'https://ncsasports.org/x', classOf: 2029 },
    ]);
    expect(sightings[1]).toMatchObject({ softLevel: true, careerIds: ['c1'], nameKeys: [] });
    const [p] = build(sightings).players;
    expect(p.stints.map((s) => s.level)).toEqual(['jv']);
    expect(p.stints[0]).toMatchObject({ grade: 10, jersey: '6', captain: true });
    expect(p.classOf).toBe(2029);
  });

  it('a row a person has split from its career is known by its name', () => {
    const { sightings } = currentSeasonSightings(
      {
        sport: 'field-hockey',
        rosters: { season: '26-27', teams: [{ slug: 'alpha', players: [rosterRow({ fullName: 'Adriana Yam', firstName: 'Adriana', lastName: 'Yam' })] }] },
        jvRosters: { season: '26-27', teams: [{ slug: 'alpha', players: [rosterRow({ athleteId: 'a2', fullName: 'Ayva Garcia', firstName: 'Ayva', lastName: 'Garcia' })] }] },
        enrichment: null, playerStats: null, jvSchoolSites: null, jvProfiles: null,
      },
      { ...NO_IDENTITY, rowSplits: [{ sport: 'field-hockey', team: 'alpha', page: 'jv', name: 'Ayva Garcia', careerId: 'c1', basis: 'two names, one id' }] },
    );
    const file = build(sightings);
    expect(file.players.map((p) => `${p.name} ${p.identifiers.map(identifierKey).join(',')}`).sort()).toEqual([
      'Adriana Yam mp:c1',
      'Ayva Garcia name:field-hockey:alpha:ayvagarcia',
    ]);
    expect(file.review).toEqual([]);
  });

  it('a file for another season is left out and named, not refused', () => {
    const { sightings, skipped } = currentSeasonSightings(
      {
        sport: 'soccer',
        rosters: { season: '27-28', teams: [{ slug: 'alpha', players: [rosterRow({})] }] },
        jvRosters: { season: '26-27', teams: [{ slug: 'alpha', players: [rosterRow({ athleteId: 'a2', careerId: 'c2' })] }] },
        enrichment: null, playerStats: null, jvSchoolSites: null, jvProfiles: null,
      },
      NO_IDENTITY,
    );
    expect(sightings.map((s) => s.careerIds)).toEqual([['c1']]);
    expect(skipped).toEqual(['soccer jv-rosters is for season 26-27, the rosters for 27-28: left out']);
  });

  it('a past season is its stat sheets and its all-league lists', () => {
    const sightings = pastSeasonSightings({
      sport: 'field-hockey',
      season: '25-26',
      priorPlayers: {
        season: '25-26', sport: 'field-hockey', sportSeasonId: 's', fetchedAt: 't',
        source: { id: 'maxpreps-api', builtBy: 'b', notes: [] },
        counts: { teams: 1, teamsWithPlayers: 1, teamsWithNone: 0, teamsUnread: 0, players: 2, withGrade: 1, withJersey: 1 },
        teams: [
          {
            slug: 'alpha', teamId: 't1', status: 'ok', error: null,
            players: [
              { careerId: 'c1', careerUrl: 'u', shortName: 'Y. Abe', name: 'Yui Abe', nameFrom: 'career-url', jersey: '3', grade: 12 },
              { careerId: null, careerUrl: null, shortName: 'N. Link', name: 'N. Link', nameFrom: 'short-name', jersey: null, grade: null },
            ],
          },
        ],
      },
      history: {
        season: '2025-26',
        leagues: {
          x: { divisions: [{ awards: { varsity: { firstTeam: [{ player: 'Yui Abe', slug: 'alpha', year: 12, position: 'Midfield' }, { player: 'No Team', slug: null, year: 11 }] }, jv: null } }] },
          y: {},
        },
      },
    });
    expect(sightings).toHaveLength(2);
    const file = build(sightings);
    expect(file.players).toHaveLength(1);
    expect(file.players[0]).toMatchObject({ name: 'Yui Abe', classOf: 2026 });
    expect(file.players[0].stints[0]).toMatchObject({ season: '25-26', level: 'varsity', jersey: '3', positions: ['Midfield'] });
    expect(file.players[0].stints[0].observations.map((o) => o.src)).toEqual(['maxpreps-stats', 'all-league']);
  });
});

// ---------------------------------------------------------------- the committed file

const committed = readPlayersFile(ROOT);
if (committed === null) throw new Error('data/players.json is missing: run pnpm build-players');

describe('data/players.json', () => {
  const file: PlayersFile = committed;

  it('holds players from every sport, and follows some across seasons', () => {
    const sports = new Set(file.players.flatMap((p) => p.stints.map((s) => s.sport)));
    expect([...sports].sort()).toEqual([...SPORT_IDS].sort());
    expect(file.counts.players).toBeGreaterThan(2500);
    expect(file.counts.nameOnly).toBeGreaterThan(0);
    expect(file.counts.multiSeason).toBeGreaterThan(0);
  });

  it('a rebuild from the committed files keeps every id', () => {
    const rebuilt = buildRegistry(readBuildInput(ROOT, file.builtBy));
    const where = new Map(rebuilt.players.flatMap((p) => [p.id, ...p.formerIds].map((id) => [id, p] as const)));
    const keyOwner = new Map(rebuilt.players.flatMap((p) => p.identifiers.map((i) => [identifierKey(i), p.id] as const)));
    for (const p of file.players) {
      const now = where.get(p.id);
      // A player whose every row has left the sources may be gone; one still listed keeps her id.
      const stillListed = p.identifiers.some((i) => keyOwner.has(identifierKey(i)));
      if (!stillListed) continue;
      expect(now, `${p.id} (${p.name}) lost its id`).toBeDefined();
    }
  });

  it('a rebuild of what has not changed changes nothing', () => {
    const input = readBuildInput(ROOT, file.builtBy);
    const once = buildRegistry(input);
    expect(buildRegistry({ ...input, previous: once })).toEqual(once);
  });

  it('every review item names players the file holds', () => {
    const ids = new Set(file.players.map((p) => p.id));
    for (const r of file.review) for (const id of r.players) expect(ids.has(id)).toBe(true);
  });

  it('what the curation file names is in the registry\'s sources', () => {
    const identity = readPlayerIdentity(ROOT);
    const careers = new Set(file.players.flatMap((p) => p.identifiers.flatMap((i) => (i.kind === 'maxpreps-career' ? [i.careerId] : []))));
    for (const e of identity.rowSplits) expect(careers.has(e.careerId), `rowSplits: ${e.name}'s career ${e.careerId}`).toBe(true);
    for (const e of identity.sameAs) if (e.careerId) expect(careers.has(e.careerId), `sameAs: ${e.name}'s career ${e.careerId}`).toBe(true);
    for (const e of identity.distinct) for (const id of e.careerIds) expect(careers.has(id), `distinct: career ${id}`).toBe(true);
  });

  describe('the curated files carry each player\'s id', () => {
    const index = stampIndex(file);
    const byId = new Map(file.players.flatMap((p) => [p.id, ...p.formerIds].map((id) => [id, p] as const)));
    type Rec = Record<string, unknown>;
    const read = (rel: string): Rec | null => (existsSync(path.join(ROOT, rel)) ? (JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8')) as Rec) : null);

    for (const sport of SPORT_IDS) {
      const dir = sportDataDir(sport);
      it(`${sport}: every record that names a player has a playerId, and it is that row's player`, () => {
        const records: Array<{ where: string; season: unknown; team: unknown; athleteId: unknown; playerId: unknown }> = [];
        for (const [name, lists] of [['clubs.json', ['affiliations', 'jvAffiliations']], ['commits.json', ['commitments']]] as const) {
          const f = read(`${dir}/${name}`);
          for (const list of lists) {
            for (const r of ((f?.[list] as Rec[] | undefined) ?? [])) {
              records.push({ where: `${name} ${String(r.teamSlug)} / ${String(r.fullName)}`, season: f?.season, team: r.teamSlug, athleteId: r.athleteId, playerId: r.playerId });
            }
          }
        }
        const overlay = read(`${dir}/rosters-enrichment.json`);
        for (const t of ((overlay?.teams as Rec[] | undefined) ?? [])) {
          for (const r of ((t.players as Rec[] | undefined) ?? [])) {
            records.push({ where: `rosters-enrichment.json ${String(t.slug)} / ${String(r.fullName)}`, season: overlay?.season, team: t.slug, athleteId: r.athleteId, playerId: r.playerId });
          }
        }
        for (const r of records) {
          expect(r.playerId, `${r.where} has no playerId: run pnpm build-players`).toBeTypeOf('string');
          const expected = index.byAthlete.get(`${sport} ${String(r.season)} ${String(r.team)} ${String(r.athleteId)}`);
          // A row the registry has not seen yet (it lags a roster refresh) is not a failure; a row it
          // has seen under another player is.
          if (expected !== undefined) expect(byId.get(r.playerId as string)?.id, r.where).toBe(expected);
          else expect(byId.has(r.playerId as string), `${r.where}: ${String(r.playerId)} is not a player`).toBe(true);
        }

        const profiles = read(`${dir}/jv-profiles.json`);
        for (const t of ((profiles?.teams as Rec[] | undefined) ?? [])) {
          for (const r of ((t.players as Rec[] | undefined) ?? [])) {
            const where = `jv-profiles.json ${String(t.slug)} / ${String(r.name)}`;
            expect(r.playerId, `${where} has no playerId: run pnpm build-players`).toBeTypeOf('string');
            const player = byId.get(r.playerId as string);
            expect(player, `${where}: ${String(r.playerId)} is not a player`).toBeDefined();
            expect(player?.names.map(nameKey), where).toContain(nameKey(String(r.name)));
          }
        }
      });

      it(`${sport}: stamping again changes nothing`, () => {
        const { changed, unplaced } = stampCuratedFiles(ROOT, sport, index);
        expect([...changed.keys()]).toEqual([]);
        expect(unplaced).toEqual([]);
      });
    }
  });
});

// ---------------------------------------------------------------- internal only

describe('the registry is internal', () => {
  /** The registry's own modules: nothing the site renders may load them. */
  const INTERNAL = ['lib/players/registry-build', 'lib/players/registry-file', 'lib/players/registry-sources', 'lib/players/registry-schema', 'lib/players/prior-players-schema'];

  function resolve(spec: string, fromFile: string): Target {
    const base = specifierBase(spec, fromFile, ROOT);
    if (base === null) return { kind: 'external' };
    const rel = repoPath(base, ROOT).replace(/\.(ts|tsx|js|mjs|jsx)$/, '');
    if (INTERNAL.includes(rel)) return { kind: 'banned', name: rel };
    const file = resolveFile(base);
    return file ? { kind: 'file', file } : { kind: 'external' };
  }

  it('no module under app/ or components/ reaches the registry, and none names its file', () => {
    const site = [...sourceFiles(path.join(ROOT, 'app')), ...sourceFiles(path.join(ROOT, 'components'))].sort();
    for (const file of site) {
      expect(bannedChain(file, ROOT, resolve), repoPath(file, ROOT)).toBeNull();
      const text = readFileSync(file, 'utf8');
      expect(/players\.json|player-identity\.json|prior-players\.json/.test(text), repoPath(file, ROOT)).toBe(false);
    }
  });

  it('no other module under lib/ loads the registry\'s files, by any means', () => {
    const OWN = new Set(INTERNAL.map((m) => `${m}.ts`));
    const FILES = /players\.json|player-identity\.json|prior-players\.json/;
    const LOADS = /\b(import|require|readFile|readFileSync|createReadStream|fetch|join|resolve)\b/;
    for (const file of sourceFiles(path.join(ROOT, 'lib'))) {
      const rel = repoPath(file, ROOT);
      if (OWN.has(rel)) continue;
      const text = readFileSync(file, 'utf8');
      // A comment may name the file; a line that names it and loads something may not.
      const loading = text.split('\n').filter((line) => FILES.test(line) && LOADS.test(line.replace(/^\s*(\*|\/\/).*$/, '')));
      expect(loading, rel).toEqual([]);
      // …and the one module that knows where the files are is the registry's own.
      expect(/registry-file['"]/.test(text), rel).toBe(false);
    }
  });
});

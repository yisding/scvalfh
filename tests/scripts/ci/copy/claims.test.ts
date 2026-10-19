/**
 * scripts/ci/copy/copy-rules.ts: the claims scripts/ci/assert-copy.ts holds every built page to: nothing claims
 * rosters or player stats are SCVAL-only now that they cover every league, the five EAL claims no page makes (the
 * umpires' grid called official, Davis or Bella Vista called Northern Section schools, Red Bluff's status overstated,
 * "EAL school", a seed word), and the Southern California sections' own ("Sunset League", "Sunset school", "rules
 * require"); the league config's own strings are held to the same rules.
 */

import { describe, expect, it } from 'vitest';

import { LEAGUES, getLeague } from '@/lib/config/leagues';
import {
  EAL_SCHOOL_CLAIM, RED_BLUFF_STATUS_CLAIM, RULES_REQUIRE_CLAIM, SCVAL_ONLY_CLAIM, SEED_CLAIM, SUNSET_LEAGUE_CLAIM,
  SUNSET_SCHOOL_CLAIM, UMPIRE_OFFICIAL_CLAIM, nonMemberSectionClaims, sunsetLeagueClaims, umpireOfficialClaims,
} from '@/scripts/ci/copy/copy-rules';
import { SITE_SCOPE_NOTE } from '@/views/site/site';

describe('SCVAL_ONLY_CLAIM', () => {
  it.each([
    'Rosters are SCVAL-only.',
    'Player stats: SCVAL only for now.',
    'SCVAL only has rosters at the moment',
    'Only SCVAL teams have rosters.',
    'Only the SCVAL has player stats',
    'Rosters (SCVAL)',
    'player stats (SCVAL teams)',
    'Rosters for SCVAL teams only',
    '<p>Player stats are only for SCVAL.</p>',
    'SCVAL-only: rosters and the like',
  ])('flags %j', (text) => {
    expect(text).toMatch(SCVAL_ONLY_CLAIM);
  });

  it.each([
    'Rosters and player stats for all five leagues.',
    'The 2025-26 history is SCVAL only.',
    '<p>SCVAL only</p><p>Rosters for every team</p>',
    'Rosters from MaxPreps. SCVAL standings come from the official PDFs.',
    'Player stats: not every coach enters them.',
  ])('lets %j through', (text) => {
    expect(text).not.toMatch(SCVAL_ONLY_CLAIM);
  });

  it('does not pair a subject and a claim more than 120 characters apart', () => {
    const far = `Rosters ${'x'.repeat(130)} SCVAL-only`;
    expect(far).not.toMatch(SCVAL_ONLY_CLAIM);
  });
});

describe('UMPIRE_OFFICIAL_CLAIM / umpireOfficialClaims: the umpires’ grid is never official', () => {
  it.each([
    'The official schedule is the umpires’ grid.',
    'Umpire assignments come from the official EAL schedule.',
    'See the EAL/SRL umpires’ site for the Official 2026 grid',
    'The grid at fieldhockeyumpires.org is official',
    'fieldhockeyumpires.org posts the official EAL grid',
  ])('flags %j', (text) => {
    expect(text).toMatch(UMPIRE_OFFICIAL_CLAIM);
    expect(umpireOfficialClaims(text)).toHaveLength(1);
  });

  it.each([
    'The EAL publishes no official schedule. Its 2026 grid is posted on the umpires’ site.',
    'No official schedule document.\nThe league grid posted on the EAL/SRL umpires’ site matches MaxPreps.',
    'Official sources: the Guidelines (PDF)!  Umpires post a grid',
    'An umpire made the call.',
    'No official schedule. fieldhockeyumpires.org posts a grid.',
  ])('lets %j through: the two words are in different sentences, or only one is there', (text) => {
    expect(umpireOfficialClaims(text)).toEqual([]);
  });

  it.each([
    'The umpires’ grid is not official.',
    "The umpires' grid isn't official",
    'The umpires’ grid isn’t an official schedule.',
    'The umpires’ grid is no official document.',
    'The umpires’ grid has never been official.',
    'The umpires’ grid is not the official schedule.',
    'The EAL publishes no official schedule; the umpires’ grid matches MaxPreps game for game.',
    'The umpires’ grid, though not official, matches MaxPreps.',
    'The grid on the umpires’ site is never called official here.',
    'The umpires’ grid is not called official anywhere on this site.',
  ])('lets %j through: a negation directly governs every "official"', (text) => {
    expect(text, 'the lexical half still sees both words').toMatch(UMPIRE_OFFICIAL_CLAIM);
    expect(umpireOfficialClaims(text)).toEqual([]);
  });

  it.each([
    // The negation governs a word other than "official".
    'The umpires’ grid is not only official but complete.',
    'The umpires’ grid is not just official.',
    'Use the official grid, not the umpires’.',
    'The official schedule is not the umpires’ grid.',
    // A negation in another clause, or one "official" negated and another not.
    'The league does not post it, and the umpires’ grid is official.',
    'The umpires’ grid is not official, but it is the official record.',
    // A negation word that is not right before it.
    'There is no doubt the umpires’ grid is official.',
    // "If not" asserts it.
    'The umpires’ grid is nothing if not official.',
  ])('still flags %j: no negation directly governs an "official" in it', (text) => {
    expect(umpireOfficialClaims(text)).toHaveLength(1);
  });

  it.each([
    'MaxPreps is not official, but the umpires’ grid is.',
    'The league schedule is not official; the umpires’ grid is.',
    'The league schedule is not official — the umpires’ grid is!',
    'MaxPreps is not official, yet the umpires’ grid is official enough',
    'The league schedule is not official, whereas the umpires’ grid has been',
    'The league schedule is not official, but the umpires’ grid is one.',
    'MaxPreps is not official, and so is not the umpires’ grid, unlike the league’s',
    // Honest, but a lexical rule cannot tell what follows the contrast: the copy says it in two sentences.
    'The umpires’ grid is not official, though it matches MaxPreps.',
  ])('still flags %j: what follows the negation says it again of something else', (text) => {
    expect(umpireOfficialClaims(text)).toHaveLength(1);
  });

  it.each([
    'The umpires’ grid is not official. It matches MaxPreps game for game.',
    'The umpires’ grid is not official, and neither is MaxPreps.',
    'The umpires’ grid is not official, nor is MaxPreps.',
  ])('lets %j through: nothing after the negation reopens it', (text) => {
    expect(umpireOfficialClaims(text)).toEqual([]);
  });
});

describe('nonMemberSectionClaims: Davis and Bella Vista are not Northern Section schools', () => {
  it.each([
    'Davis is a Northern Section school.',
    'Bella Vista and Chico are Northern Section members',
    'The six Northern Section schools, Davis among them, play ten games',
  ])('flags %j', (text) => {
    expect(nonMemberSectionClaims(text)).toHaveLength(1);
  });

  it.each([
    'Chico, Corning, Lassen and Pleasant Valley are Northern Section schools; Davis and Bella Vista are Sac-Joaquin Section schools that play field hockey in the EAL.',
    'Davis plays in the EAL. Chico is a Northern Section school.',
    'Davisville is a Northern Section school',
    'Davis: Northern Section postseason',
  ])('lets %j through', (text) => {
    expect(nonMemberSectionClaims(text)).toEqual([]);
  });

  it.each([
    'Davis is an NS school.',
    'Bella Vista is a CIF-NS member',
    'Davis is a CIF NS school',
    'Davis is a CIF Northern Section school',
    'Davis is a Northern Section team',
    'Davis and Bella Vista are Northern Section teams',
    'Bella Vista is an NS-member school',
    'Davis is a member of the Northern Section',
    'Bella Vista is one of the members of CIF-NS',
    'Davis is a northern section school',
    'Davis is a Northern Section high school',
    'Davis is a member school of the Northern Section',
    'Bella Vista is one of the member teams of the NS',
    'Davis is a Northern-Section school',
    'Davis is one of the Northern Section’s schools',
    'Davis is an NS program',
    'Davis is a CIF–NS member',
    'Bella Vista is a CIF‑NS team',
    'Davis is a CIF-Northern Section school',
  ])('flags the variant %j', (text) => {
    expect(nonMemberSectionClaims(text)).toHaveLength(1);
  });

  it.each([
    'Davis and Bella Vista are not Northern Section schools.',
    'Davis is not an NS school',
    'Bella Vista isn’t a CIF-NS member',
    "Davis isn't a Northern Section team",
    'Davis is no Northern Section member',
    'Davis has never been a Northern Section school',
    'Bella Vista is not one of the Northern Section schools',
    'Davis is not a member of the Northern Section',
    'Davis, a Sac-Joaquin school, is not a Northern Section school; Chico is a Northern Section school',
    'Davis isn’t a CIF–NS member',
    'Davis is not a Northern Section high school',
    'Bella Vista is not a member school of the Northern Section',
    'Davis is not one of the Northern Section’s schools',
    'Davis is not an NS program',
    'Davis is not an NS school, nor is Bella Vista.',
  ])('lets the negation %j through', (text) => {
    expect(nonMemberSectionClaims(text)).toEqual([]);
  });

  it.each([
    // The negation governs something other than the claim.
    'Davis is not only a Northern Section school',
    'Chico, not Davis, is a Northern Section school',
    'Davis is not in the Sac-Joaquin Section but a Northern Section school',
    // One claim negated, another in the same clause not.
    'Davis is not a CIF-NS member, but it is a Northern Section team',
    // A negation word that is not right before it.
    'There is no question Davis is a Northern Section school',
    // "If not" asserts it.
    'Davis is nothing if not a Northern Section school',
  ])('still flags %j: no negation directly governs the claim', (text) => {
    expect(nonMemberSectionClaims(text)).toHaveLength(1);
  });

  it.each([
    'Bella Vista is not a Northern Section school, but Davis is.',
    'Bella Vista is not a Northern Section school; Davis is.',
    'Bella Vista is not an NS school, while Davis is',
    'Bella Vista is not a CIF-NS member, though Davis has been for years',
    'Bella Vista is not a Northern Section school, and Davis is too.',
    'Bella Vista is not a Northern Section school, unlike Davis',
  ])('still flags %j: what follows the negation says it again of something else', (text) => {
    expect(nonMemberSectionClaims(text)).toHaveLength(1);
  });

  it.each([
    'Davis plays the NS champion',
    'Davis: CIF-NS Guidelines §VII.E.4',
    'Bella Vista plays under the Northern Section’s Guidelines',
    'Davis transcribes a ns schoolbook',
  ])('lets %j through: the Section named, no membership claimed', (text) => {
    expect(nonMemberSectionClaims(text)).toEqual([]);
  });

  it.each([
    'Davis defeated a Northern Section team.',
    'Bella Vista beat a Northern Section program 2-1.',
    'Davis played three Northern Section teams',
    'Davis plays Chico, a Northern Section school, on Friday',
    'A Northern Section team beat Davis',
    'Davis hosts NS members Chico and Lassen',
  ])('lets %j through: the membership phrase is about an opponent, not Davis or Bella Vista', (text) => {
    expect(nonMemberSectionClaims(text)).toEqual([]);
  });

  it.each([
    'Davis, a Northern Section school, hosts Chico',
    'Davis, which is a Northern Section team, hosts Chico',
    'Davis, not Chico, is an NS school',
    'Chico, Davis and Lassen are Northern Section members',
    'Northern Section schools such as Davis play ten games',
    'The Northern Section teams Davis and Bella Vista meet on Friday',
    'Davis has been a member of the Northern Section since 2019',
  ])('flags %j: the membership phrase is said of Davis or Bella Vista', (text) => {
    expect(nonMemberSectionClaims(text)).toHaveLength(1);
  });

  it('returns each offending clause', () => {
    expect(nonMemberSectionClaims('Chico plays; Davis is a Northern Section member. Bella Vista is a Northern Section school')).toEqual([
      'Davis is a Northern Section member',
      'Bella Vista is a Northern Section school',
    ]);
  });
});

describe('RED_BLUFF_STATUS_CLAIM: Red Bluff is only "not fielding a varsity team in 2026"', () => {
  it.each([
    'Red Bluff cancelled its season.',
    'Red Bluff’s 2026 games were canceled',
    'Red Bluff withdrew from the EAL',
    'Red Bluff has withdrawn',
    'Red Bluff dropped field hockey',
    'Red Bluff has no program',
    'Red Bluff, which has no field hockey program',
  ])('flags %j', (text) => {
    expect(text).toMatch(RED_BLUFF_STATUS_CLAIM);
  });

  it.each([
    'MaxPreps also lists Red Bluff, which is not fielding a varsity team in 2026.',
    'Red Bluff is not fielding a varsity team in 2026. Two games were cancelled for smoke.',
    'Red Bluff: a 0-0-0 row; the game was cancelled',
    `Red Bluff ${'x'.repeat(90)} cancelled`,
  ])('lets %j through', (text) => {
    expect(text).not.toMatch(RED_BLUFF_STATUS_CLAIM);
  });
});

describe('EAL_SCHOOL_CLAIM: never "EAL school(s)" or "EAL member(s)"', () => {
  it.each(['the six EAL schools', 'an EAL school', 'Eastern Athletic League members', 'every EAL member'])('flags %j', (text) => {
    expect(text).toMatch(EAL_SCHOOL_CLAIM);
  });

  it.each([
    'the six EAL teams',
    'the top six EAL/SRL schools compete',
    'Davis and Bella Vista play field hockey in the EAL',
    'EAL schooling', // not the word
    'eal schools', // case-sensitive, as the names are
  ])('lets %j through', (text) => {
    expect(text).not.toMatch(EAL_SCHOOL_CLAIM);
  });
});

describe('SEED_CLAIM: no seed word on an EAL page', () => {
  it.each(['the 1st seed', 'No. 2 seed', 'No.3 seeded', 'the top seed', 'First seed', 'second seeded', 'the 4th Seed'])(
    'flags %j',
    (text) => {
      expect(text).toMatch(SEED_CLAIM);
    },
  );

  // The Super Regional takes six teams, so "third" to "sixth" are the likely words.
  it.each([
    'the third seed',
    'Chico is the fourth seed',
    'the fifth seed',
    'sixth seed',
    'the last seed',
    'the lowest seed',
    'the highest seed',
    'the bottom seed',
    'the #1 seed',
    'a 1-seed',
    'the 2 seed',
    'top-seeded Chico',
    'the top seeds',
    'seed No. 1',
    'seed #3',
    'seeded 2',
    'seeded first',
    'seeded sixth',
    'seeded 3rd',
  ])('flags %j', (text) => {
    expect(text).toMatch(SEED_CLAIM);
  });

  it.each([
    'Seeding will be based on League record — quoted as written; this site does not apply it',
    'the top six qualify',
    'seeds are set by the coaches',
    'topseed',
    'the 2026 seeding criteria',
    'Super Regional seeding (§III.E.1)',
    'seeded by the coaches',
    'seedless',
  ])('lets %j through', (text) => {
    expect(text).not.toMatch(SEED_CLAIM);
  });
});

describe('the EAL’s own config strings pass all five rules', () => {
  const eal = getLeague('eal');
  const ps = eal.postseason;
  const strings: Array<[string, string]> = [['membershipNote', eal.membershipNote ?? '']];
  for (const d of eal.divisions) {
    if (d.official.mode === 'none') strings.push([`${d.id} official.note`, d.official.note]);
    if (d.knownCause) strings.push([`${d.id} knownCause`, d.knownCause]);
  }
  if (ps.kind === 'unbracketed-tournament') {
    strings.push(['postseason note', ps.note]);
    for (const [k, v] of Object.entries(ps.citations)) strings.push([`postseason citations.${k}`, v]);
  }
  // The rules' citations: stages['no-rule'] is the standings footnote on every EAL tie.
  const { stages, ...cites } = eal.rules.citations;
  for (const [k, v] of Object.entries(cites)) if (v !== undefined) strings.push([`rules citations.${k}`, v]);
  for (const [k, v] of Object.entries(stages)) strings.push([`rules citations.stages.${k}`, v ?? '']);

  it('collects them all', () => {
    expect(ps.kind).toBe('unbracketed-tournament');
    expect(strings.map(([k]) => k)).toEqual([
      'membershipNote',
      'eal official.note',
      'eal knownCause',
      'postseason note',
      'postseason citations.qualification',
      'postseason citations.format',
      'postseason citations.seeding',
      'postseason citations.eligibility',
      'postseason citations.noFurtherPath',
      'rules citations.points',
      'rules citations.pointsShort',
      'rules citations.order',
      'rules citations.doubleRoundRobin',
      'rules citations.overtime',
      'rules citations.coChampions',
      'rules citations.stages.no-rule',
    ]);
    expect(strings.every(([, v]) => v.length > 0)).toBe(true);
  });

  it('and each passes', () => {
    for (const [what, text] of strings) {
      expect(umpireOfficialClaims(text), `${what}: umpires’ grid called official`).toEqual([]);
      expect(nonMemberSectionClaims(text), `${what}: Davis or Bella Vista called a Northern Section school`).toEqual([]);
      expect(text, `${what}: Red Bluff's status`).not.toMatch(RED_BLUFF_STATUS_CLAIM);
      expect(text, `${what}: "EAL school"`).not.toMatch(EAL_SCHOOL_CLAIM);
      expect(text, `${what}: a seed word`).not.toMatch(SEED_CLAIM);
    }
  });

  it('is a real test: the strings name what the rules look for', () => {
    const all = strings.map(([, v]) => v).join('\n');
    expect(all).toMatch(/umpire/i);
    expect(all).toMatch(/Davis/);
    expect(all).toMatch(/Northern Section schools/);
    expect(all).toMatch(/Red Bluff/);
    expect(all).toMatch(/Seeding/);
  });
});

// ---------------------------------------------------------------- the SoCal leagues (DESIGN-socal §2.4)

describe('sunsetLeagueClaims / SUNSET_LEAGUE_CLAIM: "Sunset League" only beside "all-sports"', () => {
  it.each([
    'Huntington Beach plays in the Sunset League.',
    'The Sunset League standings.',
    'Ten teams. Sunset League rules apply',
    'Sunset League champions',
  ])('flags %j', (text) => {
    expect(sunsetLeagueClaims(text)).not.toEqual([]);
  });

  it.each([
    'The Sunset here is a field hockey grouping of ten Southern Section schools in Orange, Los Angeles and Riverside counties, not the all-sports Sunset League.',
    'the Southern Section’s Sunset field hockey league',
    'Teams have played between 2 and 7 of the games MaxPreps marks as Sunset league games.',
    'Sunset field hockey league',
    'Sunset co-leaders',
  ])('lets %j through', (text) => {
    expect(sunsetLeagueClaims(text)).toEqual([]);
  });

  it('reads sentence by sentence: an "all-sports" in another sentence excuses nothing', () => {
    expect(sunsetLeagueClaims('The all-sports league differs. Edison plays in the Sunset League.')).toEqual([
      'Edison plays in the Sunset League',
    ]);
    expect('Sunset League').toMatch(SUNSET_LEAGUE_CLAIM);
    expect('sunset league').not.toMatch(SUNSET_LEAGUE_CLAIM);
  });
});

describe('SUNSET_SCHOOL_CLAIM: never "Sunset school(s)" or "Sunset member(s)"', () => {
  it.each(['the ten Sunset schools', 'a Sunset school', 'every Sunset member', 'Sunset members'])('flags %j', (text) => {
    expect(text).toMatch(SUNSET_SCHOOL_CLAIM);
  });

  it.each(['the ten Sunset teams', 'Sunset schooling', 'sunset schools'])('lets %j through', (text) => {
    expect(text).not.toMatch(SUNSET_SCHOOL_CLAIM);
  });
});

describe('RULES_REQUIRE_CLAIM: never on an orderScope "site" league’s pages', () => {
  it('matches the order sentence of a league that publishes its rule, in any case', () => {
    expect('ordered by points, as SCVAL rules require').toMatch(RULES_REQUIRE_CLAIM);
    expect('Rules require a playoff').toMatch(RULES_REQUIRE_CLAIM);
    expect('The order is this site’s 3-1-0 points; no Sunset rule orders the table.').not.toMatch(RULES_REQUIRE_CLAIM);
  });
});

describe('the SoCal leagues’ own config strings pass every rule', () => {
  const strings: Array<[string, string]> = [];
  for (const league of LEAGUES.filter((l) => l.sectionId === 'ss' || l.sectionId === 'sds')) {
    const ps = league.postseason;
    if (league.membershipNote) strings.push([`${league.id} membershipNote`, league.membershipNote]);
    for (const d of league.divisions) {
      if (d.official.mode === 'none') strings.push([`${d.id} official.note`, d.official.note]);
      if (d.knownCause) strings.push([`${d.id} knownCause`, d.knownCause]);
    }
    if (ps.kind === 'no-postseason' || ps.kind === 'section-playoffs') {
      strings.push([`${league.id} postseason note`, ps.note]);
      for (const [k, v] of Object.entries(ps.citations)) strings.push([`${league.id} postseason citations.${k}`, v]);
      for (const rung of ps.ladder) {
        for (const k of ['label', 'phrase', 'badge', 'legend'] as const) strings.push([`${league.id} ladder ${k}`, rung[k]]);
      }
    }
    if (ps.kind === 'section-playoffs') strings.push([`${league.id} qualificationLine`, ps.qualificationLine]);
    const { stages, ...cites } = league.rules.citations;
    for (const [k, v] of Object.entries(cites)) if (v !== undefined) strings.push([`${league.id} rules citations.${k}`, v]);
    for (const [k, v] of Object.entries(stages)) strings.push([`${league.id} rules citations.stages.${k}`, v ?? '']);
  }
  strings.push(['SITE_SCOPE_NOTE', SITE_SCOPE_NOTE]);

  it('collects the four leagues and the independents', () => {
    expect(new Set(strings.map(([k]) => k.split(' ')[0]))).toEqual(
      new Set(['sunset', 'city-western', 'city-eastern', 'city', 'avocado', 'palomar', 'valley', 'north-county', 'metro-mesa', 'metro-south-bay', 'metro', 'independents', 'SITE_SCOPE_NOTE']),
    );
  });

  it('and each passes: no "Sunset League" outside "all-sports", no "Sunset school", no seed word, no "rules require", no CCS words', () => {
    for (const [what, text] of strings) {
      expect(sunsetLeagueClaims(text), `${what}: "Sunset League"`).toEqual([]);
      expect(text, `${what}: "Sunset school"`).not.toMatch(SUNSET_SCHOOL_CLAIM);
      expect(text, `${what}: a seed word`).not.toMatch(SEED_CLAIM);
      expect(text, `${what}: "rules require"`).not.toMatch(RULES_REQUIRE_CLAIM);
      expect(text, `${what}: a CCS word`).not.toMatch(/automatic qualifier|at-large|eliminat/i);
      expect(umpireOfficialClaims(text), `${what}: umpire/official in one sentence`).toEqual([]);
    }
  });

  it('is a real test: the strings name what the rules look for', () => {
    const all = strings.map(([, v]) => v).join('\n');
    expect(all).toMatch(/all-sports Sunset League/);
    expect(all).toMatch(/seeding/i);
    expect(all).toMatch(/Sunset/);
  });
});

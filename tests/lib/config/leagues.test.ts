/**
 * lib/config/leagues.ts: the §2.3 helpers and lookups, the SCVAL strings that must stay byte-identical to
 * today's, the EAL, the Southern California amendment's four leagues (DESIGN-socal §2.1) and the LA independents,
 * their copy held to the site's honesty rules. Its siblings: leagues/assert (the §2.4 invariants), leagues/regions
 * (regions, sections, the shared helpers) and leagues/labels (division and league wording).
 */

import { describe, expect, it } from 'vitest';

import { ConfigInvariantError } from '@/lib/config/invariant';
import {
  ALL_DIVISIONS, CCS, CCS_LEAGUE_IDS, DATA_QUALITY, INDEPENDENT_LEAGUES, LEAGUES, LEAGUES_PROPER, LEAGUE_IDS,
  NO_POSTSEASON_LEAGUE_IDS, SECTIONS, SECTION_PLAYOFFS_LEAGUE_IDS, TOURNAMENT_LEAGUE_IDS, UNBRACKETED_LEAGUE_IDS,
  divisionsOf, drawNumberOf, findDivision, findLeague, getDivision, getLeague, getSection, isIndependentDivision,
  isIndependentLeague, isLeagueId, isSingleDivision, ladderFor, ladderRung, leagueOfDivision, leaguePlayEnds,
  leaguePlayStarts, leagueStandingsUrl, seasonWindowBounds, sectionOf, statusesOf, tiebreakChainFor,
} from '@/lib/config/leagues';
import { divisionDisplay, divisionHeading, standingsLabel } from '@/lib/config/leagues/labels';
import { CCS_BRACKET_URL } from '@/lib/config/season';
import { getTeamById } from '@/lib/registry/teams';
import { SEED_CLAIM, umpireOfficialClaims } from '@/scripts/ci/copy/copy-rules';
import { renderedStrings, SOCAL_IDS, socal, expectViolation } from '@/tests/support/leagues';

describe('leagues: ids and helpers (SPEC §2.3)', () => {
  it('configures the nine leagues and the independents in order: NorCal first; one bracketed tournament, one unbracketed, two without a postseason, three section playoffs', () => {
    expect(LEAGUE_IDS).toEqual(['scval', 'bval', 'pcal', 'mcal', 'eal', 'sunset', 'city', 'north-county', 'metro', 'independents']);
    // The LA independents are a group, not a league (their table counts their games against each other): every count
    // of leagues leaves them out.
    expect(LEAGUES_PROPER.map((l) => l.id)).toEqual(['scval', 'bval', 'pcal', 'mcal', 'eal', 'sunset', 'city', 'north-county', 'metro']);
    expect(INDEPENDENT_LEAGUES.map((l) => l.id)).toEqual(['independents']);
    expect(LEAGUE_IDS.filter(isIndependentLeague)).toEqual(['independents']);
    expect(isIndependentDivision('independents')).toBe(true);
    expect(isIndependentDivision('sunset')).toBe(false);
    expect(CCS_LEAGUE_IDS).toEqual(['scval', 'bval', 'pcal']);
    expect(TOURNAMENT_LEAGUE_IDS).toEqual(['mcal']);
    expect(UNBRACKETED_LEAGUE_IDS).toEqual(['eal']);
    expect(NO_POSTSEASON_LEAGUE_IDS).toEqual(['sunset', 'independents']);
    expect(SECTION_PLAYOFFS_LEAGUE_IDS).toEqual(['city', 'north-county', 'metro']);
    expect(ALL_DIVISIONS.map((d) => d.id)).toEqual([
      'de-anza', 'el-camino', 'mt-hamilton', 'santa-teresa', 'pcal', 'marin-county', 'eal',
      'sunset', 'city-western', 'city-eastern', 'avocado', 'palomar', 'valley', 'metro-mesa', 'metro-south-bay',
      'independents',
    ]);
    expect(SECTIONS.map((s) => s.id)).toEqual(['ccs', 'ncs', 'ns', 'ss', 'sds']);
    expect(SECTIONS.map((s) => s.shortName)).toEqual(['CCS', 'NCS', 'NS', 'SS', 'SDS']);
    expect(SECTIONS.map((s) => s.briefLabel)).toEqual(['CCS', 'NCS', 'Northern Section', 'Southern Section', 'San Diego Section']);
    // Sixteen divisions' worth of teams: 49 NorCal + 53 SoCal (the 48 league teams and the five independents) = 102.
    expect(ALL_DIVISIONS.reduce((n, d) => n + d.expectedTeams, 0)).toBe(102);
  });

  it('looks things up, and throws on an unknown id', () => {
    expect(getLeague('bval').shortName).toBe('BVAL');
    expect(findLeague('nope')).toBeUndefined();
    expect(isLeagueId('mcal')).toBe(true);
    expect(isLeagueId('marin-county')).toBe(false);
    expect(getDivision('santa-teresa').leagueId).toBe('bval');
    expect(findDivision('gabilan')).toBeUndefined();
    expect(leagueOfDivision('pcal').id).toBe('pcal');
    expect(divisionsOf('scval').map((d) => d.id)).toEqual(['de-anza', 'el-camino']);
    expect(getSection('ncs').holdsFieldHockeyChampionship).toBe(false);
    expect(sectionOf('mcal').id).toBe('ncs');
    expect(sectionOf('pcal').id).toBe('ccs');
    expect(sectionOf('eal').id).toBe('ns');
    expect(getSection('ns')).toMatchObject({
      name: 'Northern Section', shortName: 'NS', holdsFieldHockeyChampionship: true,
      officialUrl: 'https://www.cifns.org/sports/fh/index', noChampionshipNote: null,
    });
    expect(getDivision('eal').leagueId).toBe('eal');
    expect(() => getLeague('nope')).toThrow(/lib\/config\/leagues\.ts/);
    expect(() => getDivision('nope')).toThrow(/lib\/config\/leagues\.ts/);
    expect(() => getSection('xyz' as 'ccs')).toThrow(/lib\/config\/leagues\.ts/);
    expect(() => getLeague('nope')).toThrow(ConfigInvariantError);
    expect(() => getDivision('nope')).toThrow(ConfigInvariantError);
    expect(() => getSection('xyz' as 'ccs')).toThrow(ConfigInvariantError);
  });

  it('builds no MaxPreps URL for a division MaxPreps has no table for, and keeps MaxPreps’ own table names', () => {
    expect(leagueStandingsUrl('valley')).toBeNull();
    expect(leagueStandingsUrl('metro-mesa')).toBe(
      'https://www.maxpreps.com/ca/field-hockey/26-27/league/metro-south-bay/?leagueid=6dfe5a12-b82f-45d7-b103-71a5c13c0093',
    );
    expect(leagueStandingsUrl('sunset')).toBe(
      'https://www.maxpreps.com/ca/field-hockey/26-27/league/sunset/?leagueid=aa46adc4-c188-4e3b-b5fd-857064176297',
    );
    for (const d of ALL_DIVISIONS) {
      const url = leagueStandingsUrl(d.id);
      if (url !== null) expect(url, d.id).not.toMatch(/null/);
      expect(url === null, d.id).toBe(d.maxprepsLeagueId === null);
    }
  });

  it("keeps today's MaxPreps standings URLs for De Anza and El Camino", () => {
    expect(leagueStandingsUrl('de-anza')).toBe(
      'https://www.maxpreps.com/ca/field-hockey/26-27/league/santa-clara-valley--de-anza/?leagueid=ea062dfe-9fb9-45c7-9839-0801993d6ac6',
    );
    expect(leagueStandingsUrl('el-camino')).toBe(
      'https://www.maxpreps.com/ca/field-hockey/26-27/league/santa-clara-valley--el-camino/?leagueid=7bdfb2a7-8dde-4a21-88c9-832f1593554d',
    );
    expect(leagueStandingsUrl('pcal')).toBe(
      'https://www.maxpreps.com/ca/field-hockey/26-27/league/pacific-coast--gabilan/?leagueid=50ac53cd-e46f-4df9-824b-5a954c583b95',
    );
    expect(leagueStandingsUrl('eal')).toBe(
      'https://www.maxpreps.com/ca/field-hockey/26-27/league/eastern-athletic/?leagueid=60959b47-b0cf-4d7d-b054-d8ea140870ef',
    );
  });

  it('reads ladders, chains, statuses and dates', () => {
    expect(ladderRung('de-anza', 4).status).toBe('play-in');
    expect(ladderRung('el-camino', 8).status).toBe('out');
    expect(ladderRung('santa-teresa', 1).badge).toBe('Play-in host');
    expect(ladderRung('mt-hamilton', 5).status).toBe('no-aq-route');
    expect(ladderRung('marin-county', 6).status).toBe('tournament');
    expect(ladderRung('marin-county', 120).status).toBe('below-line');
    expect(ladderFor('santa-teresa').map((r) => r.status)).toEqual(['play-in', 'no-aq-route']);
    expect(statusesOf('scval')).toEqual(['aq', 'play-in', 'at-large', 'out']);
    expect(statusesOf('bval')).toEqual(['aq', 'play-in', 'no-aq-route']);
    expect(statusesOf('mcal')).toEqual(['bye', 'tournament', 'below-line']);
    expect(statusesOf('eal')).toEqual(['tournament', 'below-line']);
    expect(statusesOf('sunset')).toEqual(['no-postseason']);
    for (const id of ['city', 'north-county', 'metro']) expect(statusesOf(id), id).toEqual(['tournament', 'selection']);
    expect(ladderRung('sunset', 1).label).toBe('No section playoffs');
    expect(ladderRung('sunset', 10).status).toBe('no-postseason');
    expect(ladderRung('city-western', 1).badge).toBe('1st');
    expect(ladderRung('valley', 2).status).toBe('selection');
    expect(tiebreakChainFor('sunset', 1)).toEqual(['no-rule']);
    expect(tiebreakChainFor('metro-mesa', 2)).toEqual(['no-rule']);
    expect(ladderRung('eal', 6).label).toBe('Super Regional place');
    expect(ladderRung('eal', 7).status).toBe('below-line');
    expect(tiebreakChainFor('eal', 1)).toEqual(['no-rule']);
    expect(tiebreakChainFor('pcal', 1)).toEqual(['head-to-head', 'record-vs-lower-placed', 'ccs-points']);
    expect(tiebreakChainFor('pcal', 2)).toEqual([
      'head-to-head', 'record-vs-higher-placed', 'record-vs-lower-placed', 'ccs-points',
    ]);
    expect(tiebreakChainFor('pcal', 3)).toEqual(['no-rule']);
    expect(tiebreakChainFor('de-anza', 5)).toEqual([
      'head-to-head', 'division-wins', 'h2h-goals-against', 'h2h-goal-diff', 'coin-flip',
    ]);
    expect(tiebreakChainFor('marin-county', 1)).toEqual(['h2h-win-pct', 'record-above-tie', 'draw-number']);
    expect(drawNumberOf(getLeague('mcal').rules, 'archie-williams')).toBe(1);
    expect(drawNumberOf(getLeague('mcal').rules, 'marin-academy')).toBe(9);
    // No fallback: a league without draw numbers, or a slug with none, is a caller's bug.
    expect(() => drawNumberOf(getLeague('scval').rules, 'archie-williams')).toThrow(/no draw number/);
    expect(() => drawNumberOf(getLeague('mcal').rules, 'homestead')).toThrow(/no draw number/);
    expect(leaguePlayEnds('scval')).toBe('2026-10-28');
    expect(leaguePlayEnds('bval')).toBe('2026-10-30');
    expect(leaguePlayEnds('mcal')).toBe('2026-10-22');
    expect(leaguePlayEnds('eal')).toBe('2026-10-28');
    expect(leaguePlayStarts('sunset')).toBe('2026-08-25');
    expect(leaguePlayEnds('sunset')).toBe('2026-10-31');
    expect(leaguePlayStarts('city')).toBe('2026-09-01');
    expect(leaguePlayStarts('north-county')).toBe('2026-09-09');
    expect(leaguePlayStarts('metro')).toBe('2026-09-28');
    for (const id of ['city', 'north-county', 'metro']) expect(leaguePlayEnds(id), id).toBe('2026-10-30');
    // The Northern, Southern and San Diego Sections' windows sit inside the union.
    expect(seasonWindowBounds()).toEqual({ start: '2026-08-01', end: '2026-11-30' });
  });

  it('sets the overtime rule, the order scope and the MCAL schedule-changes page', () => {
    expect(LEAGUES.map((l) => [l.id, l.rules.leagueOvertime])).toEqual([
      ['scval', 'sudden-victory'], ['bval', 'sudden-victory'], ['pcal', 'none'], ['mcal', 'none'], ['eal', 'shootout'],
      ['sunset', 'none'], ['city', 'shootout'], ['north-county', 'shootout'], ['metro', 'shootout'], ['independents', 'none'],
    ]);
    // Every NorCal league's own document orders its table by points, except the EAL's, which decides only the
    // title; no SoCal league publishes a points rule, so this site orders those tables itself.
    expect(LEAGUES.map((l) => [l.id, l.rules.orderScope])).toEqual([
      ['scval', 'table'], ['bval', 'table'], ['pcal', 'table'], ['mcal', 'table'], ['eal', 'title'],
      ['sunset', 'site'], ['city', 'site'], ['north-county', 'site'], ['metro', 'site'], ['independents', 'site'],
    ]);
    expect(LEAGUES.map((l) => [l.id, l.rules.classification])).toEqual([
      ['scval', 'contest-type'], ['bval', 'official-fixtures'], ['pcal', 'official-fixtures'], ['mcal', 'official-fixtures'],
      ['eal', 'contest-type'], ['sunset', 'membership'], ['city', 'membership'], ['north-county', 'membership'], ['metro', 'membership'],
      ['independents', 'membership'],
    ]);
    expect(LEAGUES.map((l) => [l.id, l.membershipNote === null])).toEqual([
      ['scval', true], ['bval', true], ['pcal', true], ['mcal', true], ['eal', false],
      ['sunset', false], ['city', true], ['north-county', true], ['metro', true], ['independents', false],
    ]);
    expect(LEAGUES.map((l) => [l.id, l.alignmentSource])).toEqual([
      ['scval', 'its official schedule'], ['bval', 'its official schedule'], ['pcal', 'its official schedule'],
      ['mcal', 'its official schedule'], ['eal', 'MaxPreps’ table and league flag'],
      ['sunset', 'MaxPreps’ 2024-25 and 2025-26 Sunset tables'], ['city', 'the CIF-SDS 2026-27 League Alignment'],
      ['north-county', 'the CIF-SDS 2026-27 League Alignment'], ['metro', 'the CIF-SDS 2026-27 League Alignment'],
      ['independents', 'MaxPreps’ 2026-27 team pages and schedules (five Southern Section schools in no field hockey league, which play each other)'],
    ]);
    // `region` was renamed `cities`; NorCal's words are unchanged.
    expect(LEAGUES.slice(0, 5).map((l) => l.cities)).toEqual([
      'Santa Clara County and San Francisco', 'San Jose, Campbell, Saratoga, Morgan Hill and Gilroy',
      'Monterey County and Hollister', 'Marin County, San Francisco and Berkeley', 'Chico, Corning, Susanville, Davis and Fair Oaks',
    ]);
    expect('region' in getLeague('scval')).toBe(false);
    expect(getLeague('mcal').officialChanges).toEqual({
      url: 'https://www.mcalsports.org/Schedir.htm',
      cellMarker: 'Girls Field Hockey:',
      sha256: 'b1e5c523b251021522a77ed459d5d7035fe0c9100cb2b727f1ea63c467566b76',
    });
    for (const id of ['scval', 'bval', 'pcal', 'eal', ...SOCAL_IDS]) expect(getLeague(id).officialChanges).toBeNull();
    expect(CCS.bracketUrl).toBe(CCS_BRACKET_URL);
  });
});

describe('leagues: SCVAL strings are today’s, verbatim', () => {
  const scval = getLeague('scval');

  it('cites Article VI exactly as BYLAW_CITATIONS did', () => {
    expect(scval.rules.citations).toEqual({
      points: 'SCVAL Field Hockey By-Laws 2026-27, Article VI §2 (3 points for a win, 1 for a tie)',
      pointsShort: 'Art. VI §2',
      order: 'SCVAL Field Hockey By-Laws 2026-27, Article VI §2 (standings are the order of points)',
      doubleRoundRobin: 'Article VI §1 (double round robin; division games only count to the division record)',
      overtime: 'Article IV (one 7-minute sudden-victory period; still tied ⇒ the game ends in a tie)',
      coChampions: 'Article VI §2 (a tie at the top means co-champions)',
      stages: {
        'head-to-head': 'Article VI §3 (better head-to-head record among the tied teams)',
        'division-wins': 'Article VI §4 (greater number of wins in division play)',
        'h2h-goals-against': 'Article VI §5 (least goals given up between the tied teams)',
        'h2h-goal-diff': 'Article VI §6 (goal differential between the tied teams)',
        'coin-flip': 'Article VI §7 (coin flip — we cannot compute it, so the teams stay tied)',
      },
    });
    expect(scval.rules.unresolvedSuffix).toBe('— Article VI §7 decides it with a coin flip');
    expect(scval.postseason.kind === 'ccs-ladder' && scval.postseason.citation).toBe(
      'Article VII §2 (first three in each division are automatic qualifiers; fourth place plays in for the SCVAL 7th AQ; the play-in loser and both fifth-place teams go to CCS for at-large consideration)',
    );
  });

  it('keeps the Article VII ladder and its four copy strings per rung', () => {
    expect(
      scval.postseason.ladder.map((r) => [r.places, r.status, r.label, r.phrase, r.badge, r.legend]),
    ).toEqual([
      [[1, 3], 'aq', 'Automatic qualifier', 'automatic qualifier', 'AQ', 'Places 1-3 — automatic CCS qualifier'],
      [[4, 4], 'play-in', 'Play-in game Oct 30', 'the Oct 30 play-in', 'Play-in', '4th place — play-in {date} for the SCVAL 7th berth'],
      [[5, 5], 'at-large', 'At-large consideration', 'at-large consideration', 'At-large', '5th place — submitted to CCS for at-large consideration'],
      [[6, 99], 'out', 'No automatic path', 'no automatic path', 'No AQ', '6th or lower — no automatic path'],
    ]);
  });

  it('keeps the Oct 30 crossover pairings and their labels', () => {
    if (scval.postseason.kind !== 'ccs-ladder') throw new Error('scval is a CCS ladder league');
    expect(
      scval.postseason.pairings.map((p) => [p.id, p.date, p.seats, p.seatLabels, p.host, p.isPlayIn, p.label, p.tag]),
    ).toEqual([1, 2, 3, 4].map((seed) => [
      `scval-crossover-${seed}`, '2026-10-30',
      [{ division: 'de-anza', place: seed }, { division: 'el-camino', place: seed }],
      [`De Anza #${seed}`, `El Camino #${seed}`], null, seed === 4,
      seed === 4
        ? 'De Anza #4 vs El Camino #4 — play-in for the SCVAL 7th automatic qualifier'
        : `De Anza #${seed} vs El Camino #${seed} — crossover (helps CCS ordering)`,
      'scval-crossover',
    ]));
  });

  it('keeps the CCS field and key dates', () => {
    expect(CCS.autoQualifiers).toEqual({ scval: 7, bval: 4, pcal: 2, atLarge: 3, total: 16 });
    expect(CCS.keyDates).toEqual({
      entriesDue: '2026-11-02T12:00:00', seedingMeeting: '2026-11-02T13:00:00',
      quarterfinals: '2026-11-07', semifinals: '2026-11-11', finals: '2026-11-14',
      evaluationMeeting: '2026-11-19T16:00:00', endOfLeagueSeason: '2026-10-31',
    });
  });
});

describe('leagues: the EAL (Northern Section)', () => {
  const eal = getLeague('eal');
  const division = getDivision('eal');

  it('classifies by MaxPreps’ league flag behind official mode none, and lists Red Bluff as an extra row', () => {
    expect(eal.rules.classification).toBe('contest-type');
    expect(eal.rules.excludeContestTypes).toEqual([2, 4, 5]);
    expect(eal.rules.postseasonFrom).toBe('2026-10-30');
    expect(division.official.mode).toBe('none');
    expect(division.official.mode === 'none' && division.official.note).toMatch(/^The EAL publishes no schedule or standings document of its own\./);
    expect([division.expectedTeams, division.gamesPerTeam, division.maxprepsTeamCount]).toEqual([6, 10, 7]);
    expect(division.leaguePlay).toEqual({ first: '2026-08-24', last: '2026-10-28' });
    expect(division.maxprepsExtraRows).toEqual({
      '4d3da788-bbe2-4ab9-b854-d95aa9786cda': 'Red Bluff: a 0-0-0 row with no games; not fielding a varsity team in 2026',
    });
    expect(division.reportedTrust).toBe('records-only');
    expect(division.ladderLine).toBeNull();
    expect(eal.withdrawnNames).toContain('Red Bluff');
  });

  it('is an unbracketed Super Regional for the top six, Oct 30-31', () => {
    if (eal.postseason.kind !== 'unbracketed-tournament') throw new Error('eal is an unbracketed tournament league');
    expect(eal.postseason).toMatchObject({
      name: 'Super Regional', qualifiers: 6, dates: { first: '2026-10-30', last: '2026-10-31' },
      sourceUrl: 'https://www.cifns.org/guidelines-playoffs-Divisions-archives/26-28_Guidelines/Field_Hockey_Guidelines_26-28.pdf',
    });
    expect(Object.keys(eal.postseason.citations).sort()).toEqual(['eligibility', 'format', 'noFurtherPath', 'qualification', 'seeding']);
    // §VII.J ties the deadline to "the Last contest of the season", one Section date, not each school's own last game.
    expect(eal.postseason.citations.eligibility).toMatch(/by noon the day after the last contest of the season is not eligible/);
    expect(eal.postseason.citations.eligibility).not.toMatch(/its last contest/);
    expect(eal.keyDates.map((k) => [k.id, k.date])).toEqual([['league-play-ends', '2026-10-28'], ['super-regional', '2026-10-30']]);
  });

  it('records Red Bluff as not covered and its si.com ids as ignored', () => {
    expect(DATA_QUALITY.notCovered.find((n) => n.name === 'Red Bluff')?.reason).toBe('Red Bluff is not fielding a varsity team in 2026.');
    for (const id of ['490259', '490260', '635037']) expect(DATA_QUALITY.sbliveIgnoredTeamIds[id], id).toBeTruthy();
  });

  it('never says a Red Bluff team was cancelled or withdrew', () => {
    const strings = [
      ...renderedStrings(eal), ...Object.values(DATA_QUALITY.sbliveIgnoredTeamIds),
      ...DATA_QUALITY.notCovered.map((n) => n.reason), ...Object.values(division.maxprepsExtraRows),
    ];
    for (const s of strings) expect(s, s).not.toMatch(/Red Bluff[^.;:]{0,80}\b(cancel\w*|withdr\w*|dropped|no (field hockey )?program)\b/i);
  });
});

describe('leagues: never configured, never rendered', () => {
  it('never configures Pacific Coast - Mission', () => {
    const mission = '6e1f97d4-5211-4d98-bf59-282cd754bc5c';
    expect(ALL_DIVISIONS.map((d) => d.maxprepsLeagueId)).not.toContain(mission);
    expect(ALL_DIVISIONS.map((d) => d.maxprepsName).join('|')).not.toMatch(/Mission/);
    expect(Object.keys(DATA_QUALITY.ignoredMaxprepsLeagueIds)).toContain(mission);
  });

  it('never puts "Gabilan" in a rendered string (it is data only, in maxprepsName/maxprepsSlug)', () => {
    for (const l of LEAGUES) {
      for (const s of renderedStrings(l)) expect(s, `${l.id}: ${s}`).not.toMatch(/gabilan/i);
    }
    for (const s of SECTIONS) expect(`${s.name} ${s.noChampionshipNote ?? ''}`).not.toMatch(/gabilan/i);
    expect(getDivision('pcal').maxprepsName).toBe('Pacific Coast - Gabilan');
  });

  it('never writes "eliminated"', () => {
    for (const l of LEAGUES) {
      for (const s of renderedStrings(l)) expect(s, `${l.id}: ${s}`).not.toMatch(/eliminat/i);
    }
  });
});

describe('leagues: the Sunset (Southern Section)', () => {
  const sunset = getLeague('sunset');
  const division = getDivision('sunset');

  it('is a field hockey grouping of ten, named apart from the all-sports Sunset League', () => {
    expect(sunset).toMatchObject({
      sectionId: 'ss', name: 'Sunset field hockey league', shortName: 'Sunset',
      cities: 'Huntington Beach, Newport Beach, Fountain Valley and Temecula',
      officialUrl: 'https://cifss.org/sports/field-hockey/',
      sblive: { leagueSlugs: ['4249-sunset'], backfill: true },
      withdrawnNames: [],
      membershipNote: 'The Sunset here is a field hockey grouping of eight Southern Section schools in Orange and Riverside counties, not the all-sports Sunset League.',
    });
    expect(isSingleDivision('sunset')).toBe(true);
    expect(divisionHeading('sunset')).toBeNull();
    expect(divisionDisplay('sunset')).toBe('Sunset');
    expect(division.searchAliases).toEqual(['Sunset']);
  });

  it('counts every game between two of the eight (membership), with no fixed schedule and a five-row MaxPreps table', () => {
    expect(sunset.rules).toMatchObject({
      classification: 'membership', excludeContestTypes: [2, 4], postseasonFrom: null, orderScope: 'site',
      gamesWord: 'league', matcher: 'two-phase', tiebreaks: { default: ['no-rule'] }, leagueOvertime: 'none',
      coChampionsLabel: 'Sunset co-leaders', unresolvedSuffix: '', drawNumbers: null, leagueGameOverrides: [],
    });
    expect(division).toMatchObject({
      expectedTeams: 8, gamesPerTeam: null, leaguePlay: { first: '2026-08-25', last: '2026-10-31' },
      maxprepsLeagueId: 'aa46adc4-c188-4e3b-b5fd-857064176297', maxprepsName: 'Sunset', maxprepsSlug: 'sunset',
      maxprepsTeamCount: 5, reportedTrust: 'informational', ladderLine: null,
      home: { miniRows: 8, lineAfter: null, lineLabel: null },
    });
    expect(division.maxprepsMissing).toEqual(['edison', 'fountain-valley', 'huntington-beach', 'marina', 'newport-harbor']);
    // MaxPreps' Sunset rows for the two independents (DESIGN §24.10): registry teams of another division, skipped.
    expect(Object.keys(division.maxprepsExtraRows).sort()).toEqual([
      '4c2dd7e8-2f3e-43aa-891b-9218932cdf9d', '742a32d0-2dc9-4aa8-ad92-8c4576f73a12',
    ]);
    expect(getTeamById('4c2dd7e8-2f3e-43aa-891b-9218932cdf9d')?.slug).toBe('bonita');
    expect(getTeamById('742a32d0-2dc9-4aa8-ad92-8c4576f73a12')?.slug).toBe('chaminade');
    expect(division.official.mode === 'none' && division.official.note).toBe(
      'No Sunset document exists that we could find: no league site, bylaws, schedule or standings. The eight teams here are eight of the ten in MaxPreps’ Sunset table in 2024-25 and 2025-26; the other two, Bonita and Chaminade, are listed with the LA independents (that group’s note says why). For 2026-27, MaxPreps’ table lists three of the eight, with Bonita and Chaminade, and assigns the five Orange County schools to no league; si.com’s table (also shown on the Southern Section’s scores site) lists six of the eight, with Bonita, Chaminade, and Westlake and Los Alamitos with no games, and puts Chaparral and Temecula Valley in a separate table. This site counts every game between two of the eight outside a tournament as a Sunset game, whether or not MaxPreps marks it as one: MaxPreps’ flag follows whoever entered the game (it marks one of Great Oak’s two games with Temecula Valley and none of the Orange County schools’ games against each other except Edison’s), so no two sources agree on a record. Teams play different numbers of games.',
    );
    expect(division.knownCause).toBe(
      'MaxPreps’ Sunset table lists three of the eight teams, with Bonita and Chaminade, counts only the games its scorekeepers flagged as league games, and orders them by winning percentage. This site counts every game between two of the eight, orders all eight by 3-1-0 points, and lists Bonita and Chaminade with the LA independents, so Great Oak’s Aug 27 win over Bonita, which MaxPreps counts, is not counted here. si.com uses its own league labels, so its Sunset records differ from both.',
    );
  });

  it('cites no league rule: the 3-1-0 order is this site’s, and the overtime citation names the Oct 2 overtime game', () => {
    expect(sunset.rules.citations).toEqual({
      points: 'this site’s 3-1-0 points (the league publishes no points rule)',
      pointsShort: 'site 3-1-0',
      order: 'no league document orders the table; this site orders it by its own 3-1-0 points',
      doubleRoundRobin: 'no league schedule is published and there is no round robin: a Sunset game is any game between two of the eight on MaxPreps’ schedules outside a tournament, and the pairs meet once or twice',
      overtime: 'No league or Southern Section rule on overtime is published (Blue Book Article 200 adopts NFHS rules). A Sunset game has ended level (Fountain Valley 1-1 Marina, Sep 11) and one has been decided in overtime (Great Oak 2-1 Temecula Valley, Oct 2), so this site records each game as it is reported',
      coChampions: 'no published rule names a champion; teams level on points at the top are shown level',
      stages: { 'no-rule': 'No Sunset document exists that we could find, so no rule breaks this tie and it is left as it is' },
    });
  });

  it('has no postseason: one rung for every place, a note, the Blue Book as its source', () => {
    if (sunset.postseason.kind !== 'no-postseason') throw new Error('sunset has no postseason');
    expect(sunset.postseason.ladder.map((r) => [r.divisions, r.places, r.status, r.label, r.phrase, r.badge, r.legend])).toEqual([
      ['*', [1, 99], 'no-postseason', 'No section playoffs', 'no postseason', 'No playoffs',
        'The CIF Southern Section holds no field hockey playoffs (Blue Book 2011.1, 3500.2)'],
    ]);
    expect(sunset.postseason.note).toBe(
      'The CIF Southern Section holds no field hockey playoffs (Blue Book Bylaws 2011.1 and 3500.2), and CIF holds no regional or state championship, so a Sunset team’s season ends with its last game, Oct 31 at the latest.',
    );
    expect(sunset.postseason.citations.noPlayoffs).toMatch(/^CIF-SS Blue Book 2026-27, Bylaw 2011\.1 .* and Bylaw 3500\.2 /);
    expect([sunset.postseason.sourceLabel, sunset.postseason.sourceUrl]).toEqual([
      'CIF-SS Blue Book 2026-27', 'https://cifss.org/wp-content/uploads/2026/07/Field-Hockey-2026-27-Blue-Book.pdf',
    ]);
    expect(sunset.phases).toEqual([{ phase: 'regular', through: 'league-play' }]);
    expect(sunset.keyDates).toEqual([{ id: 'last-contest', date: '2026-10-31', label: 'Last allowable Southern Section contest' }]);
  });
});

describe('leagues: the San Diego Section (City, North County, Metro)', () => {
  const sds = ['city', 'north-county', 'metro'].map(getLeague);

  it('aligns the 40 teams in seven divisions from the CIF-SDS League Alignment', () => {
    expect(sds.map((l) => [l.id, l.name, l.shortName, l.divisions.map((d) => [d.id, d.label, d.expectedTeams, d.gamesPerTeam])])).toEqual([
      ['city', 'City Conference', 'City', [['city-western', 'City Western', 6, 10], ['city-eastern', 'City Eastern', 6, 10]]],
      ['north-county', 'North County Conference', 'North', [
        ['avocado', 'Avocado', 6, 10], ['palomar', 'Palomar', 7, 12], ['valley', 'Valley', 6, 10],
      ]],
      ['metro', 'Metro Conference', 'Metro', [['metro-mesa', 'Metro Mesa', 5, 8], ['metro-south-bay', 'Metro South Bay', 4, 6]]],
    ]);
    expect(sds.flatMap((l) => l.divisions).reduce((n, d) => n + d.expectedTeams, 0)).toBe(40);
    expect(divisionDisplay('metro-south-bay')).toBe('Metro · Metro South Bay');
    expect(sds.map((l) => l.sblive.leagueSlugs)).toEqual([
      ['4179-city-western', '4178-city-eastern'],
      ['4170-avocado-east', '4171-avocado-west', '4234-palomar'],
      ['4214-metro-mesa', '4199-grossmont'],
    ]);
    expect(sds.map((l) => l.withdrawnNames[0] ?? null)).toEqual(['Madison', null, 'Santana']);
    for (const l of sds) {
      expect(l.sectionId).toBe('sds');
      expect(l.officialUrl).toBe('https://www.cifsds.org/sports/fh/index');
      expect(l.membershipNote).toBeNull();
    }
  });

  it('starts each division’s league play at its first game between two members and ends it Oct 30', () => {
    expect(sds.flatMap((l) => l.divisions.map((d) => [d.id, d.leaguePlay.first, d.leaguePlay.last]))).toEqual([
      ['city-western', '2026-09-01', '2026-10-30'], ['city-eastern', '2026-09-15', '2026-10-30'],
      ['avocado', '2026-09-28', '2026-10-30'], ['palomar', '2026-09-09', '2026-10-30'], ['valley', '2026-09-28', '2026-10-30'],
      ['metro-mesa', '2026-09-28', '2026-10-30'], ['metro-south-bay', '2026-10-07', '2026-10-30'],
    ]);
  });

  it('counts every game between two members (membership), with MaxPreps’ tables reconciled division by division', () => {
    for (const l of sds) {
      expect(l.rules).toMatchObject({
        classification: 'membership', excludeContestTypes: [2, 4], postseasonFrom: '2026-11-02', orderScope: 'site',
        gamesWord: 'division', tiebreaks: { default: ['no-rule'] }, leagueOvertime: 'shootout', unresolvedSuffix: '',
      });
      // North County keeps its full words: 'North co-leaders' would read as a direction.
      expect(l.rules.coChampionsLabel).toBe(`${l.id === 'north-county' ? 'North County' : l.shortName} co-leaders`);
      for (const d of l.divisions) {
        expect(d.official).toEqual({
          mode: 'none',
          note: 'We found no schedule or standings published by a San Diego Section league. Members come from the Section’s 2026-27 League Alignment, and this site counts every game between two members of the division as a league game whether or not MaxPreps marks it as one.',
        });
        expect(d.reportedTrust, d.id).toBe('informational');
        expect(d.home, d.id).toEqual({ miniRows: d.expectedTeams, lineAfter: null, lineLabel: null });
        expect(d.ladderLine, d.id).toEqual({ after: 1, label: 'Champion line' });
      }
    }
    expect(ALL_DIVISIONS.filter((d) => getLeague(d.leagueId).sectionId === 'sds').map((d) => [
      d.id, d.maxprepsLeagueId, d.maxprepsName, d.maxprepsSlug, d.maxprepsTeamCount, d.maxprepsMissing, Object.keys(d.maxprepsExtraRows),
    ])).toEqual([
      ['city-western', '35dc98fe-887a-475b-992c-0edfe7fc4c58', 'City - Western', 'city--western', 6, [], []],
      ['city-eastern', '6f9a29a0-78af-4d30-a087-cfa9feb91b89', 'City - Eastern', 'city--eastern', 6, ['patrick-henry'], ['fef1da70-bea2-4958-a60b-9962851f6a1d']],
      ['avocado', '75ed156b-09c9-4a0c-ac58-11a371443815', 'Avocado', 'avocado', 4, ['mt-carmel', 'rancho-bernardo'], []],
      ['palomar', 'e4a7e9c3-986b-446f-8547-8348be95e282', 'Palomar', 'palomar', 7, [], []],
      ['valley', null, null, null, 0, ['escondido', 'mission-hills', 'sage-creek', 'san-pasqual', 'vista', 'westview'], []],
      ['metro-mesa', '6dfe5a12-b82f-45d7-b103-71a5c13c0093', 'Metro- South Bay', 'metro-south-bay', 5, [], []],
      ['metro-south-bay', 'ca8e2856-b13d-4aa7-8c15-37cb50a55c60', 'Grossmont', 'grossmont', 3, ['hilltop', 'southwest'], ['1125d6e8-e661-4190-a41d-5722364dee38']],
    ]);
    expect(getDivision('valley').knownCause).toBeNull();
    expect(getDivision('metro-mesa').knownCause).toBe(
      'MaxPreps files these five teams under ‘Metro- South Bay’. On Oct 5 MaxPreps listed Bonita Vista and Helix meeting once (Oct 23), so unless a second meeting is added each ends a game short of the eight.',
    );
    expect(getDivision('city-eastern').knownCause).toBe(
      'MaxPreps’ table leaves out Patrick Henry and lists Madison, which has no varsity game; MaxPreps marks none of Patrick Henry’s league games as league games. MaxPreps also counts the City Eastern teams’ games against Mission Bay as league games; the alignment puts Mission Bay in City Western, so they count in neither table here.',
    );
    expect(getDivision('city-western').knownCause).toMatch(/Mission Bay’s five games against City Eastern teams/);
    expect(getDivision('palomar').knownCause).toMatch(/also lists Rancho Buena Vista under Valley/);
  });

  it('cites the officials’ association’s overtime procedures and paraphrases the Green Book where its words are banned', () => {
    for (const l of sds) {
      expect(l.rules.citations.overtime).toBe(
        'San Diego Field Hockey Officials Association 2026 procedures: a 10-minute 7 v 7 sudden-victory period, then 1 v 1 shootouts; the shootout winner is credited one goal, so a league, non-league or playoff varsity game does not end level (the procedures do not cover invitational tournaments, and several tournament games this season have ended level). MaxPreps records such a game as a level score marked W and L with no tally, and this site counts it as the flagged team’s win',
      );
      expect(l.rules.citations.doubleRoundRobin).toBe(
        'members play each other home and away (MaxPreps schedules and the CIF-SDS 2026-27 League Alignment; on Oct 5 one Metro Mesa pair, Bonita Vista and Helix, was listed once); the league publishes no schedule',
      );
      expect(l.rules.citations.points).toBe('this site’s 3-1-0 points (the league publishes no points rule)');
      expect(l.rules.citations.coChampions).toMatch(/^the league designates its champion/);
    }
  });

  it('plays the Section playoffs: 1st has at least a play-in as designated champion, everyone else is by selection', () => {
    for (const l of sds) {
      const ps = l.postseason;
      if (ps.kind !== 'section-playoffs') throw new Error(`${l.id} plays the section playoffs`);
      expect(ps).toMatchObject({
        name: 'San Diego Section playoffs', dates: { first: '2026-11-02', last: '2026-11-14' },
        qualificationLine: 'San Diego Section playoffs, Nov 2–14 (finals Nov 14 at La Jolla HS): Open 8, Division I 12, Division II 12, placed by the Section from its power rankings; a designated league champion gets at least a play-in.',
        divisions: [{ name: 'Open', teams: 8 }, { name: 'Division I', teams: 12 }, { name: 'Division II', teams: 12 }],
        sourceLabel: 'CIF-SDS Green Book 2026-27, Bylaw 2000.1',
        sourceUrl: 'https://docs.google.com/document/d/1JE9fAJPGJSnCi0r398lSJZknG54O3gZ3vSc24gPOr90/edit',
        powerRankingsUrl: 'https://www.cifsds.org/school-resources/CIFSDS_Power_Rankings',
      });
      expect(ps.ladder.map((r) => [r.places, r.status, r.label, r.phrase, r.badge, r.legend])).toEqual([
        [[1, 1], 'tournament', '1st: at least a play-in if named league champion', 'at least a play-in if named league champion', '1st',
          '1st — the league’s designated champion (not co-champions) is guaranteed at least a play-in game (Green Book 2000.1). The league names its champion; this table does not'],
        [[2, 99], 'selection', 'No league route', 'no league route into the playoffs', 'Selection only',
          '2nd or lower — no league route; the Section places Division I teams in the Open or Division I bracket and picks 12 Division II teams, from its power rankings (Green Book 2000.1)'],
      ]);
      expect(ps.citations.roundDates).toBe(
        'Round dates and the finals site (La Jolla HS) are from the San Diego Field Hockey Officials Association’s calendar; the Section’s own bulletin is not reachable.',
      );
      expect(Object.keys(ps.playoffDivisionOf)).toHaveLength(l.divisions.reduce((n, d) => n + d.expectedTeams, 0));
      expect(l.phases).toEqual([{ phase: 'regular', through: 'league-play' }, { phase: 'tournament', through: '2026-11-14' }]);
      expect(l.keyDates.map((k) => [k.id, k.date])).toEqual([
        ['league-play-ends', '2026-10-30'], ['seeding-meeting', '2026-10-31'], ['play-in', '2026-11-02'], ['finals', '2026-11-14'],
      ]);
    }
  });

  it('records each team’s 2026 playoff division: 20 in Division I, 20 in Division II (the Divisions sheet)', () => {
    const all = Object.assign({}, ...sds.map((l) => (l.postseason as { playoffDivisionOf: Record<string, 'I' | 'II'> }).playoffDivisionOf)) as Record<string, 'I' | 'II'>;
    expect(Object.keys(all)).toHaveLength(40);
    expect(Object.keys(all).filter((k) => all[k] === 'I').sort()).toEqual([
      'bishops', 'canyon-crest-academy', 'canyon-hills', 'cathedral-catholic', 'clairemont', 'del-norte', 'eastlake', 'fallbrook',
      'la-costa-canyon', 'la-jolla', 'la-jolla-country-day', 'mission-bay', 'mt-carmel', 'poway', 'rancho-bernardo',
      'san-dieguito-academy', 'san-marcos', 'scripps-ranch', 'torrey-pines', 'university-city',
    ]);
    // Every Valley and Metro South Bay team is Division II; every maxprepsMissing slug has a division.
    for (const d of ['valley', 'metro-south-bay']) {
      for (const slug of getDivision(d).maxprepsMissing) expect(all[slug], slug).toBe('II');
    }
  });

  it('excludes the two stray Palomar rows', () => {
    // c7dbdbcc has Poway at home, as in the Sep 15 meeting, while Fallbrook hosts Oct 13: the note ties it to neither.
    expect(DATA_QUALITY.excludedContestIds['c7dbdbcc-5f41-4192-b8b2-eb79cca2523a']).toBe(
      'Poway vs Fallbrook, Oct 9 with no time: a third MaxPreps row for the pair, which already has both of its Palomar meetings on the schedule (Sep 15, 67865f1e; Oct 13, 0b3cfb7d)',
    );
    expect(DATA_QUALITY.excludedContestIds['9c027452-e21e-4e47-9eac-d2e800bfb42c']).toMatch(/^Mission Vista vs Fallbrook, Oct 30 .*Oct 29 \(5067646d\)/);
  });
});

describe('leagues: not covered (search)', () => {
  const reasonOf = (name: string): string | undefined => DATA_QUALITY.notCovered.find((n) => n.name === name)?.reason;

  it('explains each school with games but no league, and each school with none, in whole sentences', () => {
    // Glendora, Harvard-Westlake and Thousand Oaks are covered now (the 'independents' group), so search
    // finds their pages and no longer prints a not-covered sentence for them.
    expect(DATA_QUALITY.notCovered.map((n) => n.name)).toEqual([
      'York', 'Wilcox', 'Red Bluff',
      'Madison', 'Santana', 'Castle Park', 'Chula Vista', 'Montgomery', 'Sweetwater',
      'River Valley', 'North Salinas', 'Notre Dame (Salinas)', 'Mayfair',
    ]);
    expect(reasonOf('River Valley')).toBe('River Valley (Yuba City, Sac-Joaquin Section) has no 2026 varsity game on MaxPreps, so it has no page here.');
    for (const school of ['North Salinas', 'Notre Dame (Salinas)']) {
      expect(reasonOf(school)).toBe(`${school} has no 2026 varsity game on MaxPreps, so it has no page here.`);
    }
    for (const school of ['Madison', 'Santana', 'Castle Park', 'Chula Vista', 'Montgomery', 'Sweetwater']) {
      expect(reasonOf(school)).toBe(`${school} has no 2026 varsity game on MaxPreps or in the San Diego Section’s power rankings, so it has no page here.`);
    }
    expect(reasonOf('Mayfair')).toBe('Mayfair has no 2026 varsity game on MaxPreps and is not on the Southern Section’s list of participating schools.');
    for (const n of DATA_QUALITY.notCovered) {
      expect(n.reason, n.name).toMatch(/^[A-Z].*\.$/);
      expect(n.keys.length, n.name).toBeGreaterThan(0);
    }
  });

  it('never calls a school with no games inactive, withdrawn, dropped or cancelled', () => {
    const strings = [
      ...DATA_QUALITY.notCovered.map((n) => n.reason), ...Object.values(DATA_QUALITY.excludedContestIds),
      ...ALL_DIVISIONS.flatMap((d) => Object.values(d.maxprepsExtraRows)), ...socal().flatMap(renderedStrings),
    ];
    for (const s of strings) expect(s, s).not.toMatch(/\b(inactive|withdr\w*|dropped|cancel\w*|no (field hockey )?program)\b/i);
  });
});

describe('leagues: SoCal copy is honest (DESIGN-socal §2.4 copy rules)', () => {
  const strings = socal().flatMap((l) => renderedStrings(l).map((text) => [l.id, text] as const)).filter(([, t]) => t);

  it('never says "at-large" or "automatic qualifier" (non-CCS pages), nor "eliminated"', () => {
    for (const [id, t] of strings) expect(t, `${id}: ${t}`).not.toMatch(/automatic qualifier|at-large|eliminat/i);
  });

  it('never prints a seed word, so never the Green Book’s play-in sentence', () => {
    for (const [id, t] of strings) {
      expect(SEED_CLAIM.test(t), `${id}: ${t}`).toBe(false);
      expect(t, `${id}: ${t}`).not.toMatch(/lowest-seeded/i);
    }
  });

  it('says "Sunset League" only beside "all-sports", and never "Sunset school(s)/member(s)"', () => {
    for (const [id, t] of strings) {
      for (const sentence of t.split(/(?<=[.;])\s+/)) {
        if (/\bSunset League\b/.test(sentence)) expect(sentence, `${id}: ${sentence}`).toMatch(/all-sports/);
      }
      expect(t, `${id}: ${t}`).not.toMatch(/\bSunset (school|member)s?\b/);
    }
  });

  it('never says a league’s own rules order a table it publishes no rules for, and never calls an umpires’ source official', () => {
    for (const [id, t] of strings) {
      expect(t, `${id}: ${t}`).not.toMatch(/rules require/i);
      expect(umpireOfficialClaims(t), `${id}: ${t}`).toEqual([]);
    }
  });
});

describe('leagues: the LA independents (DESIGN §24.9, §24.10)', () => {
  const group = getLeague('independents');
  const division = getDivision('independents');

  it('is a group of five with a table of its members’ games: membership, no MaxPreps table, no postseason', () => {
    expect([group.sectionId, group.name, group.shortName, group.cities, group.independents]).toEqual([
      'ss', 'LA independents', 'LA', 'Glendora, La Verne, Studio City, Thousand Oaks and West Hills', true,
    ]);
    expect(group.sblive.leagueSlugs).toEqual(['4235-palomares', '4207-league-b', '4213-marmonte']);
    expect(group.rules).toMatchObject({
      classification: 'membership', orderScope: 'site', gamesWord: 'league', excludeContestTypes: [2, 4],
      postseasonFrom: null, leagueOvertime: 'none', tiebreaks: { default: ['no-rule'] },
    });
    expect(division).toMatchObject({
      label: 'LA', searchAliases: ['LA independents', 'Independents', 'independent'], expectedTeams: 5, gamesPerTeam: null,
      maxprepsLeagueId: null, maxprepsName: null, maxprepsSlug: null, maxprepsTeamCount: 0,
      maxprepsMissing: ['bonita', 'chaminade', 'glendora', 'harvard-westlake', 'thousand-oaks'], reportedTrust: 'informational',
      knownCause: null, ladderLine: null, home: { miniRows: 5, lineAfter: null, lineLabel: null },
    });
    // The first games between two of the five (Sep 8) to the Section's last allowable contest.
    expect(division.leaguePlay).toEqual({ first: '2026-09-08', last: '2026-10-31' });
    expect(division.official).toEqual({
      mode: 'none',
      note: 'No league gathers these five schools. Glendora, Harvard-Westlake and Thousand Oaks are the only field hockey teams in their all-sports leagues on MaxPreps (the Palomares League, League B and the Marmonte League). MaxPreps and si.com list Bonita and Chaminade in the Sunset, but MaxPreps marks none of their games against the five Orange County Sunset teams as a league game, and each plays every other independent home and away, so this site lists them here. The table counts every game between two of the five, whether or not MaxPreps marks it as a league game (it marks only Bonita’s two games with Chaminade), and orders them by this site’s 3-1-0 points.',
    });
    expect(group.membershipNote).toBe(
      'The LA independents are five Los Angeles-area Southern Section schools in no field hockey league. The table counts their games against each other.',
    );
    expect(group.postseason.kind).toBe('no-postseason');
    expect(group.keyDates).toEqual([{ id: 'last-contest', date: '2026-10-31', label: 'Last allowable Southern Section contest' }]);
    expect(leagueStandingsUrl('independents')).toBeNull();
    expect(isIndependentLeague('independents')).toBe(true);
    expect(LEAGUES_PROPER.map((l) => l.id)).not.toContain('independents');
    expect(INDEPENDENT_LEAGUES.map((l) => l.id)).toEqual(['independents']);
    expect(standingsLabel('independents')).toBe('LA standings');
    expect(standingsLabel('sunset')).toBe('Sunset standings');
  });

  it('says only what is true of a group in no league: no citation claims a league rule', () => {
    const c = group.rules.citations;
    for (const text of [c.points, c.order, c.doubleRoundRobin, c.coChampions, c.stages['no-rule'] ?? '']) {
      expect(text, text).toMatch(/no league( exists| schedule| names| to publish)/i);
    }
    expect(c.overtime).toBe('No Southern Section rule on overtime is published (Blue Book Article 200 adopts NFHS rules), so this site records each game as it is reported');
  });

  it("a group of independents needs membership, official mode 'none', no MaxPreps table, no postseason, no line and no cause", () => {
    const d = division as unknown as Record<string, unknown>;
    const cases: Array<[string, unknown, RegExp]> = [
      ['maxprepsLeagueId', '37e34960-1d6f-4028-a4f8-4fba3e99f9be', /independents: a group of independents needs maxprepsLeagueId null/],
      ['gamesPerTeam', 4, /independents: gamesPerTeam 4/],
      ['reportedTrust', 'records-only', /independents: a group of independents needs reportedTrust 'informational'/],
      ['knownCause', 'A cause.', /independents: a group of independents needs knownCause null/],
    ];
    for (const [key, value, message] of cases) {
      expectViolation(() => {
        const before = d[key];
        d[key] = value;
        if (key === 'maxprepsLeagueId') {
          d.maxprepsName = 'Palomares';
          d.maxprepsSlug = 'palomares';
        }
        return () => {
          d[key] = before;
          if (key === 'maxprepsLeagueId') {
            d.maxprepsName = null;
            d.maxprepsSlug = null;
          }
        };
      }, message);
    }
    expectViolation(() => {
      const r = group.rules as { classification: string };
      r.classification = 'contest-type';
      return () => { r.classification = 'membership'; };
    }, /independents: a group of independents needs classification 'membership'/);
  });
});

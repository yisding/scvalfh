/**
 * lib/leagues.ts: the SPEC §2.4 invariants (also enforced by assertLeagues() at import), the §2.3
 * helpers, and the SCVAL strings that must stay byte-identical to today's.
 */

import { describe, expect, it } from 'vitest';

import {
  ALL_DIVISIONS, CCS, CCS_LEAGUE_IDS, DATA_QUALITY, LEAGUES, LEAGUE_IDS,
  RESERVED_SEGMENTS, SECTIONS, TOURNAMENT_LEAGUE_IDS, UNBRACKETED_LEAGUE_IDS, assertLeagues, divisionDisplay,
  divisionHeading, divisionLabel, divisionsOf, findDivision, findLeague, getDivision, getLeague,
  getSection, isLeagueId, isSingleDivision, ladderFor, ladderRung, leagueOfDivision,
  leaguePlayEnds, leagueStandingsUrl, seasonWindowBounds, sectionOf, statusesOf, tiebreakChainFor,
  type LeagueConfig,
} from '../lib/leagues';
import { CCS_BRACKET_URL } from '../lib/season';
import type { PlayoffStatus, TiebreakStage } from '../lib/types';

const UNCOMPUTABLE: readonly TiebreakStage[] = ['coin-flip', 'ccs-points', 'no-rule'];

function chainsOf(l: LeagueConfig): Array<[number | null, readonly TiebreakStage[]]> {
  return [
    [null, l.rules.tiebreaks.default],
    ...Object.entries(l.rules.tiebreaks.byBucketStart ?? {}).map(
      ([k, v]) => [Number(k), v!] as [number, readonly TiebreakStage[]],
    ),
  ];
}

/** Every string a league could render (Gabilan check). */
function renderedStrings(l: LeagueConfig): string[] {
  const out: string[] = [l.name, l.shortName, l.region, ...l.links.map((x) => x.label), l.membershipNote ?? ''];
  for (const d of l.divisions) {
    out.push(d.label, ...d.searchAliases, d.knownCause ?? '', d.home.lineLabel ?? '', d.ladderLine?.label ?? '');
    if (d.official.mode === 'none') out.push(d.official.note);
  }
  const r = l.rules;
  out.push(
    r.citations.points, r.citations.order, r.citations.doubleRoundRobin, r.citations.overtime,
    r.citations.coChampions, r.citations.incomplete ?? '', ...Object.values(r.citations.stages).map(String),
    r.coChampionsLabel, r.unresolvedSuffix,
  );
  for (const rung of l.postseason.ladder) out.push(rung.label, rung.phrase, rung.badge, rung.legend);
  const ps = l.postseason;
  switch (ps.kind) {
    case 'ccs-ladder':
      out.push(ps.citation);
      for (const p of ps.pairings) out.push(p.label, ...p.seatLabels);
      break;
    case 'league-tournament':
      out.push(ps.name, ps.titleNote, ps.finalSite.label, ...Object.values(ps.citations), ...ps.rounds.map((x) => x.pairing));
      break;
    case 'unbracketed-tournament':
      out.push(ps.name, ps.note, ...Object.values(ps.citations));
      break;
  }
  out.push(...l.keyDates.map((k) => k.label));
  return out;
}

/** Mutate the live config, expect assertLeagues() to throw, then restore. */
function expectViolation(mutate: () => () => void, message: RegExp): void {
  const restore = mutate();
  try {
    expect(() => assertLeagues()).toThrow(message);
  } finally {
    restore();
  }
  expect(() => assertLeagues()).not.toThrow();
}

describe('leagues: ids and helpers (SPEC §2.3)', () => {
  it('configures the five leagues in order: MCAL is the only bracketed tournament league, EAL the only unbracketed one', () => {
    expect(LEAGUE_IDS).toEqual(['scval', 'bval', 'pcal', 'mcal', 'eal']);
    expect(CCS_LEAGUE_IDS).toEqual(['scval', 'bval', 'pcal']);
    expect(TOURNAMENT_LEAGUE_IDS).toEqual(['mcal']);
    expect(UNBRACKETED_LEAGUE_IDS).toEqual(['eal']);
    expect(ALL_DIVISIONS.map((d) => d.id)).toEqual([
      'de-anza', 'el-camino', 'mt-hamilton', 'santa-teresa', 'pcal', 'marin-county', 'eal',
    ]);
    expect(SECTIONS.map((s) => s.id)).toEqual(['ccs', 'ncs', 'ns']);
    expect(SECTIONS.map((s) => s.shortName)).toEqual(['CCS', 'NCS', 'NS']);
  });

  it('labels divisions, and single-division leagues have no division heading', () => {
    expect(divisionHeading('pcal')).toBeNull();
    expect(divisionHeading('marin-county')).toBeNull();
    expect(divisionHeading('de-anza')).toBe('De Anza');
    expect(divisionHeading('mt-hamilton')).toBe('Mt. Hamilton');
    expect(divisionLabel('pcal')).toBe('PCAL');
    expect(divisionLabel('marin-county')).toBe('MCAL');
    expect(divisionDisplay('mt-hamilton')).toBe('BVAL · Mt. Hamilton');
    expect(divisionDisplay('marin-county')).toBe('MCAL');
    expect(divisionDisplay('de-anza')).toBe('SCVAL · De Anza');
    expect(divisionHeading('eal')).toBeNull();
    expect(divisionLabel('eal')).toBe('EAL');
    expect(divisionDisplay('eal')).toBe('EAL');
    expect(isSingleDivision('eal')).toBe(true);
    expect(isSingleDivision('pcal')).toBe(true);
    expect(isSingleDivision('scval')).toBe(false);
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
    expect(() => getLeague('nope')).toThrow(/lib\/leagues\.ts/);
    expect(() => getDivision('nope')).toThrow(/lib\/leagues\.ts/);
    expect(() => getSection('xyz' as 'ccs')).toThrow(/lib\/leagues\.ts/);
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
    expect(leaguePlayEnds('scval')).toBe('2026-10-28');
    expect(leaguePlayEnds('bval')).toBe('2026-10-30');
    expect(leaguePlayEnds('mcal')).toBe('2026-10-22');
    expect(leaguePlayEnds('eal')).toBe('2026-10-28');
    // The Northern Section's window (Aug 1 – Nov 7) sits inside the union.
    expect(seasonWindowBounds()).toEqual({ start: '2026-08-01', end: '2026-11-30' });
  });

  it('sets the overtime rule, the order scope and the MCAL schedule-changes page', () => {
    expect(LEAGUES.map((l) => [l.id, l.rules.leagueOvertime])).toEqual([
      ['scval', 'sudden-victory'], ['bval', 'sudden-victory'], ['pcal', 'none'], ['mcal', 'none'], ['eal', 'shootout'],
    ]);
    // Every league's own document orders its table by points, except the EAL's, which decides only the title.
    expect(LEAGUES.map((l) => [l.id, l.rules.orderScope])).toEqual([
      ['scval', 'table'], ['bval', 'table'], ['pcal', 'table'], ['mcal', 'table'], ['eal', 'title'],
    ]);
    expect(LEAGUES.map((l) => [l.id, l.membershipNote === null])).toEqual([
      ['scval', true], ['bval', true], ['pcal', true], ['mcal', true], ['eal', false],
    ]);
    expect(getLeague('mcal').officialChanges).toEqual({
      url: 'https://www.mcalsports.org/Schedir.htm',
      cellMarker: 'Girls Field Hockey:',
      sha256: 'b1e5c523b251021522a77ed459d5d7035fe0c9100cb2b727f1ea63c467566b76',
    });
    for (const id of ['scval', 'bval', 'pcal', 'eal']) expect(getLeague(id).officialChanges).toBeNull();
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

describe('leagues: assertLeagues invariants (SPEC §2.4)', () => {
  it('passes on the shipped config', () => {
    expect(() => assertLeagues()).not.toThrow();
  });

  it('1. ids are unique; a league id equals only its own single division; no reserved segment', () => {
    const ids = [...SECTIONS.map((s) => s.id as string), ...LEAGUE_IDS];
    expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(SECTIONS.length);
    expect(new Set(LEAGUE_IDS).size).toBe(LEAGUE_IDS.length);
    expect(new Set(ALL_DIVISIONS.map((d) => d.id)).size).toBe(ALL_DIVISIONS.length);
    for (const l of LEAGUES) {
      expect(RESERVED_SEGMENTS as readonly string[]).not.toContain(l.id);
      const clash = ALL_DIVISIONS.find((d) => d.id === l.id);
      if (clash) expect(l.divisions.map((d) => d.id)).toEqual([l.id]);
    }
    expect(ids.length).toBeGreaterThan(0);
    expectViolation(() => {
      const d = getLeague('bval').divisions[0] as { id: string };
      d.id = 'de-anza';
      return () => { d.id = 'mt-hamilton'; };
    }, /duplicate division id/);
    expectViolation(() => {
      const d = getLeague('bval').divisions[1] as { id: string };
      d.id = 'scval';
      return () => { d.id = 'santa-teresa'; };
    }, /single division/);
  });

  it('2. every ladder covers 1..99 exactly once per division, with statuses of its kind', () => {
    const ccsStatuses: PlayoffStatus[] = ['aq', 'play-in', 'at-large', 'out', 'no-aq-route'];
    const tournamentStatuses: PlayoffStatus[] = ['bye', 'tournament', 'below-line'];
    const unbracketedStatuses: PlayoffStatus[] = ['tournament', 'below-line'];
    for (const l of LEAGUES) {
      for (const d of l.divisions) {
        for (let p = 1; p <= 99; p++) {
          const n = l.postseason.ladder.filter(
            (r) => (r.divisions === '*' || r.divisions.includes(d.id)) && r.places[0] <= p && p <= r.places[1],
          ).length;
          expect(n, `${d.id} place ${p}`).toBe(1);
        }
      }
      const allowed = { 'ccs-ladder': ccsStatuses, 'league-tournament': tournamentStatuses, 'unbracketed-tournament': unbracketedStatuses }[l.postseason.kind];
      for (const r of l.postseason.ladder) expect(allowed).toContain(r.status);
    }
    expectViolation(() => {
      const rung = getLeague('pcal').postseason.ladder[1] as { places: readonly [number, number] };
      rung.places = [4, 99];
      return () => { rung.places = [3, 99]; };
    }, /covers place 3 0 times/);
    expectViolation(() => {
      const rung = getLeague('eal').postseason.ladder[1] as { status: PlayoffStatus };
      rung.status = 'bye';
      return () => { rung.status = 'below-line'; };
    }, /ladder status bye not allowed for unbracketed-tournament/);
  });

  it('2b. an unbracketed tournament: places 1..qualifiers are tournament, no rung straddles, dates after league play', () => {
    expectViolation(() => {
      const [a, b] = getLeague('eal').postseason.ladder as unknown as Array<{ places: readonly [number, number] }>;
      a.places = [1, 7];
      b.places = [8, 99];
      return () => { a.places = [1, 6]; b.places = [7, 99]; };
    }, /places 1-6 \(and only they\) are 'tournament'/);
    expectViolation(() => {
      const [a, b] = getLeague('eal').postseason.ladder as unknown as Array<{ places: readonly [number, number] }>;
      a.places = [1, 5];
      b.places = [6, 99];
      return () => { a.places = [1, 6]; b.places = [7, 99]; };
    }, /straddles the 6 qualifiers/);
    expectViolation(() => {
      const dates = (getLeague('eal').postseason as { dates: { first: string } }).dates;
      dates.first = '2026-10-28';
      return () => { dates.first = '2026-10-30'; };
    }, /dates\.first is not after leaguePlay\.last/);
    expectViolation(() => {
      const rules = getLeague('eal').rules as { postseasonFrom: string | null };
      rules.postseasonFrom = null;
      return () => { rules.postseasonFrom = '2026-10-30'; };
    }, /postseasonFrom on or before dates\.first/);
    expectViolation(() => {
      const ps = getLeague('eal').postseason as { sourceUrl: string };
      ps.sourceUrl = 'http://www.cifns.org/';
      return () => { ps.sourceUrl = 'https://www.cifns.org/guidelines-playoffs-Divisions-archives/26-28_Guidelines/Field_Hockey_Guidelines_26-28.pdf'; };
    }, /sourceUrl must start with https/);
  });

  it('3. the CCS field: keys, per-league berths, 7 + 4 + 2 + 3 === 16', () => {
    expect(Object.keys(CCS.autoQualifiers).sort()).toEqual([...CCS_LEAGUE_IDS, 'atLarge', 'total'].sort());
    for (const l of LEAGUES) {
      if (l.postseason.kind === 'ccs-ladder') {
        expect(l.postseason.autoBerths).toBe((CCS.autoQualifiers as Record<string, number>)[l.id]);
      }
    }
    expect(7 + 4 + 2 + 3).toBe(CCS.autoQualifiers.total);
    expectViolation(() => {
      const ps = getLeague('pcal').postseason as { autoBerths: number };
      ps.autoBerths = 3;
      return () => { ps.autoBerths = 2; };
    }, /autoBerths/);
  });

  it('4. chains: at most one uncomputable stage, last; draw-number last; no play-in; every stage cited', () => {
    for (const l of LEAGUES) {
      for (const [, chain] of chainsOf(l)) {
        const unc = chain.filter((s) => UNCOMPUTABLE.includes(s));
        expect(unc.length).toBeLessThanOrEqual(1);
        if (unc.length) expect(chain.at(-1)).toBe(unc[0]);
        if (chain.includes('draw-number')) expect(chain.at(-1)).toBe('draw-number');
        expect(chain).not.toContain('play-in');
        for (const s of chain) expect(l.rules.citations.stages[s], `${l.id} ${s}`).toBeTruthy();
      }
      if (l.postseason.kind === 'league-tournament') {
        expect(l.rules.citations.stages['play-in']).toBeTruthy();
        expect(l.rules.unresolvedSuffix).toBeTruthy();
      }
    }
    expectViolation(() => {
      const t = getLeague('scval').rules.tiebreaks as { default: readonly TiebreakStage[] };
      const before = t.default;
      t.default = ['coin-flip', 'head-to-head'];
      return () => { t.default = before; };
    }, /not last/);
    expectViolation(() => {
      const t = getLeague('mcal').rules.tiebreaks as { default: readonly TiebreakStage[] };
      const before = t.default;
      t.default = ['h2h-win-pct', 'play-in'];
      return () => { t.default = before; };
    }, /play-in/);
    expectViolation(() => {
      const stages = getLeague('bval').rules.citations.stages as Record<string, string>;
      const before = stages['division-goals-against'];
      delete stages['division-goals-against'];
      return () => { stages['division-goals-against'] = before; };
    }, /no citation/);
  });

  it('5. drawNumbers exist exactly when a chain uses draw-number, with distinct values', () => {
    for (const l of LEAGUES) {
      const uses = chainsOf(l).some(([, c]) => c.includes('draw-number'));
      expect(l.rules.drawNumbers !== null, l.id).toBe(uses);
    }
    const draw = getLeague('mcal').rules.drawNumbers!;
    expect(new Set(Object.values(draw)).size).toBe(9);
    expectViolation(() => {
      const rules = getLeague('bval').rules as { drawNumbers: Record<string, number> | null };
      rules.drawNumbers = { branham: 1 };
      return () => { rules.drawNumbers = null; };
    }, /drawNumbers/);
  });

  it('6. pairing seats are divisions of the same league, places ≥ 1', () => {
    for (const l of LEAGUES) {
      if (l.postseason.kind !== 'ccs-ladder') continue;
      for (const p of l.postseason.pairings) {
        for (const seat of p.seats) {
          expect(l.divisions.map((d) => d.id)).toContain(seat.division);
          expect(seat.place).toBeGreaterThanOrEqual(1);
        }
      }
    }
    expect(getLeague('pcal').postseason.kind === 'ccs-ladder' && getLeague('pcal').postseason).toMatchObject({ pairings: [] });
  });

  it('8. no ignored MaxPreps league is configured', () => {
    for (const id of Object.keys(DATA_QUALITY.ignoredMaxprepsLeagueIds)) {
      expect(ALL_DIVISIONS.map((d) => d.maxprepsLeagueId)).not.toContain(id);
    }
  });

  it('9. games per team, league-play dates, MCAL postseason boundary, dates inside the section window', () => {
    for (const l of LEAGUES) {
      const section = getSection(l.sectionId);
      for (const d of l.divisions) {
        expect(d.gamesPerTeam).toBe((d.expectedTeams - 1) * 2);
        expect(d.leaguePlay.first <= d.leaguePlay.last).toBe(true);
        for (const date of [d.leaguePlay.first, d.leaguePlay.last]) {
          expect(date >= section.seasonWindow.start && date <= section.seasonWindow.end, `${d.id} ${date}`).toBe(true);
        }
      }
      for (const k of l.keyDates) {
        expect(k.date >= section.seasonWindow.start && k.date <= section.seasonWindow.end, `${l.id} ${k.id}`).toBe(true);
      }
    }
    const mcal = getLeague('mcal');
    expect(mcal.divisions[0].leaguePlay.last < mcal.rules.postseasonFrom!).toBe(true);
    expectViolation(() => {
      const d = getLeague('bval').divisions[0] as { gamesPerTeam: number };
      d.gamesPerTeam = 12;
      return () => { d.gamesPerTeam = 10; };
    }, /gamesPerTeam/);
    expectViolation(() => {
      const lp = getLeague('mcal').divisions[0].leaguePlay as { last: string };
      lp.last = '2026-10-23';
      return () => { lp.last = '2026-10-22'; };
    }, /postseasonFrom/);
  });

  it('10. every bundled official source names its file, revision URL and sha256', () => {
    for (const d of ALL_DIVISIONS) {
      if (d.official.mode !== 'bundled') continue;
      expect(d.official.bundledFile).toMatch(/^data\/official\/.+\.json$/);
      expect(d.official.revisionCheckUrl).toMatch(/^https:\/\//);
      expect(d.official.bundledSha256).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(getDivision('de-anza').official.mode).toBe('live-pdf');
    expectViolation(() => {
      const o = getDivision('pcal').official as { bundledSha256: string | null };
      const before = o.bundledSha256;
      o.bundledSha256 = null;
      return () => { o.bundledSha256 = before; };
    }, /bundled/);
  });

  it("10b. official mode 'none' only on a contest-type league, with a note", () => {
    for (const d of ALL_DIVISIONS) {
      if (d.official.mode !== 'none') continue;
      expect(leagueOfDivision(d.id).rules.classification, d.id).toBe('contest-type');
      expect(d.official.note.length, d.id).toBeGreaterThan(0);
    }
    expectViolation(() => {
      const d = getDivision('pcal') as { official: unknown };
      const before = d.official;
      d.official = { mode: 'none', note: 'PCAL publishes nothing.' };
      return () => { d.official = before; };
    }, /official mode 'none' on an official-fixtures league/);
    expectViolation(() => {
      const o = getDivision('eal').official as { note: string };
      const before = o.note;
      o.note = ' ';
      return () => { o.note = before; };
    }, /needs a note/);
  });

  it('13. MaxPreps rows: maxprepsTeamCount + maxprepsMissing − maxprepsExtraRows === expectedTeams', () => {
    for (const d of ALL_DIVISIONS) {
      expect(d.maxprepsTeamCount + d.maxprepsMissing.length - Object.keys(d.maxprepsExtraRows).length, d.id).toBe(d.expectedTeams);
    }
    expectViolation(() => {
      const d = getDivision('eal') as { maxprepsTeamCount: number };
      d.maxprepsTeamCount = 6;
      return () => { d.maxprepsTeamCount = 7; };
    }, /maxprepsTeamCount \+ maxprepsMissing − maxprepsExtraRows/);
    expectViolation(() => {
      const d = getDivision('eal') as { maxprepsExtraRows: Record<string, string> };
      const before = d.maxprepsExtraRows;
      d.maxprepsExtraRows = { 'red-bluff': 'not a GUID' };
      return () => { d.maxprepsExtraRows = before; };
    }, /is not a GUID/);
  });

  it('14. rule shapes: no excluded league flag, 1 v 1s only by contest type, a non-empty membership note', () => {
    expectViolation(() => {
      const r = getLeague('eal').rules as { excludeContestTypes: readonly number[] };
      r.excludeContestTypes = [0, 2];
      return () => { r.excludeContestTypes = [2, 4, 5]; };
    }, /excludeContestTypes may not contain 0/);
    expectViolation(() => {
      const r = getLeague('mcal').rules as { leagueOvertime: string };
      r.leagueOvertime = 'shootout';
      return () => { r.leagueOvertime = 'none'; };
    }, /leagueOvertime 'shootout' needs classification 'contest-type'/);
    expectViolation(() => {
      const l = getLeague('bval') as { membershipNote: string | null };
      l.membershipNote = '';
      return () => { l.membershipNote = null; };
    }, /membershipNote is empty/);
    expectViolation(() => {
      const s = getSection('ns') as { shortName: string };
      s.shortName = 'NCS';
      return () => { s.shortName = 'NS'; };
    }, /duplicate section shortName: NCS/);
  });

  it('11. place-relative stages appear only in byBucketStart chains for 1 and 2', () => {
    for (const l of LEAGUES) {
      for (const [start, chain] of chainsOf(l)) {
        if (start === 1 || start === 2) continue;
        expect(chain).not.toContain('record-vs-higher-placed');
        expect(chain).not.toContain('record-vs-lower-placed');
      }
    }
    expectViolation(() => {
      const t = getLeague('pcal').rules.tiebreaks as { default: readonly TiebreakStage[] };
      const before = t.default;
      t.default = ['record-vs-lower-placed', 'no-rule'];
      return () => { t.default = before; };
    }, /record-vs-lower-placed/);
  });

  it('12. home mini tables and ladder lines fit the division', () => {
    for (const d of ALL_DIVISIONS) {
      expect(d.home.miniRows).toBeLessThanOrEqual(d.expectedTeams);
      if (d.home.lineAfter !== null) expect(d.home.lineAfter).toBeLessThan(d.home.miniRows);
      if (d.ladderLine !== null) expect(d.ladderLine.after).toBeLessThan(d.expectedTeams);
      else {
        const ps = leagueOfDivision(d.id).postseason;
        expect(ps.kind === 'unbracketed-tournament' && ps.qualifiers >= d.expectedTeams, d.id).toBe(true);
      }
    }
    expect(LEAGUES.map((l) => l.postseason.kind)).toEqual([
      'ccs-ladder', 'ccs-ladder', 'ccs-ladder', 'league-tournament', 'unbracketed-tournament',
    ]);
    expectViolation(() => {
      const d = getDivision('pcal') as { ladderLine: { after: number; label: string } | null };
      const before = d.ladderLine;
      d.ladderLine = null;
      return () => { d.ladderLine = before; };
    }, /ladderLine may be null only for an unbracketed tournament/);
    expectViolation(() => {
      const h = getDivision('santa-teresa').home as { miniRows: number };
      h.miniRows = 7;
      return () => { h.miniRows = 3; };
    }, /miniRows/);
  });
});

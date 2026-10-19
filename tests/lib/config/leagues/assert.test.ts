/**
 * lib/config/leagues/assert.ts: the SPEC §2.4 invariants (also enforced by assertLeagues() at import) and the
 * Southern California amendment's invariants (DESIGN-socal §2.1.7), each broken on the live config and restored.
 */

import { describe, expect, it } from 'vitest';

import {
  ALL_DIVISIONS, CCS, CCS_LEAGUE_IDS, DATA_QUALITY, LEAGUES, LEAGUE_IDS, SECTIONS, assertLeagues, getDivision,
  getLeague, getSection, leagueOfDivision,
} from '@/lib/config/leagues';
import { RESERVED_SEGMENTS } from '@/lib/config/reserved-segments';
import { type SectionConfig } from '@/lib/model/league-config';
import type { PlayoffStatus, TiebreakStage } from '@/lib/model/standings';
import { UNCOMPUTABLE, chainsOf, expectViolation } from '@/tests/support/leagues';

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
      const allowed = {
        'ccs-ladder': ccsStatuses, 'league-tournament': tournamentStatuses, 'unbracketed-tournament': unbracketedStatuses,
        'no-postseason': ['no-postseason'] as PlayoffStatus[], 'section-playoffs': ['tournament', 'selection'] as PlayoffStatus[],
      }[l.postseason.kind];
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
    expectViolation(() => {
      const rung = getLeague('sunset').postseason.ladder[0] as { status: PlayoffStatus };
      rung.status = 'below-line';
      return () => { rung.status = 'no-postseason'; };
    }, /ladder status below-line not allowed for no-postseason/);
    expectViolation(() => {
      const rung = getLeague('scval').postseason.ladder[3] as { status: PlayoffStatus };
      rung.status = 'selection';
      return () => { rung.status = 'out'; };
    }, /ladder status selection not allowed for ccs-ladder/);
    expectViolation(() => {
      const rung = getLeague('metro').postseason.ladder[1] as { status: PlayoffStatus };
      rung.status = 'no-postseason';
      return () => { rung.status = 'selection'; };
    }, /ladder status no-postseason not allowed for section-playoffs/);
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
        expect(l.postseason.autoBerths).toBe(CCS.autoQualifiers[l.id]);
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
        // null only for the Sunset (no fixed schedule) and the independents (no league games); every other
        // division is a double round robin.
        if (d.id === 'sunset' || d.id === 'independents') expect(d.gamesPerTeam).toBeNull();
        else expect(d.gamesPerTeam, d.id).toBe((d.expectedTeams - 1) * 2);
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

  it("10b. official mode 'none' only on a contest-type, membership or independent league, with a note", () => {
    for (const d of ALL_DIVISIONS) {
      if (d.official.mode !== 'none') continue;
      expect(['contest-type', 'membership'], d.id).toContain(leagueOfDivision(d.id).rules.classification);
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
    }, /mcal: leagueOvertime 'shootout' exactly when its section ncs has a shootout rule/);
    // With its section's rule in place too, an official-fixtures league still may not decide level games by shootout.
    expectViolation(() => {
      const r = getLeague('mcal').rules as { leagueOvertime: string };
      const s = getSection('ncs') as { shootout: SectionConfig['shootout'] };
      r.leagueOvertime = 'shootout';
      s.shootout = { words: '1 v 1s', citation: 'a rule', inference: 'verified', disagreement: null, coversTournaments: true };
      return () => { r.leagueOvertime = 'none'; s.shootout = null; };
    }, /leagueOvertime 'shootout' needs classification 'contest-type' or 'membership'/);
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
        expect((ps.kind === 'unbracketed-tournament' && ps.qualifiers >= d.expectedTeams) || ps.kind === 'no-postseason', d.id).toBe(true);
      }
    }
    expect(LEAGUES.map((l) => l.postseason.kind)).toEqual([
      'ccs-ladder', 'ccs-ladder', 'ccs-ladder', 'league-tournament', 'unbracketed-tournament',
      'no-postseason', 'section-playoffs', 'section-playoffs', 'section-playoffs', 'no-postseason',
    ]);
    expectViolation(() => {
      const d = getDivision('pcal') as { ladderLine: { after: number; label: string } | null };
      const before = d.ladderLine;
      d.ladderLine = null;
      return () => { d.ladderLine = before; };
    }, /ladderLine may be null only for an unbracketed tournament whose qualifiers >= expectedTeams, or a league with no postseason/);
    expectViolation(() => {
      const d = getDivision('sunset') as { ladderLine: { after: number; label: string } | null };
      d.ladderLine = { after: 1, label: 'Line' };
      return () => { d.ladderLine = null; };
    }, /sunset: a no-postseason league draws no ladder or home line/);
    expectViolation(() => {
      const h = getDivision('santa-teresa').home as { miniRows: number };
      h.miniRows = 7;
      return () => { h.miniRows = 3; };
    }, /miniRows/);
  });
});

describe('leagues: SoCal invariants (DESIGN-socal §2.1.7)', () => {
  it('reserves the region ids: no section, league or division may take one', () => {
    expectViolation(() => {
      const d = getDivision('valley') as { id: string };
      d.id = 'socal';
      return () => { d.id = 'valley'; };
    }, /socal: a section, league or division id may not be a region id/);
    expectViolation(() => {
      const s = getSection('ss') as { region: string };
      s.region = 'midcal';
      return () => { s.region = 'socal'; };
    }, /ss: unknown region midcal/);
    expectViolation(() => {
      const [ss, sds] = [getSection('ss'), getSection('sds')] as Array<{ region: string }>;
      ss.region = 'norcal';
      sds.region = 'norcal';
      return () => { ss.region = 'socal'; sds.region = 'socal'; };
    }, /region socal has no section/);
  });

  it('every section names its rules on https, and a shootout rule has its words', () => {
    expectViolation(() => {
      const r = getSection('ss').rulesSource as { url: string };
      const before = r.url;
      r.url = 'http://cifss.org/';
      return () => { r.url = before; };
    }, /ss: rulesSource\.url must start with https/);
    expectViolation(() => {
      const s = getSection('sds') as { shootout: SectionConfig['shootout'] };
      const before = s.shootout;
      s.shootout = { words: ' ', citation: 'x', inference: 'unverified', disagreement: 'x', coversTournaments: false };
      return () => { s.shootout = before; };
    }, /sds: shootout needs words and a citation/);
    expectViolation(() => {
      const s = getSection('sds') as { shootout: SectionConfig['shootout'] };
      const before = s.shootout;
      s.shootout = { words: 'a shootout', citation: 'x', inference: 'maybe' as 'verified', disagreement: null, coversTournaments: false };
      return () => { s.shootout = before; };
    }, /sds: shootout\.inference must be one of verified, unverified/);
    expectViolation(() => {
      const s = getSection('sds') as { shootout: SectionConfig['shootout'] };
      const before = s.shootout;
      s.shootout = { ...before!, disagreement: null };
      return () => { s.shootout = before; };
    }, /sds: shootout\.disagreement is set exactly when the inference is 'unverified'/);
  });

  it('a date correction names a contest GUID, a real date in a season window, and a source', () => {
    const overrides = DATA_QUALITY.contestDateOverrides as Record<string, { dateKey: string; timeTba: true; source: string }>;
    const id = 'fc8be1f8-e3e6-48dc-8b7a-eebc0f1f2ce0';
    const set = (key: string, value: { dateKey: string; timeTba: true; source: string }) => () => {
      const before = overrides[key];
      overrides[key] = value;
      return () => { if (before) overrides[key] = before; else delete overrides[key]; };
    };
    const ok = overrides[id];
    expectViolation(set('fc8be1f8', ok), /contestDateOverrides: fc8be1f8 is not a contest GUID/);
    expectViolation(set(id, { ...ok, dateKey: '2026-09-31' }), /dateKey 2026-09-31 is not a valid YYYY-MM-DD date/);
    expectViolation(set(id, { ...ok, dateKey: '2027-03-01' }), /2027-03-01 is outside every section's season window/);
    expectViolation(set(id, { ...ok, source: ' ' }), /contestDateOverrides fc8be1f8-e3e6-48dc-8b7a-eebc0f1f2ce0: needs a source/);
    expectViolation(set('c7dbdbcc-5f41-4192-b8b2-eb79cca2523a', ok), /c7dbdbcc-5f41-4192-b8b2-eb79cca2523a: the contest is excluded/);
  });

  it('a section’s shootout rule and its leagues’ leagueOvertime agree both ways', () => {
    expectViolation(() => {
      const s = getSection('sds') as { shootout: SectionConfig['shootout'] };
      const before = s.shootout;
      s.shootout = null;
      return () => { s.shootout = before; };
    }, /city: leagueOvertime 'shootout' exactly when its section sds has a shootout rule/);
    expectViolation(() => {
      const r = getLeague('metro').rules as { leagueOvertime: string };
      r.leagueOvertime = 'none';
      return () => { r.leagueOvertime = 'shootout'; };
    }, /metro: leagueOvertime 'shootout' exactly when its section sds has a shootout rule/);
  });

  it('a missing MaxPreps table names nothing and has no rows; a present one is a GUID with a name and slug', () => {
    expectViolation(() => {
      const d = getDivision('valley') as { maxprepsSlug: string | null };
      d.maxprepsSlug = 'valley';
      return () => { d.maxprepsSlug = null; };
    }, /valley: maxprepsLeagueId null needs maxprepsName and maxprepsSlug null/);
    expectViolation(() => {
      const d = getDivision('valley') as { maxprepsTeamCount: number; maxprepsMissing: readonly string[] };
      const before = d.maxprepsMissing;
      d.maxprepsTeamCount = 1;
      d.maxprepsMissing = before.slice(1);
      return () => { d.maxprepsTeamCount = 0; d.maxprepsMissing = before; };
    }, /valley: maxprepsLeagueId null needs maxprepsTeamCount 0/);
    expectViolation(() => {
      const d = getDivision('palomar') as { maxprepsName: string | null };
      d.maxprepsName = null;
      return () => { d.maxprepsName = 'Palomar'; };
    }, /palomar: a MaxPreps table needs maxprepsName and maxprepsSlug/);
    expectViolation(() => {
      const d = getDivision('palomar') as { maxprepsLeagueId: string | null };
      d.maxprepsLeagueId = 'palomar';
      return () => { d.maxprepsLeagueId = 'e4a7e9c3-986b-446f-8547-8348be95e282'; };
    }, /palomar: maxprepsLeagueId palomar is not a GUID/);
  });

  it('gamesPerTeam null only on a contest-type or membership league with no official schedule', () => {
    expectViolation(() => {
      const d = getDivision('de-anza') as { gamesPerTeam: number | null };
      d.gamesPerTeam = null;
      return () => { d.gamesPerTeam = 12; };
    }, /de-anza: gamesPerTeam null needs/);
  });

  it("'membership' only with official mode 'none'; 'none' never on an official-fixtures league", () => {
    expectViolation(() => {
      const d = getDivision('avocado') as { official: unknown };
      const before = d.official;
      d.official = {
        mode: 'bundled', source: 'pcal-pdf', scheduleUrl: 'https://example.org/a.pdf', bundledFile: 'data/official/x.json',
        revisionCheckUrl: 'https://example.org/a.pdf', bundledSha256: 'a'.repeat(64), revisedOn: null,
      };
      return () => { d.official = before; };
    }, /avocado: classification 'membership' needs official mode 'none'/);
  });

  it('no postseason: a note, a source, no postseasonFrom', () => {
    expectViolation(() => {
      const ps = getLeague('sunset').postseason as { note: string };
      const before = ps.note;
      ps.note = '';
      return () => { ps.note = before; };
    }, /sunset: a no-postseason league needs a note/);
    expectViolation(() => {
      const r = getLeague('sunset').rules as { postseasonFrom: string | null };
      r.postseasonFrom = '2026-11-01';
      return () => { r.postseasonFrom = null; };
    }, /sunset: a no-postseason league has no postseasonFrom/);
    expectViolation(() => {
      const ps = getLeague('sunset').postseason as { sourceUrl: string };
      const before = ps.sourceUrl;
      ps.sourceUrl = 'http://cifss.org/';
      return () => { ps.sourceUrl = before; };
    }, /sunset: postseason sourceUrl must start with https/);
  });

  it('section playoffs: only 1st is a league route, the dates follow league play, every member has a playoff division', () => {
    expectViolation(() => {
      const rung = getLeague('city').postseason.ladder[1] as { status: PlayoffStatus };
      rung.status = 'tournament';
      return () => { rung.status = 'selection'; };
    }, /city: ladder rung \[2, 99\] is tournament, but only place 1 \(and only it\) is 'tournament'/);
    expectViolation(() => {
      const dates = (getLeague('north-county').postseason as { dates: { first: string } }).dates;
      dates.first = '2026-10-30';
      return () => { dates.first = '2026-11-02'; };
    }, /avocado: postseason dates\.first is not after leaguePlay\.last/);
    expectViolation(() => {
      const r = getLeague('metro').rules as { postseasonFrom: string | null };
      r.postseasonFrom = null;
      return () => { r.postseasonFrom = '2026-11-02'; };
    }, /metro: section playoffs need postseasonFrom on or before dates\.first/);
    expectViolation(() => {
      const ps = getLeague('metro').postseason as { playoffDivisionOf: Record<string, string> };
      const before = ps.playoffDivisionOf;
      ps.playoffDivisionOf = Object.fromEntries(Object.entries(before).filter(([slug]) => slug !== 'southwest'));
      return () => { ps.playoffDivisionOf = before; };
    }, /metro: 8 playoff divisions for 9 teams/);
    expectViolation(() => {
      const ps = getLeague('metro').postseason as { playoffDivisionOf: Record<string, string> };
      const before = ps.playoffDivisionOf;
      ps.playoffDivisionOf = { ...before, hilltop: 'III' };
      return () => { ps.playoffDivisionOf = before; };
    }, /metro: playoffDivisionOf hilltop is III, not I or II/);
    expectViolation(() => {
      const ps = getLeague('city').postseason as { powerRankingsUrl: string };
      const before = ps.powerRankingsUrl;
      ps.powerRankingsUrl = 'cifsds.org';
      return () => { ps.powerRankingsUrl = before; };
    }, /city: postseason sourceUrl and powerRankingsUrl must start with https/);
  });

  it("the CCS ladder stays inside the CCS", () => {
    expectViolation(() => {
      const l = getLeague('scval') as { sectionId: string };
      l.sectionId = 'ncs';
      return () => { l.sectionId = 'ccs'; };
    }, /scval: a CCS ladder league outside the CCS/);
  });
});

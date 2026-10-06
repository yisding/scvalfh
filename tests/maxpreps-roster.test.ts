/**
 * The MaxPreps roster page: the positional key list, the rendered-table cross-check, and drift.
 * The 15 captures are SCVAL's, the first league captured; every league's page is the same page.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { MaxPrepsError } from '../lib/sources/maxpreps';
import {
  COL,
  GRADE_LABELS,
  ROSTER_KEYS,
  ROSTER_ROW_LENGTH,
  careerIdFromUrl,
  parseRosterPage,
  pendingRoster,
  parseRosterTable,
  rosterUrl,
} from '../lib/sources/maxpreps-roster';
import { RostersSchema, countRosters } from '../lib/rosters-schema';
import { SPORT_SEASON_ID } from '../lib/season';
import { TEAMS, getTeamBySlug, teamsInLeague } from '../lib/teams';
import { FIXTURE_DIR } from './helpers';

const fixture = (slug: string) => readFileSync(path.join(FIXTURE_DIR, `roster-${slug}.html`), 'utf8');

function parse(slug: string) {
  const team = getTeamBySlug(slug)!;
  return parseRosterPage(fixture(slug), {
    expectedTeamId: team.dataCoverage === 'none' ? undefined : team.id,
    url: slug,
  });
}

/** Edit the fixture's __NEXT_DATA__ pageProps in place, leaving the rendered table alone. */
function withPageProps(html: string, edit: (pp: Record<string, unknown>) => void): string {
  return html.replace(
    /(<script id="__NEXT_DATA__"[^>]*>)([\s\S]*?)(<\/script>)/,
    (_m, open: string, body: string, close: string) => {
      const data = JSON.parse(body) as { props: { pageProps: Record<string, unknown> } };
      edit(data.props.pageProps);
      return `${open}${JSON.stringify(data)}${close}`;
    },
  );
}

type Row = unknown[];
const rows = (pp: Record<string, unknown>) => pp.athleteData as Row[];

/** Players per team in the 2026-10-02 captures, after the one soft-deleted row is dropped. */
const EXPECTED: Record<string, number> = {
  'st-ignatius': 23,
  'saint-francis': 25,
  'los-altos': 22,
  'valley-christian': 30,
  fremont: 18,
  cupertino: 15,
  homestead: 24,
  mitty: 22,
  'los-gatos': 58,
  'palo-alto': 19,
  presentation: 16,
  'santa-clara': 16,
  saratoga: 22,
  lynbrook: 15,
  'monta-vista': 16,
};

describe('maxpreps roster: the key list', () => {
  it("is MaxPreps' own 37-key GSSP_ROSTER_SERIALIZE_KEYS, in order", () => {
    expect(ROSTER_ROW_LENGTH).toBe(37);
    expect(new Set(ROSTER_KEYS).size).toBe(37);
    expect(COL.athleteId).toBe(4);
    expect(COL.firstName).toBe(5);
    expect(COL.classYear).toBe(7);
    expect(COL.jersey).toBe(8);
    expect(COL.heightInches).toBe(9);
    expect(COL.heightFeet).toBe(10);
    expect(COL.position1).toBe(12);
    expect(COL.isCaptain).toBe(16);
    expect(COL.isDeleted).toBe(17);
    expect(COL.schoolId).toBe(26);
    expect(COL.sportSeasonId).toBe(27);
    expect(COL.careerProfileId).toBe(29);
    expect(COL.createdOn).toBe(30);
    expect(COL.canonicalUrl).toBe(31);
    expect(COL.formattedPositions).toBe(32);
    expect(COL.formattedName).toBe(33);
    expect(COL.formattedClassYear).toBe(36);
  });

  it("builds the roster URL from the registry's canonical team URL, never a slug", () => {
    expect(rosterUrl(getTeamBySlug('los-altos')!)).toBe(
      'https://www.maxpreps.com/ca/los-altos/los-altos-eagles/field-hockey/roster/',
    );
    for (const team of TEAMS) expect(rosterUrl(team)).toMatch(/^https:\/\/www\.maxpreps\.com\/.+\/field-hockey\/roster\/$/);
  });

  it('reads the ?careerid= short key', () => {
    expect(careerIdFromUrl('https://www.maxpreps.com/x/athletes/a-b/?careerid=6jijuu90hc0o8')).toBe('6jijuu90hc0o8');
    expect(careerIdFromUrl('https://www.maxpreps.com/x/athletes/a-b/')).toBeNull();
    expect(careerIdFromUrl(null)).toBeNull();
  });
});

describe('maxpreps roster: the 15 captures of 2026-10-02', () => {
  it.each(Object.entries(EXPECTED))('%s decodes and matches its rendered table (%i players)', (slug, n) => {
    const page = parse(slug);
    expect(page.players.length).toBe(n);
    expect(page.athleteCount).toBe(n);
    for (const p of page.players) {
      expect(p.fullName).not.toBe('');
      expect(p.fullName).toBe([p.firstName, p.lastName].filter(Boolean).join(' '));
      if (p.grade !== null) expect(GRADE_LABELS[p.grade]).toBe(p.gradeClass);
      else expect(p.gradeClass).toBeNull();
      expect(p.position).toBe(p.positions.length ? p.positions.join(', ') : null);
      expect(p.careerUrl).toMatch(/^https:\/\/www\.maxpreps\.com\//);
      expect(p.careerId).not.toBeNull();
      expect(p.careerProfileId).not.toBeNull();
    }
  });

  it('every registry team has a fixture and the fixture is for that team', () => {
    for (const team of teamsInLeague('scval')) {
      const page = parse(team.slug);
      if (team.dataCoverage !== 'none') expect(page.teamId).toBe(team.id);
    }
  });

  it('drops the soft-deleted row MaxPreps hides, and says so (Santa Clara: 17 rows, 16 shown)', () => {
    const page = parse('santa-clara');
    expect(page.deletedRows).toBe(1);
    expect(page.players.length).toBe(16);
    expect(page.athleteCount).toBe(16);
    expect(page.warnings).toContain('dropped 1 soft-deleted row (isDeleted)');
  });

  it('renders an empty roster as no players, no table and no error', () => {
    // roster-empty.html is a real 2026-10-02 capture of a MaxPreps roster with no athletes, from
    // a school that is not fielding a team (so not in the registry).
    expect(parseRosterTable(fixture('empty'))).toBeNull();
    const page = parseRosterPage(fixture('empty'), { url: 'empty' });
    expect(page.players).toEqual([]);
    expect(page.athleteCount).toBe(0);
    expect(page.warnings).toEqual([]);
  });

  it('matches the table by career link, not by row order (Mitty lists its jersey-less players first)', () => {
    const table = parseRosterTable(fixture('mitty'))!;
    const page = parse('mitty');
    expect(table[0].jersey).toBeNull();
    expect(page.players[0].jersey).not.toBeNull();
    expect(table.map((r) => r.name).sort()).toEqual(page.players.map((p) => p.fullName).sort());
  });

  it('joins several positions the way the table prints them', () => {
    const multi = parse('mitty').players.filter((p) => p.positions.length > 1);
    expect(multi.length).toBe(9);
    for (const p of multi) expect(p.position).toBe(p.positions.join(', '));
  });

  it('reads the captain flag the page renders as a badge', () => {
    const captains = Object.fromEntries(
      Object.keys(EXPECTED).map((slug) => [slug, parse(slug).players.filter((p) => p.isCaptain).length]),
    );
    expect(captains['st-ignatius']).toBe(2);
    expect(captains['valley-christian']).toBe(4);
    expect(captains['palo-alto']).toBe(3);
    expect(captains['monta-vista']).toBe(4);
    expect(Object.values(captains).reduce((a, b) => a + b, 0)).toBe(13);
  });

  it('reads heights as feet and inches, as the table prints them (Saint Francis)', () => {
    const page = parse('saint-francis');
    const withHeight = page.players.filter((p) => p.height !== null);
    expect(withHeight.length).toBe(25);
    for (const p of withHeight) {
      const m = /^(\d)'(\d{1,2})"$/.exec(p.height!)!;
      expect(m).not.toBeNull();
      expect(p.heightInches).toBe(Number(m[1]) * 12 + Number(m[2]));
    }
    expect(parse('los-altos').players.every((p) => p.height === null && p.heightInches === null)).toBe(true);
  });

  it('keeps the jersey a string, so "00" and "21/88" survive', () => {
    const vc = parse('valley-christian');
    expect(vc.players.some((p) => p.jersey === '21/88')).toBe(true);
    expect(parse('mitty').players.some((p) => p.jersey === '00')).toBe(true);
  });

  it('stores a blank as null, never as 0 or ""', () => {
    for (const slug of Object.keys(EXPECTED)) {
      for (const p of parse(slug).players) {
        expect(p.jersey).not.toBe('');
        expect(p.grade).not.toBe(0);
        expect(p.gradeClass).not.toBe('');
        expect(p.position).not.toBe('');
        expect(p.height).not.toBe('');
        expect(p.positions).not.toContain('');
      }
    }
  });

  it('names-only programs come through as names only (Los Gatos publishes 58 names and nothing else)', () => {
    const page = parse('los-gatos');
    expect(page.players.length).toBe(58);
    expect(page.players.every((p) => p.grade === null && p.position === null && p.jersey === null)).toBe(true);
  });
});

describe('maxpreps roster: drift is loud', () => {
  const html = fixture('st-ignatius');
  const SI = getTeamBySlug('st-ignatius')!.id;
  const parseIt = (h: string) => parseRosterPage(h, { expectedTeamId: SI, url: 'test' });

  it('a column added upstream (38-element rows) throws', () => {
    const drifted = withPageProps(html, (pp) => rows(pp).forEach((r) => r.push(null)));
    expect(() => parseIt(drifted)).toThrow(/38 columns, expected 37/);
  });

  it('a column removed upstream (every value shifted) throws before anything is read', () => {
    const drifted = withPageProps(html, (pp) => rows(pp).forEach((r) => r.splice(0, 1)));
    expect(() => parseIt(drifted)).toThrow(MaxPrepsError);
  });

  it('a grade that disagrees with the rendered table throws', () => {
    const drifted = withPageProps(html, (pp) => {
      const r = rows(pp)[0];
      r[COL.classYear] = 9;
      r[COL.formattedClassYear] = 'Fr.';
    });
    expect(() => parseIt(drifted)).toThrow(/grade is "Fr\." in athleteData but "Sr\." in the rendered table/);
  });

  it('a grade whose number and label disagree throws', () => {
    const drifted = withPageProps(html, (pp) => {
      rows(pp)[0][COL.classYear] = 11;
    });
    expect(() => parseIt(drifted)).toThrow(/classYear 11 and formattedClassYear "Sr\." disagree/);
  });

  it('a position that disagrees with the rendered table throws', () => {
    const drifted = withPageProps(html, (pp) => {
      const r = rows(pp)[0];
      r[COL.position1] = 'G';
      r[COL.formattedPositions] = 'G';
    });
    expect(() => parseIt(drifted)).toThrow(/position is "G" in athleteData but "F" in the rendered table/);
  });

  it('a name that disagrees with the rendered table throws (matched by its career link)', () => {
    const drifted = withPageProps(html, (pp) => {
      const r = rows(pp)[0];
      r[COL.firstName] = 'Someone';
      r[COL.formattedName] = 'Someone Lewis';
    });
    expect(() => parseIt(drifted)).toThrow(/name is "Someone Lewis" in athleteData but "Storey Lewis" in the rendered table/);
  });

  it('a row whose link and name are both unknown to the table throws', () => {
    const drifted = withPageProps(html, (pp) => {
      const r = rows(pp)[0];
      r[COL.formattedName] = 'Someone Else';
      r[COL.canonicalUrl] = 'https://www.maxpreps.com/x/athletes/someone-else/?careerid=zzz';
    });
    expect(() => parseIt(drifted)).toThrow(/Someone Else .* is in athleteData but not in the rendered table/);
  });

  it('a row the table does not show (without the deleted flag) throws', () => {
    const drifted = withPageProps(html, (pp) => {
      const extra = [...rows(pp)[0]];
      extra[COL.formattedName] = 'Extra Player';
      extra[COL.canonicalUrl] = 'https://www.maxpreps.com/x/athletes/extra-player/?careerid=zzz';
      rows(pp).push(extra);
    });
    expect(() => parseIt(drifted)).toThrow(/rendered table has 23 rows, athleteData has 24 undeleted rows/);
  });

  it('a redesigned table header throws', () => {
    expect(() => parseIt(html.replace('>Grade<', '>Year<'))).toThrow(/roster table headers changed/);
  });

  it("another season's page throws", () => {
    const drifted = withPageProps(html, (pp) => {
      (pp.countData as Record<string, unknown>).sportSeasonId = 'another-season';
    });
    expect(() => parseIt(drifted)).toThrow(/sportSeasonId another-season, expected/);
    const driftedRow = withPageProps(html, (pp) => {
      rows(pp)[0][COL.sportSeasonId] = 'another-season';
    });
    expect(() => parseIt(driftedRow)).toThrow(/not the current sportSeasonId/);
    expect(SPORT_SEASON_ID).toBe('e302eb3e-1a32-4f2d-934b-6f9d454f721e');
  });

  it("another team's page throws (the Presentation URL once served Los Gatos)", () => {
    expect(() => parseRosterPage(html, { expectedTeamId: getTeamBySlug('presentation')!.id, url: 'test' })).toThrow(
      /page is for team .* expected/,
    );
  });

  it('a page without __NEXT_DATA__ throws', () => {
    expect(() => parseIt('<html><body>maintenance</body></html>')).toThrow(/__NEXT_DATA__/);
  });
});

describe('maxpreps roster: one career link on two rows (Huntington Beach, 2026-10-06)', () => {
  // MaxPreps lists Valentina D'Angelo twice: one row "D'Angelo" (Sr., F) and one "D'angelo" with no
  // grade, both linking the same career page, both rendered in the table. Each athleteData row takes
  // its own table row (exact name first), the field checks pass, and the duplicate is a warning: the
  // page is read as MaxPreps publishes it, never merged and never dropped.
  it('reads both rows and warns about the duplicate career id', () => {
    const roster = parse('huntington-beach');
    expect(roster.players).toHaveLength(17);
    expect(roster.athleteCount).toBe(17);
    expect(roster.players.filter((p) => p.careerId === 'k0qcpr2eeq0n7').map((p) => [p.fullName, p.gradeClass, p.position])).toEqual([
      ["Valentina D'Angelo", 'Sr.', 'F'],
      ["Valentina D'angelo", null, null],
    ]);
    expect(roster.warnings).toEqual([
      `duplicate career id 2a9d3bf3-fc27-42cd-8a79-97cb3c3d4bb2: "Valentina D'Angelo" and "Valentina D'angelo"`,
    ]);
  });

  it('still fails when two athleteData rows share a link the table shows once', () => {
    const html = fixture('huntington-beach');
    // Drop the second rendered row of the shared link: two athleteData rows, one table row.
    const marker = 'valentina-dangelo/?careerid=k0qcpr2eeq0n7';
    const first = html.indexOf(marker);
    const second = html.indexOf(marker, first + marker.length);
    const rowStart = html.lastIndexOf('<tr', second);
    const rowEnd = html.indexOf('</tr>', second) + '</tr>'.length;
    expect(second).toBeGreaterThan(first);
    expect(() => parseRosterPage(html.slice(0, rowStart) + html.slice(rowEnd), { url: 'hb' })).toThrow(
      /rendered table has 16 rows, athleteData has 17 undeleted rows/,
    );
  });
});

describe('every league has a roster page URL and a claim-free placeholder', () => {
  it('rosterUrl is the team page plus roster/, for all 102 teams', () => {
    expect(TEAMS).toHaveLength(102);
    for (const team of TEAMS) {
      expect(rosterUrl(team), team.slug).toBe(`${team.external.maxprepsTeamUrl!.replace(/\/+$/, '')}/roster/`);
    }
  });

  it('pendingRoster is a valid status-pending entry for every team, and fills a whole file', () => {
    const teams = TEAMS.map((t) => pendingRoster(t));
    for (const t of teams) {
      expect(t.status).toBe('pending');
      expect(t.players).toEqual([]);
      expect(t.fetchedAt).toBeNull();
      expect(t.athleteCount).toBeNull();
      expect(t.rosterUrl).toBe(rosterUrl(getTeamBySlug(t.slug)!));
    }
    const file = {
      season: '26-27',
      fetchedAt: '2026-10-02T00:00:00.000Z',
      source: { id: 'maxpreps-html' as const, builtBy: 'test', notes: [] },
      teams,
      counts: countRosters(teams),
    };
    expect(RostersSchema.safeParse(file).success).toBe(true);
  });
});

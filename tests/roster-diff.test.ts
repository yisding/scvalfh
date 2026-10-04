/**
 * lib/roster-diff.ts and scripts/roster-diff.ts: what the weekly update-people workflow says on its
 * pull request about a roster change, and which research records it sends back for a second look.
 * The CLI must work exactly when a roster change has broken the research join, so the last block
 * runs it on such a change and expects it to succeed.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  diffRosters,
  formatRosterDiffLine,
  formatRosterDiffMarkdown,
  needsReview,
  researchRefs,
  type EnrichmentRecord,
  type ResearchFiles,
} from '../lib/roster-diff';
import type { RosterPlayer, Rosters, TeamRoster } from '../lib/rosters-schema';
import { REPO } from './helpers';

function player(id: string, fullName: string, extra: Partial<RosterPlayer> = {}): RosterPlayer {
  return {
    athleteId: id,
    rosterId: `r-${id}`,
    careerProfileId: `cp-${id}`,
    careerId: `c-${id}`,
    careerUrl: null,
    firstName: null,
    lastName: null,
    fullName,
    jersey: null,
    grade: null,
    gradeClass: null,
    positions: [],
    position: null,
    height: null,
    heightInches: null,
    isCaptain: false,
    createdOn: null,
    ...extra,
  } as RosterPlayer;
}

function team(slug: string, players: RosterPlayer[], extra: Partial<TeamRoster> = {}): TeamRoster {
  return {
    slug,
    teamId: `t-${slug}`,
    maxprepsTeamId: `t-${slug}`,
    name: slug,
    division: 'x',
    rosterUrl: null,
    status: players.length ? 'ok' : 'empty',
    athleteCount: players.length,
    staffCount: 0,
    players,
    deletedRows: 0,
    warnings: [],
    fetchedAt: '2026-10-05T13:00:00.000Z',
    error: null,
    ...extra,
  } as TeamRoster;
}

const roster = (teams: TeamRoster[], season = '26-27') => ({ season, teams }) as Pick<Rosters, 'season' | 'teams'>;

const ann = player('a1', 'Ann Lee', { grade: 10, gradeClass: 'So.', jersey: '7' });
const bea = player('b1', 'Bea Cruz', { grade: 12, gradeClass: 'Sr.' });
const cat = player('c1', 'Cat Diaz', { grade: 11, gradeClass: 'Jr.', jersey: '3' });
const BEFORE = roster([team('los-altos', [ann, bea]), team('palo-alto', [cat]), team('gunn', [])]);

describe('diffRosters', () => {
  it('finds nothing between a file and itself', () => {
    const diff = diffRosters(BEFORE, BEFORE);
    expect(diff.teams).toEqual([]);
    expect(diff.totals).toEqual({ added: 0, removed: 0, changed: 0, teams: 0 });
    expect(needsReview(diff)).toBe(false);
    expect(formatRosterDiffLine(diff)).toBe('no player changed');
  });

  it('counts added, removed and changed rows, listing changed fields in a fixed order', () => {
    const after = roster([
      team('los-altos', [{ ...ann, jersey: '9', grade: 11, gradeClass: 'Jr.', isCaptain: true }, player('d1', 'Dee Fox')]),
      team('palo-alto', [{ ...cat, fullName: 'Cat Díaz' }]),
      team('gunn', []),
    ]);
    const diff = diffRosters(BEFORE, after);
    expect(diff.teams.map((t) => t.slug)).toEqual(['los-altos', 'palo-alto']);
    const la = diff.teams[0];
    expect(la.added.map((p) => p.fullName)).toEqual(['Dee Fox']);
    expect(la.removed.map((p) => p.fullName)).toEqual(['Bea Cruz']);
    expect(la.changed).toEqual([
      {
        athleteId: 'a1',
        fullName: 'Ann Lee',
        changes: [
          { field: 'grade', before: 10, after: 11 },
          { field: 'jersey', before: '7', after: '9' },
          { field: 'isCaptain', before: false, after: true },
        ],
      },
    ]);
    expect(diff.teams[1].changed[0].changes).toEqual([{ field: 'fullName', before: 'Cat Diaz', after: 'Cat Díaz' }]);
    expect(diff.totals).toEqual({ added: 1, removed: 1, changed: 2, teams: 2 });
    expect(needsReview(diff)).toBe(true);
    expect(formatRosterDiffLine(diff)).toBe('1 added, 1 removed, 2 changed on 2 teams');
  });

  it('ignores a reorder: MaxPreps serves the same rows in another order from one read to the next', () => {
    const after = roster([team('los-altos', [bea, ann]), team('palo-alto', [cat]), team('gunn', [])]);
    const diff = diffRosters(BEFORE, after);
    expect(diff.teams).toEqual([]);
    expect(needsReview(diff)).toBe(false);
  });

  it('treats every row as added on a first run', () => {
    const diff = diffRosters(null, BEFORE);
    expect(diff.totals).toEqual({ added: 3, removed: 0, changed: 0, teams: 2 });
    expect(diff.teams.find((t) => t.slug === 'gunn')?.statusBefore).toBeNull();
  });

  it('lists a team that only failed, but a failure alone is not worth a review', () => {
    const after = roster([
      team('los-altos', [ann, bea], { status: 'carried-forward', error: 'HTTP 503' }),
      team('palo-alto', [cat]),
      team('gunn', [], { status: 'error', error: 'timeout' }),
    ]);
    const diff = diffRosters(BEFORE, after);
    expect(diff.teams.map((t) => [t.slug, t.statusBefore, t.statusAfter])).toEqual([
      ['los-altos', 'ok', 'carried-forward'],
      ['gunn', 'empty', 'error'],
    ]);
    expect(needsReview(diff)).toBe(false);
    expect(formatRosterDiffLine(diff)).toBe('2 team statuses changed');
  });

  it('is worth a review when a team recovers or empties, or the season changes', () => {
    const failed = roster([team('los-altos', [ann, bea], { status: 'carried-forward' }), team('palo-alto', [cat]), team('gunn', [])]);
    expect(needsReview(diffRosters(failed, BEFORE))).toBe(true);
    const emptied = roster([team('los-altos', [ann, bea]), team('palo-alto', [], { status: 'empty' }), team('gunn', [])]);
    expect(needsReview(diffRosters(BEFORE, emptied))).toBe(true);
    const next = diffRosters(BEFORE, roster(BEFORE.teams, '27-28'));
    expect(needsReview(next)).toBe(true);
    expect(formatRosterDiffMarkdown(next, [])).toContain('**The season changed (26-27 → 27-28).**');
  });
});

describe('researchRefs', () => {
  const overlay = (id: string, fullName: string, extra: Partial<EnrichmentRecord> = {}): EnrichmentRecord => ({
    athleteId: id,
    fullName,
    grade: null,
    jersey: null,
    positions: null,
    height: null,
    conflicts: [],
    profiles: [],
    ...extra,
  });
  const files: ResearchFiles = {
    enrichment: {
      teams: [
        {
          slug: 'los-altos',
          players: [
            overlay('a1', 'Ann Lee', { conflicts: [{ field: 'jersey' }], profiles: [{ classOf: 2028 }] }),
            overlay('b1', 'Bea Cruz'),
          ],
        },
        { slug: 'palo-alto', players: [overlay('c1', 'Cat Diaz', { height: { value: `5'6"`, inches: 66 } })] },
      ],
    },
    clubs: {
      affiliations: [
        { teamSlug: 'los-altos', athleteId: 'b1', fullName: 'Bea Cruz', club: 'sf-hawks' },
        { teamSlug: 'palo-alto', athleteId: 'c1', fullName: 'Cat Diaz', club: 'fly-fhc' },
        { teamSlug: 'gunn', athleteId: 'zz', fullName: 'Untouched Row', club: 'fly-fhc' },
      ],
    },
    commits: {
      commitments: [{ teamSlug: 'los-altos', athleteId: 'a1', fullName: 'Ann Lee', college: 'colgate', sport: 'field hockey' }],
    },
  };

  it('names every record whose row changed, with the reason, and no other', () => {
    const after = roster([
      team('los-altos', [{ ...ann, grade: 11, gradeClass: 'Jr.', jersey: '9' }]),
      team('palo-alto', [{ ...cat, fullName: 'Cat Díaz', height: `5'7"`, heightInches: 67 }]),
      team('gunn', []),
    ]);
    const refs = researchRefs(diffRosters(BEFORE, after), files);
    expect(refs.map((r) => [r.file, r.teamSlug, r.fullName, r.record, r.reasons])).toEqual([
      [
        'rosters-enrichment',
        'los-altos',
        'Ann Lee',
        'overlay entry',
        ['grade 10 → 11: re-check every stated class year', `the jersey conflict was recorded against MaxPreps' "7", now "9"`],
      ],
      ['rosters-enrichment', 'los-altos', 'Bea Cruz', 'overlay entry', ['the row is gone from MaxPreps']],
      [
        'rosters-enrichment',
        'palo-alto',
        'Cat Diaz',
        'overlay entry',
        ['MaxPreps now spells the name "Cat Díaz"', `MaxPreps now has a height (5'7"); the overlay's height may only fill a blank`],
      ],
      ['clubs', 'los-altos', 'Bea Cruz', 'club sf-hawks', ['the row is gone from MaxPreps']],
      ['clubs', 'palo-alto', 'Cat Diaz', 'club fly-fhc', ['MaxPreps now spells the name "Cat Díaz"']],
      ['commits', 'los-altos', 'Ann Lee', 'commitment colgate (field hockey)', ['grade 10 → 11: re-check every stated class year']],
    ]);
  });

  it('points a removed row at the row the coach re-added under a new athleteId', () => {
    const after = roster([team('los-altos', [ann, { ...bea, athleteId: 'b2', rosterId: 'r-b2' }]), team('palo-alto', [cat]), team('gunn', [])]);
    const refs = researchRefs(diffRosters(BEFORE, after), files);
    expect(refs.find((r) => r.file === 'clubs')?.reasons).toEqual([
      'the row is gone from MaxPreps; "Bea Cruz" was added as athleteId b2',
    ]);
  });

  it('skips a research file it could not read', () => {
    const after = roster([team('los-altos', [ann]), team('palo-alto', [cat]), team('gunn', [])]);
    const refs = researchRefs(diffRosters(BEFORE, after), { enrichment: null, clubs: null, commits: files.commits });
    expect(refs).toEqual([]);
    expect(formatRosterDiffMarkdown(diffRosters(BEFORE, after), refs)).toContain(
      'No roster-overlay entry, club tie or commitment points at a row that changed.',
    );
  });

  it('puts the records in a table on the pull request', () => {
    const after = roster([team('los-altos', [ann]), team('palo-alto', [cat]), team('gunn', [])]);
    const md = formatRosterDiffMarkdown(diffRosters(BEFORE, after), researchRefs(diffRosters(BEFORE, after), files));
    expect(md).toContain('**0 added, 1 removed, 0 changed on 1 team.**');
    expect(md).toContain('- Removed: Bea Cruz (Sr.)');
    expect(md).toContain('| File | Team | Player | Record | Why |');
    expect(md).toContain('| clubs | los-altos | Bea Cruz | club sf-hawks | the row is gone from MaxPreps |');
  });
});

describe('scripts/roster-diff.ts on a change that breaks the research join', () => {
  const real = JSON.parse(readFileSync(path.join(REPO, 'data', 'rosters.json'), 'utf8')) as Rosters;
  const clubs = JSON.parse(readFileSync(path.join(REPO, 'data', 'clubs.json'), 'utf8')) as {
    affiliations: Array<{ teamSlug: string; athleteId: string; fullName: string; club: string }>;
  };
  const tie = clubs.affiliations[0];
  // The tied player respelled: lib/clubs.ts would throw at import on this file.
  const broken = structuredClone(real);
  const row = broken.teams.find((t) => t.slug === tie.teamSlug)!.players.find((p) => p.athleteId === tie.athleteId)!;
  row.fullName = `${row.fullName}x`;
  const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-roster-diff-'));
  const before = path.join(dir, 'before.json');
  const after = path.join(dir, 'after.json');
  writeFileSync(before, JSON.stringify(real));
  writeFileSync(after, JSON.stringify(broken));

  const run = (...args: string[]) => {
    const r = spawnSync(path.join(REPO, 'node_modules', '.bin', 'tsx'), [path.join(REPO, 'scripts', 'roster-diff.ts'), ...args], {
      cwd: REPO,
      encoding: 'utf8',
    });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };

  it('still reports, naming the broken tie', () => {
    const r = run(before, after);
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(r.out).toContain(`| clubs | ${tie.teamSlug} | ${tie.fullName} | club ${tie.club} | MaxPreps now spells the name "${tie.fullName}x"`);
  });

  it('prints the commit line and the review verdict', () => {
    expect(run(before, after, '--format', 'line').out).toBe('0 added, 0 removed, 1 changed on 1 team\n');
    expect(run(before, after, '--format', 'review').out).toBe('true\n');
    expect(run(before, before, '--format', 'review').out).toBe('false\n');
  });

  it('reads a missing earlier file as a first run, and refuses a bad flag', () => {
    expect(run(path.join(dir, 'nope.json'), after, '--format', 'line').out).toMatch(/^\d+ added, 0 removed, 0 changed on \d+ teams\n$/);
    const bad = run(before, after, '--format', 'html');
    expect(bad.code).toBe(1);
    expect(bad.err).toContain('--format takes one of markdown, line, review');
  });
});

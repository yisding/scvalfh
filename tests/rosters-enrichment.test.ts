/**
 * data/rosters-enrichment.json: the overlay validates, joins cleanly onto the MaxPreps file, fills
 * only blanks, records disagreements instead of applying them, and the merged view says where each
 * value came from.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  RosterEnrichmentSchema,
  type RosterEnrichment,
  type Rosters,
} from '../lib/rosters-schema';
import {
  getAllEnrichedRosters,
  getEnrichedTeamRoster,
  getRosterEnrichment,
  getRosters,
  getTeamRoster,
} from '../lib/rosters';
import { TEAMS } from '../lib/teams';
import { REPO } from './helpers';

const base = JSON.parse(readFileSync(path.join(REPO, 'data', 'rosters.json'), 'utf8')) as Rosters;
const raw = JSON.parse(
  readFileSync(path.join(REPO, 'data', 'rosters-enrichment.json'), 'utf8'),
) as RosterEnrichment;

describe('data/rosters-enrichment.json', () => {
  it('validates against the contract', () => {
    const parsed = RosterEnrichmentSchema.safeParse(raw);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 5))).toBe(true);
  });

  it('covers the 16 registry teams and the same season as the MaxPreps file', () => {
    expect(raw.teams.map((t) => t.slug).sort()).toEqual(TEAMS.map((t) => t.slug).sort());
    expect(raw.season).toBe(base.season);
    expect(raw.capturedAt).toBe(base.fetchedAt.slice(0, 10));
  });

  it('joins every record onto a MaxPreps row of the same team, by athleteId', () => {
    for (const t of raw.teams) {
      const ids = new Map(base.teams.find((b) => b.slug === t.slug)!.players.map((p) => [p.athleteId, p]));
      for (const e of t.players) {
        const p = ids.get(e.athleteId);
        expect(p, `${t.slug}: ${e.fullName}`).toBeDefined();
        expect(p!.fullName).toBe(e.fullName);
      }
    }
  });

  it('only fills blanks — never a value MaxPreps already has', () => {
    for (const t of raw.teams) {
      const ids = new Map(base.teams.find((b) => b.slug === t.slug)!.players.map((p) => [p.athleteId, p]));
      for (const e of t.players) {
        const p = ids.get(e.athleteId)!;
        if (e.grade) expect(p.grade, `${e.fullName} grade`).toBeNull();
        if (e.positions) expect(p.position, `${e.fullName} position`).toBeNull();
        if (e.jersey) expect(p.jersey, `${e.fullName} jersey`).toBeNull();
        if (e.height) expect(p.height, `${e.fullName} height`).toBeNull();
      }
    }
  });

  it('records a disagreement with MaxPreps instead of applying it', () => {
    const conflicts = raw.teams.flatMap((t) => t.players.flatMap((p) => p.conflicts.map((c) => ({ t: t.slug, p, c }))));
    expect(conflicts.length).toBeGreaterThanOrEqual(10);
    for (const { t, p, c } of conflicts) {
      expect(c.kept, `${t} ${p.fullName} ${c.field}`).not.toBe(c.other);
      expect(c.source).toMatch(/^https:\/\//);
    }
    // Monta Vista's school profiles disagree with MaxPreps on six numbers; MaxPreps' stay.
    const mv = raw.teams.find((t) => t.slug === 'monta-vista')!;
    const jerseyConflicts = mv.players.filter((p) => p.conflicts.some((c) => c.field === 'jersey'));
    expect(jerseyConflicts.length).toBe(6);
    expect(jerseyConflicts.every((p) => p.jersey === null)).toBe(true);
    const merged = getEnrichedTeamRoster('monta-vista')!;
    expect(new Set(merged.players.map((p) => p.jersey)).size).toBe(merged.players.length);
  });

  it('tags every filled value with a source, a kind and a confidence', () => {
    for (const t of raw.teams) {
      for (const e of t.players) {
        for (const v of [e.grade, e.positions, e.jersey, e.height]) {
          if (!v) continue;
          expect(v.source).toMatch(/^https:\/\//);
          expect(['high', 'medium', 'low']).toContain(v.confidence);
        }
        if (e.grade?.derived) expect(e.grade.kind).toBe('maxpreps-career');
      }
    }
  });

  it('what it adds, as captured on 2026-10-02', () => {
    const all = raw.teams.flatMap((t) => t.players);
    const n = (k: 'grade' | 'positions' | 'jersey' | 'height') => all.filter((p) => p[k] !== null).length;
    expect(n('grade')).toBe(133);
    expect(n('positions')).toBe(9);
    expect(n('height')).toBe(23);
    expect(n('jersey')).toBe(0);
    expect(all.filter((p) => p.level !== null).length).toBe(56);
    // The level split only exists for Los Gatos, whose MaxPreps list is the whole program.
    expect(raw.teams.filter((t) => t.players.some((p) => p.level !== null)).map((t) => t.slug)).toEqual(['los-gatos']);
    const lg = raw.teams.find((t) => t.slug === 'los-gatos')!;
    expect(lg.players.filter((p) => p.level === 'varsity').length).toBe(27);
    expect(lg.players.filter((p) => p.level === 'jv').length).toBe(29);
  });

  it('names no coach from a rejected or unverifiable source', () => {
    for (const t of raw.teams) {
      for (const c of t.coaches) expect(c.source).not.toMatch(/si\.com/);
    }
    expect(raw.teams.find((t) => t.slug === 'wilcox')!.coaches).toEqual([]);
  });

  it('refuses a record that would overwrite MaxPreps (asserted at load, not just by the schema)', () => {
    const bad = structuredClone(raw);
    const si = bad.teams.find((t) => t.slug === 'st-ignatius')!;
    // Storey Lewis has a MaxPreps grade (12); her existing record (a height) must not add one.
    const storey = base.teams.find((t) => t.slug === 'st-ignatius')!.players[0];
    expect(storey.grade).toBe(12);
    const record = si.players.find((p) => p.athleteId === storey.athleteId)!;
    record.grade = { value: 11, derived: false, kind: 'school-site', source: 'https://example.com/', confidence: 'high', note: null };
    // The schema alone accepts it (it cannot see the base file)...
    expect(RosterEnrichmentSchema.safeParse(bad).success).toBe(true);
    // ...which is why lib/rosters.ts re-checks the join at load. Exercise that check in a child
    // process with the bad file swapped in.
    const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-enrich-'));
    const file = path.join(dir, 'bad.json');
    writeFileSync(file, JSON.stringify(bad));
    let out = '';
    try {
      execFileSync(
        path.join(REPO, 'node_modules', '.bin', 'tsx'),
        ['-e', "import('./lib/rosters.ts').then(() => console.log('LOADED'))"],
        { cwd: REPO, stdio: 'pipe', env: { ...process.env, SCVAL_ROSTERS_ENRICHMENT: file } },
      );
    } catch (err) {
      out = String((err as { stderr?: Buffer }).stderr ?? '');
    }
    expect(out).toMatch(/grade would overwrite a MaxPreps value/);
  });
});

describe('lib/rosters.ts merged view', () => {
  it('fills blanks from the overlay and says where each value came from', () => {
    const cup = getEnrichedTeamRoster('cupertino')!;
    expect(getTeamRoster('cupertino')!.players.every((p) => p.grade === null)).toBe(true);
    expect(cup.players.every((p) => p.grade !== null)).toBe(true);
    for (const p of cup.players) {
      expect(p.provenance.grade).not.toBe('maxpreps');
      expect(p.provenance.grade).not.toBeNull();
      expect((p.provenance.grade as { kind: string }).kind).toBe('school-site');
      expect(p.gradeClass).toBe((['Fr.', 'So.', 'Jr.', 'Sr.'] as const)[p.grade! - 9]);
    }
    const si = getEnrichedTeamRoster('st-ignatius')!;
    const storey = si.players.find((p) => p.fullName === 'Storey Lewis')!;
    expect(storey.provenance.grade).toBe('maxpreps');
    expect(storey.height).toMatch(/^\d'\d{1,2}"$/);
    expect((storey.provenance.height as { kind: string }).kind).toBe('school-site');
    const gigi = si.players.find((p) => p.fullName === 'Gigi Colant')!;
    expect(gigi.sourceName).toBe('Gabriella Colant');
  });

  it('keeps MaxPreps where a source disagrees, and exposes the disagreement', () => {
    const mv = getEnrichedTeamRoster('monta-vista')!;
    const weafer = mv.players.find((p) => p.fullName === 'Elizabeth Weafer')!;
    expect(weafer.jersey).toBe('6');
    expect(weafer.conflicts).toEqual([
      expect.objectContaining({ field: 'jersey', kept: '6', other: '9', kind: 'school-site' }),
    ]);
    const paly = getEnrichedTeamRoster('palo-alto')!;
    const ella = paly.players.find((p) => p.fullName === 'Ella Renazco-Sperling')!;
    expect(ella.position).toBe('F');
    expect(ella.conflicts[0]).toEqual(expect.objectContaining({ field: 'position', other: 'M', kind: 'news' }));
  });

  it('carries the Los Gatos squad split and the coaches', () => {
    const lg = getEnrichedTeamRoster('los-gatos')!;
    expect(lg.players.length).toBe(58);
    expect(lg.players.filter((p) => p.level === 'varsity').length).toBe(27);
    expect(lg.players.filter((p) => p.level === 'jv').length).toBe(29);
    expect(lg.players.filter((p) => p.level === null).length).toBe(2);
    expect(lg.coaches.map((c) => c.role)).toContain('Head Coach');
    expect(getEnrichedTeamRoster('wilcox')!.players).toEqual([]);
  });

  it('coverage after the overlay', () => {
    const all = getAllEnrichedRosters().flatMap((t) => t.players);
    expect(all.length).toBe(getRosters().counts.players);
    expect(all.filter((p) => p.grade !== null).length).toBe(getRosters().counts.withGrade + 133);
    expect(all.filter((p) => p.position !== null).length).toBe(getRosters().counts.withPosition + 9);
    expect(all.filter((p) => p.height !== null).length).toBe(getRosters().counts.withHeight + 23);
    expect(getRosterEnrichment().teams.length).toBe(16);
  });
});

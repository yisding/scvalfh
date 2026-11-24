/**
 * scripts/roster-drift.ts and the loaders' roster drift (lib/players/roster-drift.ts): a curated record the rosters no
 * longer support is left out and reported, and `--base` tells a refresh's drift (the record is as the base branch has
 * it: a warning) from a change's own (the record is new or edited: a failure).
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { RosterDrift } from '../lib/players/roster-drift';
import { countRosters, type RosterEnrichment, type Rosters } from '../lib/players/rosters-schema';
import { REPO, runScript } from './helpers';

const DIR = path.join(REPO, 'data', 'field-hockey');
const rosters = JSON.parse(readFileSync(path.join(DIR, 'rosters.json'), 'utf8')) as Rosters;
const enrichment = JSON.parse(readFileSync(path.join(DIR, 'rosters-enrichment.json'), 'utf8')) as RosterEnrichment;

/** A team whose overlay has a record, and that record's player. */
const team = enrichment.teams.find((t) => t.players.length > 0)!;
const player = team.players[0];

function drift(args: string[], files: { rosters?: Rosters; enrichment?: RosterEnrichment }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-drift-'));
  const env: NodeJS.ProcessEnv = { ...process.env, SCVAL_SPORT: 'field-hockey' };
  if (files.rosters) {
    env.SCVAL_ROSTERS = path.join(dir, 'rosters.json');
    writeFileSync(env.SCVAL_ROSTERS, JSON.stringify(files.rosters));
  }
  if (files.enrichment) {
    env.SCVAL_ROSTERS_ENRICHMENT = path.join(dir, 'enrichment.json');
    writeFileSync(env.SCVAL_ROSTERS_ENRICHMENT, JSON.stringify(files.enrichment));
  }
  return runScript('scripts/roster-drift.ts', args, { env });
}

/** The committed rosters with `player`'s row gone from `team`, as a coach dropping her would leave them. */
function withoutPlayer(): Rosters {
  const r = structuredClone(rosters);
  const t = r.teams.find((x) => x.slug === team.slug)!;
  t.players = t.players.filter((p) => p.athleteId !== player.athleteId);
  r.counts = countRosters(r.teams);
  return r;
}

describe('roster drift', () => {
  it('the committed files have none', () => {
    const run = drift(['--json'], {});
    expect(run.status, run.output).toBe(0);
    expect(JSON.parse(run.stdout.trim().split('\n').at(-1)!)).toEqual([]);
  });

  it('leaves a record out, and reports it, when its player leaves the roster: the load does not fail', () => {
    const run = drift(['--json'], { rosters: withoutPlayer() });
    expect(run.status, run.output).toBe(0);
    const found = (JSON.parse(run.stdout.trim().split('\n').at(-1)!) as RosterDrift[]).filter((d) => d.file === 'rosters-enrichment');
    expect(found).toContainEqual({
      file: 'rosters-enrichment',
      teamSlug: team.slug,
      who: player.fullName,
      key: player.athleteId,
      what: `athleteId ${player.athleteId} is not a MaxPreps row of this team`,
      leftOut: 'record',
    });
  });

  it('with --base, only warns about drift on a record the base branch has as it is (a refresh made it)', () => {
    const run = drift(['--github', '--base', 'HEAD'], { rosters: withoutPlayer() });
    expect(run.status, run.output).toBe(0);
    expect(run.stdout).toContain(`::warning title=Roster drift (field-hockey)::field-hockey rosters-enrichment: ${team.slug} / ${player.fullName}`);
    expect(run.stdout).not.toContain('::error');
  });

  it('with --base, fails on drift on a record the change added (a mistyped athleteId)', () => {
    const e = structuredClone(enrichment);
    e.teams.find((t) => t.slug === team.slug)!.players.push({
      athleteId: '00000000-0000-0000-0000-000000000000', fullName: player.fullName, sourceName: 'Typo', level: null, levelSource: null,
      grade: null, positions: null, jersey: null, height: null, conflicts: [], profiles: [], note: null,
    });
    const run = drift(['--github', '--base', 'HEAD'], { enrichment: e });
    expect(run.status, run.output).toBe(1);
    expect(run.stdout).toContain('::error title=Roster drift (field-hockey)::');
    expect(run.stdout).toContain('athleteId 00000000-0000-0000-0000-000000000000 is not a MaxPreps row of this team');
    expect(run.stdout).toContain('this change made it');
  });
});

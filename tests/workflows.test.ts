/**
 * update-data.yml and deploy-cloudflare.yml must agree on what a data commit is.
 *
 * deploy-cloudflare ships main's tip without a ci run of its own only when every commit above the
 * last ci-tested one is recognisably update-data's: by the bot, one parent, a message with one of
 * the gate's prefixes, and nothing but the gate's data files. Both halves live in YAML shell, so a
 * new data file or a reworded message on one side silently stops deploys (or, worse, widens what
 * ships untested). These read both files as text and hold them to each other.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { localDateKey } from '../lib/format';
import { withFixtureGames } from '../lib/results/fixture-games';

import { getClubSlugs } from '../lib/players/clubs';
import { getJvGameSlugs } from '../lib/jv/jv';
import { LEAGUE_IDS, TOURNAMENT_LEAGUE_IDS, seasonWindowBounds } from '../lib/leagues';
import { loadSnapshot } from '../lib/snapshot/snapshot-load';
import { REPO, runScript } from './helpers';

const read = (name: string) => readFileSync(path.join(REPO, '.github', 'workflows', name), 'utf8');
const update = read('update-data.yml');
/** The soccer site's refresh (SCVAL_SPORT=soccer): its commits pass the same gate. */
const updateSoccer = read('update-data-soccer.yml');
/** The basketball site's refresh (SCVAL_SPORT=basketball): the soccer workflow's job for data/basketball/. */
const updateBasketball = read('update-data-basketball.yml');
/** The volleyball site's refresh (SCVAL_SPORT=volleyball): the same job for data/volleyball/. */
const updateVolleyball = read('update-data-volleyball.yml');
/** The VAL middle school soccer site's refresh (SCVAL_SPORT=val-soccer): the league's own pages, no players. */
const updateValSoccer = read('update-data-val-soccer.yml');
const deploy = read('deploy-cloudflare.yml');
const updates = [update, updateSoccer, updateBasketball, updateVolleyball, updateValSoccer];

/** The player registry's files (scripts/refresh-player-registry.sh --files), which a refresh stages as `$registry`. */
const registryFiles = execFileSync('bash', ['scripts/refresh-player-registry.sh', '--files'], { encoding: 'utf8' }).trim().split(/\s+/);

/** Every path the refreshes stage: the arguments of their `git add` lines, `$registry` read as the registry's files. */
const committedFiles = new Set(
  updates.flatMap((u) =>
    [...u.matchAll(/^\s*git add ([^\n]+)$/gm)].flatMap((m) =>
      m[1].replace('$registry', registryFiles.join(' ')).trim().split(/\s+/).filter((a) => a !== '--'),
    ),
  ),
);

/** The literal start of every message the refreshes commit with, up to its first `$`. */
const messagePrefixes = updates.flatMap((u) => [...u.matchAll(/git commit -m "([^"$]+)/g)].map((m) => m[1]));

/** The prefixes the gate accepts, from its `startswith("…")` tests. */
const gatePrefixes = [...deploy.matchAll(/startswith\("([^"]+)"\)/g)].map((m) => m[1]);

/** The files the gate lets change above the ci-tested commit: the array its jq subtracts. */
const gateFiles = (() => {
  const m = /\[\.files\[\]\?\.filename\] - \[([^\]]+)\]/.exec(deploy);
  return new Set(m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : []);
})();

describe('the update-data commit and the deploy gate', () => {
  it('found what it reads in both files', () => {
    expect(committedFiles.size).toBeGreaterThan(0);
    expect(messagePrefixes.length).toBeGreaterThan(0);
    expect(gatePrefixes.length).toBeGreaterThan(0);
    expect(gateFiles.size).toBeGreaterThan(0);
  });

  it('commits only files the gate accepts, and the gate accepts nothing else', () => {
    expect([...committedFiles].sort()).toEqual([...gateFiles].sort());
    expect([...gateFiles].sort()).toEqual([
      'data/basketball/claims.json',
      'data/basketball/freshman.json',
      'data/basketball/jv-rosters.json',
      'data/basketball/jv.json',
      'data/basketball/player-index.json',
      'data/basketball/player-stats.json',
      'data/basketball/rosters.json',
      'data/basketball/snapshot.json',
      'data/basketball/snapshot.meta.json',
      'data/field-hockey/claims.json',
      'data/field-hockey/jv.json',
      'data/field-hockey/player-index.json',
      'data/field-hockey/player-stats.json',
      'data/field-hockey/snapshot.json',
      'data/field-hockey/snapshot.meta.json',
      'data/players.json',
      'data/soccer/claims.json',
      'data/soccer/freshman.json',
      'data/soccer/jv-rosters.json',
      'data/soccer/jv.json',
      'data/soccer/player-index.json',
      'data/soccer/player-stats.json',
      'data/soccer/rosters.json',
      'data/soccer/snapshot.json',
      'data/soccer/snapshot.meta.json',
      'data/val-soccer/claims.json',
      'data/val-soccer/jv.json',
      'data/val-soccer/player-index.json',
      'data/val-soccer/snapshot.json',
      'data/val-soccer/snapshot.meta.json',
      'data/volleyball/claims.json',
      'data/volleyball/jv-rosters.json',
      'data/volleyball/jv.json',
      'data/volleyball/player-index.json',
      'data/volleyball/player-stats.json',
      'data/volleyball/rosters.json',
      'data/volleyball/snapshot.json',
      'data/volleyball/snapshot.meta.json',
    ]);
  });

  it('every commit message is one the gate recognises, and every prefix is used', () => {
    for (const msg of messagePrefixes) {
      expect(
        gatePrefixes.some((p) => msg.startsWith(p)),
        `"${msg}" matches none of ${JSON.stringify(gatePrefixes)}`,
      ).toBe(true);
    }
    for (const p of gatePrefixes) {
      expect(messagePrefixes.some((msg) => msg.startsWith(p)), `gate prefix "${p}" is never committed`).toBe(true);
    }
  });

  /**
   * A refresh pushes with GITHUB_TOKEN, which starts no `push` workflow, so the deploy only ever hears of
   * a refresh through workflow_run: a refresh missing from that list never ships its data.
   */
  it('deploys after every refresh workflow, by its name', () => {
    const listed = /workflow_run:\s*\n\s*workflows: \[([^\]]+)\]/.exec(deploy)?.[1].split(',').map((w) => w.trim());
    expect(listed).toBeDefined();
    for (const u of updates) {
      const name = /^name: (\S+)$/m.exec(u)?.[1];
      expect(name).toBeDefined();
      expect(listed, `deploy-cloudflare.yml never runs after ${name}`).toContain(name);
    }
    expect(listed).toContain('ci');
  });

  it('commits as the bot the gate looks for', () => {
    for (const u of updates) expect(u).toMatch(/git config user\.name {2}"github-actions\[bot\]"/);
    expect(deploy).toContain('(.author.login // "") == "github-actions[bot]"');
  });
});

describe('the player stats step', () => {
  const step = stepBody(update, 'Fetch player stats');

  it('runs the stats script, after the snapshot and before the tests', () => {
    expect(step).toContain('pnpm fetch-player-stats "${args[@]}"');
    const at = (s: string) => update.indexOf(s);
    expect(at('- name: Fetch data')).toBeLessThan(at('- name: Fetch player stats'));
    expect(at('- name: Fetch player stats')).toBeLessThan(at('- name: Test'));
  });

  it('can never fail the run: a stats outage must not cost the day’s scores', () => {
    expect(step).toMatch(/continue-on-error: true/);
  });

  it('passes the manual force and leagues inputs through env, as fetch-data does, validated', () => {
    expect(step).toContain("FORCE: ${{ github.event_name == 'workflow_dispatch' && inputs.force && '1' || '' }}");
    expect(step).toContain("LEAGUES: ${{ github.event_name == 'workflow_dispatch' && inputs.leagues || '' }}");
    expect(step).toContain('[ -n "$FORCE" ] && args+=(--force)');
    expect(step).toContain('[[ "$LEAGUES" =~ ^[a-z0-9,-]+$ ]]');
    expect(step).toContain('args+=(--leagues "$LEAGUES")');
    // Never interpolated into the script itself.
    expect(step.slice(step.indexOf('run: |'))).not.toContain('inputs.');
  });

  it('is not described as SCVAL-only: it covers every league', () => {
    expect(update).not.toMatch(/SCVAL[- ]only/i);
    expect(update).not.toMatch(/15 SCVAL teams/);
  });
});

describe('the JV games step', () => {
  const step = stepBody(update, 'Fetch JV games');

  it('runs the JV script, after the stats and before the tests', () => {
    expect(step).toContain('pnpm fetch-jv "${args[@]}"');
    const at = (s: string) => update.indexOf(s);
    expect(at('- name: Fetch player stats')).toBeLessThan(at('- name: Fetch JV games'));
    expect(at('- name: Fetch JV games')).toBeLessThan(at('- name: Test'));
  });

  it('can never fail the run: a JV outage must not cost the day’s scores', () => {
    expect(step).toMatch(/continue-on-error: true/);
    expect(step).toMatch(/timeout-minutes: \d+/);
  });

  it('passes the manual force and leagues inputs through env, validated, never interpolated', () => {
    expect(step).toContain("FORCE: ${{ github.event_name == 'workflow_dispatch' && inputs.force && '1' || '' }}");
    expect(step).toContain("LEAGUES: ${{ github.event_name == 'workflow_dispatch' && inputs.leagues || '' }}");
    expect(step).toContain('[[ "$LEAGUES" =~ ^[a-z0-9,-]+$ ]]');
    expect(step.slice(step.indexOf('run: |'))).not.toContain('inputs.');
  });

  it('is committed when it changed, alone or riding along with the snapshot or the stats', () => {
    const commit = stepBody(update, 'Commit the data that changed');
    expect(commit).toContain('if git diff --quiet -- data/field-hockey/jv.json; then JV=false; else JV=true; fi');
    expect(commit).toContain('git commit -m "data: refresh JV games ${DAY} (${JV_SUMMARY})"');
    expect(commit).toContain('${JV_TAIL}"');
  });
});

/**
 * The Test step runs after the stats step, which is allowed to fail; a stats file the suite refuses
 * must not cost the snapshot commit either. The step's own shell runs here, in a scratch git repo
 * whose `pnpm test` fails whenever a data file says "bad".
 */
describe('the Test step never lets a stats file block the snapshot', () => {
  const step = stepBody(update, 'Test');
  const script = runBlock(step);
  const committed = '{"stats":"good"}\n';
  const committedJv = '{"jv":"good"}\n';

  function repo(files: { stats?: string; snapshot?: string; jv?: string }) {
    const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-test-step-'));
    const git = (...args: string[]) => {
      const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: dir, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    };
    mkdirSync(path.join(dir, 'data', 'field-hockey'), { recursive: true });
    writeFileSync(path.join(dir, 'data', 'field-hockey', 'player-stats.json'), committed);
    writeFileSync(path.join(dir, 'data', 'field-hockey', 'snapshot.json'), '{"snapshot":"good"}\n');
    writeFileSync(path.join(dir, 'data', 'field-hockey', 'jv.json'), committedJv);
    git('init', '-q');
    git('add', '.');
    git('commit', '-q', '-m', 'init');
    // What this run's fetch steps wrote.
    if (files.stats) writeFileSync(path.join(dir, 'data', 'field-hockey', 'player-stats.json'), files.stats);
    if (files.snapshot) writeFileSync(path.join(dir, 'data', 'field-hockey', 'snapshot.json'), files.snapshot);
    if (files.jv) writeFileSync(path.join(dir, 'data', 'field-hockey', 'jv.json'), files.jv);
    const bin = path.join(dir, '.bin');
    mkdirSync(bin);
    // `pnpm test` passes unless a data file says "bad"; every call is logged.
    writeFileSync(
      path.join(bin, 'pnpm'),
      '#!/usr/bin/env bash\necho "pnpm $*" >> "$CALLS"\n! grep -q bad data/field-hockey/player-stats.json data/field-hockey/snapshot.json data/field-hockey/jv.json\n',
      { mode: 0o755 },
    );
    return { dir, bin };
  }

  function runStep(files: { stats?: string; snapshot?: string; jv?: string }) {
    const { dir, bin } = repo(files);
    const output = path.join(dir, '.github-output');
    const calls = path.join(dir, '.calls');
    writeFileSync(output, '');
    writeFileSync(calls, '');
    // GitHub's default shell for `run:` on ubuntu is `bash -e -o pipefail`.
    const res = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_OUTPUT: output, CALLS: calls, RUNNER_TEMP: dir },
    });
    return {
      code: res.status,
      stats: readFileSync(path.join(dir, 'data', 'field-hockey', 'player-stats.json'), 'utf8'),
      jv: readFileSync(path.join(dir, 'data', 'field-hockey', 'jv.json'), 'utf8'),
      output: readFileSync(output, 'utf8'),
      calls: readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean),
    };
  }

  it('found the step and its script', () => {
    expect(step).toContain('id: test');
    expect(step).not.toMatch(/continue-on-error/);
    expect(script).toContain('git checkout -- data/field-hockey/player-stats.json');
  });

  it('passes as it is when the suite passes, keeping the new stats', () => {
    const r = runStep({ stats: '{"stats":"new"}\n' });
    expect(r.code).toBe(0);
    expect(r.stats).toBe('{"stats":"new"}\n');
    expect(r.calls).toEqual(['pnpm test']);
    expect(r.output).toBe('');
  });

  it('restores the committed stats file and passes when only the new one failed the suite', () => {
    const r = runStep({ stats: '{"stats":"bad"}\n' });
    expect(r.code).toBe(0);
    expect(r.stats).toBe(committed);
    expect(r.calls).toEqual(['pnpm test', 'pnpm test']);
    expect(r.output).toContain('stats_restored=true');
  });

  it('still fails when the suite fails with the committed stats file restored', () => {
    const r = runStep({ stats: '{"stats":"bad"}\n', snapshot: '{"snapshot":"bad"}\n' });
    expect(r.code).toBe(1);
    expect(r.stats).toBe(committed);
    expect(r.calls).toEqual(['pnpm test', 'pnpm test']);
  });

  it('fails at once, restoring nothing, when the stats file did not change', () => {
    const r = runStep({ snapshot: '{"snapshot":"bad"}\n' });
    expect(r.code).toBe(1);
    expect(r.calls).toEqual(['pnpm test']);
    expect(r.output).toBe('');
  });

  it('restores the committed JV file first and passes when only the new one failed the suite', () => {
    const r = runStep({ stats: '{"stats":"new"}\n', jv: '{"jv":"bad"}\n' });
    expect(r.code).toBe(0);
    expect(r.jv).toBe(committedJv);
    expect(r.stats).toBe('{"stats":"new"}\n');
    expect(r.calls).toEqual(['pnpm test', 'pnpm test']);
    expect(r.output).toContain('jv_restored=true');
    expect(r.output).not.toContain('stats_restored');
  });

  it('keeps a good new JV file when only the new stats file failed the suite', () => {
    const r = runStep({ stats: '{"stats":"bad"}\n', jv: '{"jv":"new"}\n' });
    expect(r.code).toBe(0);
    expect(r.jv).toBe('{"jv":"new"}\n');
    expect(r.stats).toBe(committed);
    expect(r.calls).toEqual(['pnpm test', 'pnpm test', 'pnpm test']);
    expect(r.output).toContain('stats_restored=true');
    expect(r.output).not.toContain('jv_restored');
  });

  it('restores both files when neither alone is enough', () => {
    const r = runStep({ stats: '{"stats":"bad"}\n', jv: '{"jv":"bad"}\n' });
    expect(r.code).toBe(0);
    expect(r.jv).toBe(committedJv);
    expect(r.stats).toBe(committed);
    expect(r.calls).toEqual(['pnpm test', 'pnpm test', 'pnpm test', 'pnpm test']);
    expect(r.output).toContain('jv_restored=true');
    expect(r.output).toContain('stats_restored=true');
  });

  it('fails when restoring the JV file was not enough and the stats file did not change', () => {
    const r = runStep({ jv: '{"jv":"new"}\n', snapshot: '{"snapshot":"bad"}\n' });
    expect(r.code).toBe(1);
    expect(r.jv).toBe(committedJv);
    expect(r.calls).toEqual(['pnpm test', 'pnpm test']);
  });

  it('runs before the commit step, which reads the restored file as no stats change', () => {
    expect(update.indexOf('- name: Test')).toBeLessThan(update.indexOf('- name: Commit the data that changed'));
    expect(stepBody(update, 'Commit the data that changed')).toContain(
      'if git diff --quiet -- data/field-hockey/player-stats.json; then STATS=false; else STATS=true; fi',
    );
  });
});

/** The `run: |` block of a step, dedented: the shell GitHub runs. */
function runBlock(step: string): string {
  const lines = step.split('\n');
  const at = lines.findIndex((l) => /^\s*run: \|\s*$/.test(l));
  if (at < 0) return '';
  const body: string[] = [];
  let indent = -1;
  for (const line of lines.slice(at + 1)) {
    if (line.trim() === '') {
      body.push('');
      continue;
    }
    const n = line.length - line.trimStart().length;
    if (indent < 0) indent = n;
    if (n < indent) break;
    body.push(line.slice(indent));
  }
  return `${body.join('\n').trimEnd()}\n`;
}

/** The body of one named step: from its `- name:` line to the next step (or the file's end). */
function stepBody(text: string, name: string): string {
  const start = text.indexOf(`- name: ${name}\n`);
  if (start < 0) return '';
  const rest = text.slice(start + 1);
  const next = rest.search(/\n\s*- (name|uses): /);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('the teamViews budget gates ci, never the data cron', () => {
  it('ci.yml sets CI_GATE on its Test step', () => {
    const test = stepBody(read('ci.yml'), 'Test');
    expect(test).toContain('run: pnpm test');
    expect(test).toMatch(/env:\s*\n\s*CI_GATE: '1'/);
  });

  it('update-data.yml and deploy-cloudflare.yml never set CI_GATE', () => {
    expect(stepBody(update, 'Test')).toMatch(/^\s*pnpm test$/m);
    for (const text of [update, updateSoccer, updateBasketball, deploy]) expect(text).not.toMatch(/^\s*CI_GATE:/m);
  });
});

describe('the claims file travels with the snapshot', () => {
  const sports: [string, string, string][] = [
    ['field hockey', 'data/field-hockey', update],
    ['soccer', 'data/soccer', updateSoccer],
    ['basketball', 'data/basketball', updateBasketball],
    ['volleyball', 'data/volleyball', updateVolleyball],
    ['val-soccer', 'data/val-soccer', updateValSoccer],
  ];
  const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  for (const [name, dir, text] of sports) {
    it(`${name}: staged behind a guard wherever the snapshot is, and reverted with it`, () => {
      const claims = `${dir}/claims.json`;
      // Every snapshot staging line is followed by a guarded add of the claims file (it may not exist yet).
      const snapAdds = [...text.matchAll(new RegExp(`^\\s*git add ${esc(dir)}/snapshot\\.json ${esc(dir)}/snapshot\\.meta\\.json\\b[^\n]*$`, 'gm'))];
      const guarded = [...text.matchAll(new RegExp(`^\\s*git add [^\n]*\n\\s*if \\[ -e ${esc(claims)} \\]; then\n\\s*git add ${esc(claims)}\n\\s*fi$`, 'gm'))];
      expect(snapAdds.length).toBeGreaterThan(0);
      expect(guarded.length).toBe(snapAdds.length);
      // No other `git add` names it.
      expect([...text.matchAll(new RegExp(`git add [^\n]*${esc(claims)}`, 'g'))].length).toBe(snapAdds.length);
      // The no-snapshot-change branch reverts it with the snapshot, removing a new untracked one.
      expect(text).toContain(`git checkout -- ${dir}/snapshot.json ${dir}/snapshot.meta.json\n`);
      expect(text).toContain(`git checkout -- ${claims} 2>/dev/null || rm -f ${claims}`);
    });
  }
});

describe('the VAL middle school soccer refresh', () => {
  it('builds the VAL data: SCVAL_SPORT=val-soccer for the whole job', () => {
    expect(updateValSoccer).toMatch(/^ {4}env:\n {6}SCVAL_SPORT: val-soccer$/m);
  });

  it('commits and restores only data/val-soccer/ files, and reads no player', () => {
    const paths = [...updateValSoccer.matchAll(/git (?:add|checkout --) ([^\n|]+)/g)].flatMap((m) => m[1].replace(/ 2>.*$/, '').trim().split(/\s+/));
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(p.startsWith('data/val-soccer/'), p).toBe(true);
    expect(updateValSoccer).not.toMatch(/fetch-rosters|fetch-player-stats|refresh-player-registry/);
  });

  it('tests the VAL data files it just wrote', () => {
    expect(stepBody(updateValSoccer, 'Test')).toContain('vitest run tests/val-soccer.test.ts');
  });
});

describe('the soccer refresh', () => {
  it('builds the soccer data: SCVAL_SPORT=soccer for the whole job', () => {
    expect(updateSoccer).toMatch(/^ {4}env:\n {6}SCVAL_SPORT: soccer$/m);
  });

  it('never runs beside the field hockey refresh: one concurrency group, never cancelled', () => {
    for (const u of updates) {
      expect(u).toMatch(/^concurrency:\n {2}group: update-data\n {2}cancel-in-progress: false$/m);
    }
  });

  it('commits and restores only data/soccer/ files, and the player registry its rosters rebuild', () => {
    const paths = [...updateSoccer.matchAll(/\bdata\/[\w./-]+\.json/g)].map((m) => m[0]);
    expect(paths.length).toBeGreaterThan(0);
    // The files filed by person appear only to be restored, or watched, never staged (\`git add\` reads \`$registry\`).
    const curated = ['data/player-accounts.json', 'data/commitments.json', 'data/*/clubs.json'];
    for (const p of paths) expect(p.startsWith('data/soccer/') || p === 'data/players.json' || p === 'data/player-identity.json' || curated.includes(p), p).toBe(true);
  });

  it('rebuilds and tests the player registry after the roster fetch, and never fails the refresh over it', () => {
    const body = stepBody(updateSoccer, 'Rebuild the player registry');
    expect(body).toContain('run: scripts/refresh-player-registry.sh soccer');
    expect(body).toContain('continue-on-error: true');
    const order = ['Fetch rosters', 'Rebuild the player registry', 'Test'].map((n) => updateSoccer.indexOf(`- name: ${n}\n`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The Test step puts back only the file group the tests refuse; its rosters group carries the registry rebuilt
    // from them (scripts/refresh-test.sh, tests/refresh-test.test.ts).
    expect(stepBody(updateSoccer, 'Test')).toContain('run: scripts/refresh-test.sh soccer tests/');
    // Roster drift is reported after the tests, never fatal, and before the commit.
    const drift = stepBody(updateSoccer, 'Report roster drift');
    expect(drift).toContain('run: pnpm -s roster-drift --github');
    expect(drift).toContain('continue-on-error: true');
    expect(updateSoccer.indexOf('- name: Test\n')).toBeLessThan(updateSoccer.indexOf('- name: Report roster drift\n'));
    expect(updateSoccer.indexOf('- name: Report roster drift\n')).toBeLessThan(updateSoccer.indexOf('- name: Commit the data that changed\n'));
    // A registry step that did not succeed, its timeout included (which kills the script before it restores),
    // commits neither rosters nor registry.
    const commit = stepBody(updateSoccer, 'Commit the data that changed');
    expect(commit).toContain('REGISTRY: ${{ steps.registry.outcome }}');
    expect(commit).toContain('registry="$(scripts/refresh-player-registry.sh --files)"\n          if [ "$REGISTRY" != "success" ]; then\n            git checkout -- data/soccer/rosters.json data/soccer/jv-rosters.json $registry data/player-accounts.json data/commitments.json \'data/*/clubs.json\'');
    expect(commit.indexOf('"$REGISTRY" != "success"')).toBeLessThan(commit.indexOf('git add'));
    // A rebase onto a commit that changed the registry's curation rebuilds and retests it before pushing, or pushes nothing.
    const push = stepBody(updateSoccer, 'Push');
    expect(push).toContain('git diff --quiet "$before" HEAD~1 -- data/player-identity.json data/player-accounts.json data/commitments.json \'data/*/clubs.json\' $registry');
    // …and never with a file filed by person rewritten: that is a person's to check and commit.
    expect(push).toContain("pnpm -s build-players --no-stamp && git diff --quiet -- data/player-accounts.json data/commitments.json 'data/*/clubs.json'");
    expect(push).toContain('&& pnpm exec vitest run tests/players-registry.test.ts');
    expect(push.indexOf('git pull --rebase')).toBeLessThan(push.indexOf('build-players'));
    expect(push.indexOf('build-players')).toBeLessThan(push.indexOf('git push'));
  });

  it('tests the soccer data files it just wrote', () => {
    expect(stepBody(updateSoccer, 'Test')).toContain('scripts/refresh-test.sh soccer tests/soccer.test.ts');
  });

  it('reads si.com (scores and JV team pages) but no school calendar, which is field hockey’s', () => {
    expect(stepBody(updateSoccer, 'Fetch data')).toContain('args=(--no-vnn)');
    expect(stepBody(updateSoccer, 'Fetch data')).not.toContain('--no-sblive');
    expect(stepBody(updateSoccer, 'Fetch JV games')).not.toContain('--no-sblive');
  });
});

describe('the basketball refresh', () => {
  it('builds the basketball data: SCVAL_SPORT=basketball for the whole job', () => {
    expect(updateBasketball).toMatch(/^ {4}env:\n {6}SCVAL_SPORT: basketball$/m);
  });

  it('commits and restores only data/basketball/ files, and the player registry its rosters rebuild', () => {
    const paths = [...updateBasketball.matchAll(/\bdata\/[\w./-]+\.json/g)].map((m) => m[0]);
    expect(paths.length).toBeGreaterThan(0);
    // The files filed by person appear only to be restored, or watched, never staged (\`git add\` reads \`$registry\`).
    const curated = ['data/player-accounts.json', 'data/commitments.json', 'data/*/clubs.json'];
    for (const p of paths) expect(p.startsWith('data/basketball/') || p === 'data/players.json' || p === 'data/player-identity.json' || curated.includes(p), p).toBe(true);
  });

  it('rebuilds and tests the player registry after the roster fetch, and never fails the refresh over it', () => {
    const body = stepBody(updateBasketball, 'Rebuild the player registry');
    expect(body).toContain('run: scripts/refresh-player-registry.sh basketball');
    expect(body).toContain('continue-on-error: true');
    const order = ['Fetch rosters', 'Rebuild the player registry', 'Test'].map((n) => updateBasketball.indexOf(`- name: ${n}\n`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The Test step puts back only the file group the tests refuse; its rosters group carries the registry rebuilt
    // from them (scripts/refresh-test.sh, tests/refresh-test.test.ts).
    expect(stepBody(updateBasketball, 'Test')).toContain('run: scripts/refresh-test.sh basketball tests/');
    // Roster drift is reported after the tests, never fatal, and before the commit.
    const drift = stepBody(updateBasketball, 'Report roster drift');
    expect(drift).toContain('run: pnpm -s roster-drift --github');
    expect(drift).toContain('continue-on-error: true');
    expect(updateBasketball.indexOf('- name: Test\n')).toBeLessThan(updateBasketball.indexOf('- name: Report roster drift\n'));
    expect(updateBasketball.indexOf('- name: Report roster drift\n')).toBeLessThan(updateBasketball.indexOf('- name: Commit the data that changed\n'));
    // A registry step that did not succeed, its timeout included (which kills the script before it restores),
    // commits neither rosters nor registry.
    const commit = stepBody(updateBasketball, 'Commit the data that changed');
    expect(commit).toContain('REGISTRY: ${{ steps.registry.outcome }}');
    expect(commit).toContain('registry="$(scripts/refresh-player-registry.sh --files)"\n          if [ "$REGISTRY" != "success" ]; then\n            git checkout -- data/basketball/rosters.json data/basketball/jv-rosters.json $registry data/player-accounts.json data/commitments.json \'data/*/clubs.json\'');
    expect(commit.indexOf('"$REGISTRY" != "success"')).toBeLessThan(commit.indexOf('git add'));
    // A rebase onto a commit that changed the registry's curation rebuilds and retests it before pushing, or pushes nothing.
    const push = stepBody(updateBasketball, 'Push');
    expect(push).toContain('git diff --quiet "$before" HEAD~1 -- data/player-identity.json data/player-accounts.json data/commitments.json \'data/*/clubs.json\' $registry');
    // …and never with a file filed by person rewritten: that is a person's to check and commit.
    expect(push).toContain("pnpm -s build-players --no-stamp && git diff --quiet -- data/player-accounts.json data/commitments.json 'data/*/clubs.json'");
    expect(push).toContain('&& pnpm exec vitest run tests/players-registry.test.ts');
    expect(push.indexOf('git pull --rebase')).toBeLessThan(push.indexOf('build-players'));
    expect(push.indexOf('build-players')).toBeLessThan(push.indexOf('git push'));
  });

  it('tests the basketball data files it just wrote, with test files that exist', () => {
    const body = stepBody(updateBasketball, 'Test');
    const files = [...body.matchAll(/tests\/[\w.-]+\.test\.ts/g)].map((m) => m[0]);
    expect(files).toContain('tests/basketball.test.ts');
    for (const f of new Set(files)) expect(existsSync(path.join(REPO, f)), f).toBe(true);
  });

  it('reads si.com (scores and JV team pages) but no school calendar, which is field hockey’s', () => {
    expect(stepBody(updateBasketball, 'Fetch data')).toContain('args=(--no-vnn)');
    expect(stepBody(updateBasketball, 'Fetch data')).not.toContain('--no-sblive');
    expect(stepBody(updateBasketball, 'Fetch JV games')).not.toContain('--no-sblive');
  });

  it('runs in the basketball season’s months, after the other two refreshes', () => {
    const crons = [...updateBasketball.matchAll(/cron: '([^']+)'/g)].map((m) => m[1]);
    expect(crons).toEqual(['7 15 * 1-3,11-12 *', '7 6 * 1-3,11-12 *']);
  });
});

describe('the volleyball refresh', () => {
  it('builds the volleyball data: SCVAL_SPORT=volleyball for the whole job', () => {
    expect(updateVolleyball).toMatch(/^ {4}env:\n {6}SCVAL_SPORT: volleyball$/m);
  });

  it('commits and restores only data/volleyball/ files, and the player registry its rosters rebuild', () => {
    const paths = [...updateVolleyball.matchAll(/\bdata\/[\w./-]+\.json/g)].map((m) => m[0]);
    expect(paths.length).toBeGreaterThan(0);
    // The files filed by person appear only to be restored, or watched, never staged (\`git add\` reads \`$registry\`).
    const curated = ['data/player-accounts.json', 'data/commitments.json', 'data/*/clubs.json'];
    for (const p of paths) expect(p.startsWith('data/volleyball/') || p === 'data/players.json' || p === 'data/player-identity.json' || curated.includes(p), p).toBe(true);
  });

  it('rebuilds and tests the player registry after the roster fetch, and never fails the refresh over it', () => {
    const body = stepBody(updateVolleyball, 'Rebuild the player registry');
    expect(body).toContain('run: scripts/refresh-player-registry.sh volleyball');
    expect(body).toContain('continue-on-error: true');
    const order = ['Fetch rosters', 'Rebuild the player registry', 'Test'].map((n) => updateVolleyball.indexOf(`- name: ${n}\n`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The Test step puts back only the file group the tests refuse; its rosters group carries the registry rebuilt
    // from them (scripts/refresh-test.sh, tests/refresh-test.test.ts).
    expect(stepBody(updateVolleyball, 'Test')).toContain('run: scripts/refresh-test.sh volleyball tests/');
    // Roster drift is reported after the tests, never fatal, and before the commit.
    const drift = stepBody(updateVolleyball, 'Report roster drift');
    expect(drift).toContain('run: pnpm -s roster-drift --github');
    expect(drift).toContain('continue-on-error: true');
    expect(updateVolleyball.indexOf('- name: Test\n')).toBeLessThan(updateVolleyball.indexOf('- name: Report roster drift\n'));
    expect(updateVolleyball.indexOf('- name: Report roster drift\n')).toBeLessThan(updateVolleyball.indexOf('- name: Commit the data that changed\n'));
    // A registry step that did not succeed, its timeout included (which kills the script before it restores),
    // commits neither rosters nor registry.
    const commit = stepBody(updateVolleyball, 'Commit the data that changed');
    expect(commit).toContain('REGISTRY: ${{ steps.registry.outcome }}');
    expect(commit).toContain('registry="$(scripts/refresh-player-registry.sh --files)"\n          if [ "$REGISTRY" != "success" ]; then\n            git checkout -- data/volleyball/rosters.json data/volleyball/jv-rosters.json $registry data/player-accounts.json data/commitments.json \'data/*/clubs.json\'');
    expect(commit.indexOf('"$REGISTRY" != "success"')).toBeLessThan(commit.indexOf('git add'));
    // A rebase onto a commit that changed the registry's curation rebuilds and retests it before pushing, or pushes nothing.
    const push = stepBody(updateVolleyball, 'Push');
    expect(push).toContain('git diff --quiet "$before" HEAD~1 -- data/player-identity.json data/player-accounts.json data/commitments.json \'data/*/clubs.json\' $registry');
    // …and never with a file filed by person rewritten: that is a person's to check and commit.
    expect(push).toContain("pnpm -s build-players --no-stamp && git diff --quiet -- data/player-accounts.json data/commitments.json 'data/*/clubs.json'");
    expect(push).toContain('&& pnpm exec vitest run tests/players-registry.test.ts');
    expect(push.indexOf('git pull --rebase')).toBeLessThan(push.indexOf('build-players'));
    expect(push.indexOf('build-players')).toBeLessThan(push.indexOf('git push'));
  });

  it('tests the volleyball data files it just wrote, with test files that exist', () => {
    const body = stepBody(updateVolleyball, 'Test');
    const files = [...body.matchAll(/tests\/[\w.-]+\.test\.ts/g)].map((m) => m[0]);
    // …and the file that follows every old game URL of the snapshot to its page (lib/game-urls.ts aliases).
    expect(files).toEqual(['tests/volleyball.test.ts', 'tests/game-aliases.test.ts']);
    for (const f of files) expect(existsSync(path.join(REPO, f)), f).toBe(true);
  });

  it('reads no si.com page, no school calendar and no cifsshome.org listing', () => {
    // A girls volleyball season is past the listing's 60-page cap in every Section, so its report is never whole.
    expect(stepBody(updateVolleyball, 'Fetch data')).toContain('--no-sblive --no-vnn --no-cifss');
    expect(stepBody(updateVolleyball, 'Fetch JV games')).toContain('--no-sblive');
  });

  it('runs once a week in the fall season’s months, after field hockey’s refresh', () => {
    // Owner decision, 2026-11-21: weekly, Saturday mornings, with the season over.
    const crons = [...updateVolleyball.matchAll(/cron: '([^']+)'/g)].map((m) => m[1]);
    expect(crons).toEqual(['20 14 * 8-11 6']);
  });

  it('reads the roster pages on every run, the refresh being weekly itself', () => {
    const body = stepBody(updateVolleyball, 'Fetch rosters');
    expect(body).not.toContain('$SCHEDULE');
    expect(body).toContain('pnpm fetch-rosters || rc=1');
    expect(body).toContain('pnpm fetch-rosters --level jv || rc=1');
  });
});

describe('the roster pages are read weekly', () => {
  // Owner decision, 2026-11-13: one scheduled run a week reads the roster pages (the Monday morning run,
  // Pacific); a manual run always does. The gate names a cron, so it must name one the workflow has.
  // (Volleyball's refresh is itself weekly since 2026-11-21, so it reads them on every run; see above.)
  for (const [name, text] of [['soccer', updateSoccer], ['basketball', updateBasketball]] as const) {
    it(`${name}: only the Monday morning cron reads them, and that cron exists`, () => {
      const body = stepBody(text, 'Fetch rosters');
      const gate = body.match(/"\$SCHEDULE" != '([^']+)'/);
      expect(gate, 'the Fetch rosters step names the cron that reads rosters').not.toBeNull();
      const crons = [...text.matchAll(/cron: '([^']+)'/g)].map((m) => m[1]);
      expect(crons).toContain(gate![1]);
      // The morning run: its hour (UTC) is 14 or 15, never an evening run's.
      expect(Number(gate![1].split(' ')[1])).toBeGreaterThanOrEqual(13);
      expect(body).toContain('TZ=America/Los_Angeles date +%u)" != 1');
      expect(body).toMatch(/if \[ "\$EVENT" = schedule \]/);
      expect(body).toContain('pnpm fetch-rosters || rc=1');
    });
  }
});

describe('the manual fetch inputs', () => {
  const fetch = stepBody(update, 'Fetch data');

  it('passes accept_regression as --accept-regression, through env and validated', () => {
    expect(update).toMatch(/^ {6}accept_regression:\n {8}description: /m);
    expect(fetch).toContain("ACCEPT_REGRESSION: ${{ github.event_name == 'workflow_dispatch' && inputs.accept_regression || '' }}");
    expect(fetch).toContain('[[ "$ACCEPT_REGRESSION" =~ ^[a-z0-9,-]+$ ]]');
    expect(fetch).toContain('args+=(--accept-regression "$ACCEPT_REGRESSION")');
    // Never interpolated into the script itself.
    expect(fetch.slice(fetch.indexOf('run: |'))).not.toContain('inputs.');
  });
});

describe('the field hockey refresh stops at the season window, before it installs anything', () => {
  // Owner decision, 2026-11-14: the window ends after the last final (Nov 14; extended on 2026-11-21 to Nov 28,
  // for one weekly run), and a fire outside it costs no checkout, install or test run. The `window` job has none of the repo's code, so it carries the
  // two dates itself; this holds them to the sections' windows the scripts' own guard reads.
  // The job's only step, so its body ends where the next job starts.
  const gate = stepBody(update, 'Season window').split('\n  refresh:\n')[0];
  const script = gate
    .slice(gate.indexOf('run: |') + 'run: |'.length)
    .split('\n')
    .map((l) => l.replace(/^ {10}/, ''))
    .join('\n');

  /** The gate's script on a given Pacific day (a `date` that prints it), and what it wrote to GITHUB_OUTPUT. */
  function runGate(today: string, force = ''): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'window-gate-'));
    try {
      writeFileSync(path.join(dir, 'date'), `#!/bin/sh\necho ${today}\n`, { mode: 0o755 });
      const out = path.join(dir, 'output');
      const r = spawnSync('bash', ['-c', script], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          SEASON_START: /SEASON_START: '([^']+)'/.exec(gate)![1],
          SEASON_END: /SEASON_END: '([^']+)'/.exec(gate)![1],
          FORCE: force,
          GITHUB_OUTPUT: out,
          GITHUB_STEP_SUMMARY: path.join(dir, 'summary'),
        },
      });
      expect(r.status, r.stderr).toBe(0);
      return readFileSync(out, 'utf8').trim();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('carries the sections’ own window, start and end', () => {
    const { start, end } = seasonWindowBounds();
    expect(gate).toContain(`SEASON_START: '${start}'`);
    expect(gate).toContain(`SEASON_END: '${end}'`);
    expect(gate).toContain('TZ=America/Los_Angeles date +%F');
  });

  it('is in season on the window’s two ends and out of season the day before and the day after', () => {
    expect(runGate('2026-08-01')).toBe('in_season=true');
    expect(runGate('2026-11-28')).toBe('in_season=true');
    expect(runGate('2026-07-31')).toBe('in_season=false');
    expect(runGate('2026-11-29')).toBe('in_season=false');
  });

  it('runs out of season only when a manual run forces it, the input passed through env', () => {
    expect(runGate('2026-12-05', '1')).toBe('in_season=true');
    expect(gate).toContain("FORCE: ${{ github.event_name == 'workflow_dispatch' && inputs.force && '1' || '' }}");
    expect(gate.slice(gate.indexOf('run: |'))).not.toContain('inputs.');
  });

  it('the refresh job, checkout included, runs only when the window job says so', () => {
    expect(update).toMatch(/\n {2}refresh:\n {4}needs: window\n {4}if: needs\.window\.outputs\.in_season == 'true'\n/);
    expect(update).toMatch(/\n {2}window:\n[\s\S]*?\n {6}in_season: \$\{\{ steps\.check\.outputs\.in_season \}\}\n/);
    const windowJob = update.slice(update.indexOf('\n  window:\n'), update.indexOf('\n  refresh:\n'));
    expect(windowJob).not.toMatch(/uses: |pnpm/);
  });

  it('fires once a week, in no month the window never reaches: every in-window run is August to November in UTC', () => {
    // Owner decision, 2026-11-21: weekly (Saturday mornings) with the season over.
    const crons = [...update.matchAll(/cron: '([^']+)'/g)].map((m) => m[1]);
    expect(crons).toEqual(['0 14 * 8-11 6']);
    // The window's last Pacific day is a Saturday, and its 14:00 UTC fire is the same UTC day.
    const { end } = seasonWindowBounds();
    const lastFire = new Date(`${end}T14:00:00Z`);
    expect(lastFire.getUTCDay()).toBe(6);
    expect(lastFire.getUTCMonth() + 1).toBeLessThanOrEqual(11);
  });
});

describe('the Stage D gate runs the cloudflare job’s checks', () => {
  const ci = read('ci.yml');
  const gate = readFileSync(path.join(REPO, 'scripts', 'stage-gate-d.sh'), 'utf8');

  it('requires the Build Output config and fails on an env file in the Worker output', () => {
    for (const text of [ci, gate]) {
      expect(text).toContain('pnpm exec tsx scripts/assert-vinext-prerender.ts --cloudflare');
      expect(text).toContain('pnpm exec tsx scripts/assert-budgets.ts --worker-only');
      expect(text).toContain('test -f .cloudflare/output/v0/config.json');
      expect(text).toContain(`find .cloudflare/output \\( -name '.dev.vars*' -o -name '.env*' \\) -print`);
    }
  });
});

/**
 * scripts/assert-prerender.ts over a synthetic `.next/server/app` that holds exactly what the
 * build prerenders for data/field-hockey/snapshot.json and data/field-hockey/clubs.json, plus whatever a case adds. `next
 * start` caches the 404 of an unknown param's opengraph-image there (a 0-byte `.body` + a `.meta`
 * with status 404), so the assertion must still pass on a `.next` that has served the smoke script
 * or a crawler.
 */
describe('assert:prerender on a .next that has served traffic', () => {
  const SNAPSHOT = path.join(REPO, 'data', 'field-hockey', 'snapshot.json');
  // Loaded as the build (and the script) loads it: a file written before a league was added is upgraded.
  const stored = loadSnapshot(JSON.parse(readFileSync(SNAPSHOT, 'utf8')));
  // As the site reads it (lib/data.ts): a league fixture no source lists is a game with a page of its own.
  const snapshot = { ...stored, games: withFixtureGames(stored.games, stored.officialFixtures ?? [], localDateKey(stored.fetchedAt), stored.fetchedAt).games };
  const OK_META = JSON.stringify({ status: 200, headers: { 'content-type': 'image/png' } });
  const NOT_FOUND_META = JSON.stringify({ headers: {}, status: 404 });

  function tree(extra: Record<string, string>): string {
    const root = mkdtempSync(path.join(tmpdir(), 'scvalfh-prerender-'));
    const app = path.join(root, '.next', 'server', 'app');
    const put = (rel: string, body = '') => {
      mkdirSync(path.dirname(path.join(app, rel)), { recursive: true });
      writeFileSync(path.join(app, rel), body);
    };
    for (const p of ['index', 'about', 'standings', 'schedule', 'playoffs', 'teams', 'leaders', 'history/2025-26', 'clubs', 'club-calendar', 'commits', 'recruiting', 'jv', 'draft/awards']) {
      put(`${p}.html`);
    }
    put('opengraph-image.body');
    put('standings/opengraph-image.body');
    const families: Record<string, string[]> = {
      standings: [...LEAGUE_IDS],
      schedule: [...LEAGUE_IDS],
      playoffs: [...TOURNAMENT_LEAGUE_IDS],
      game: snapshot.games.map((g) => g.slug!),
      scores: [...new Set(snapshot.games.map((g) => g.dateKey))],
      teams: snapshot.teams.map((t) => t.slug),
      // One page per listed JV game (app/jv/game/[id]), each with its OG card.
      'jv/game': getJvGameSlugs(),
    };
    // A team page carries both sections on every team, in every league.
    const body = (family: string) =>
      family === 'teams' ? '<main><section id="player-stats"></section><section id="roster"></section></main>' : '';
    for (const [family, params] of Object.entries(families)) {
      for (const p of params) {
        put(`${family}/${p}.html`, body(family));
        put(`${family}/${p}/opengraph-image.body`, 'png');
        put(`${family}/${p}/opengraph-image.meta`, OK_META);
      }
    }
    // One page per club of data/field-hockey/clubs.json (DESIGN §17), and no OG card: the clubs pages take the
    // root one.
    for (const slug of getClubSlugs()) put(`clubs/${slug}.html`);
    // One JV calendar per league (app/jv/[league]), no OG card either.
    for (const league of LEAGUE_IDS) put(`jv/${league}.html`);
    for (const [rel, body] of Object.entries(extra)) put(rel, body);
    return root;
  }

  function run(root: string) {
    return runScript('scripts/assert-prerender.ts', [], { cwd: root, env: { ...process.env, SCVAL_SNAPSHOT: SNAPSHOT } });
  }

  const notFound = (rel: string) => ({ [`${rel}.body`]: '', [`${rel}.meta`]: NOT_FOUND_META });

  it('passes on the build alone', () => {
    const r = run(tree({}));
    expect(r.output).toContain('assert-prerender: ok');
    expect(r.status).toBe(0);
  });

  it('ignores the opengraph-image 404s next start cached for unknown params', () => {
    const r = run(
      tree({
        ...notFound('standings/nope/opengraph-image'),
        ...notFound('standings/__proto__/opengraph-image'),
        ...notFound('schedule/nope/opengraph-image'),
        ...notFound('playoffs/scval/opengraph-image'),
        ...notFound('scores/2026-01-01/opengraph-image'),
        ...notFound('teams/nope/opengraph-image'),
        ...notFound('game/sblive:1/opengraph-image'),
      }),
    );
    expect(r.output).toContain('ignoring 7 opengraph-image 404(s)');
    expect(r.output).toContain('assert-prerender: ok');
    expect(r.status).toBe(0);
  });

  it('fails a team page that lost its Roster or Player stats section, naming the team', () => {
    const slug = snapshot.teams[30].slug; // a BVAL/PCAL/MCAL team, not an SCVAL one
    const r = run(tree({ [`teams/${slug}.html`]: '<main><section id="roster"></section></main>' }));
    expect(r.output).toContain(`team page section(s) missing: ${slug} (#player-stats)`);
    expect(r.status).toBe(1);
  });

  it('fails a clubs page that is not a club of data/field-hockey/clubs.json, or a club with no page, naming it', () => {
    const extra = run(tree({ 'clubs/nope.html': '' }));
    expect(extra.output).toContain('FAIL clubs/: 1 unexpected page(s) prerendered: nope');
    expect(extra.status).toBe(1);

    const root = tree({});
    const slug = getClubSlugs()[0];
    rmSync(path.join(root, '.next', 'server', 'app', 'clubs', `${slug}.html`));
    const missing = run(root);
    expect(missing.output).toContain(`FAIL clubs/: 1 expected page(s) not prerendered: ${slug}`);
    expect(missing.status).toBe(1);
  });

  it('still fails on a served card without its page, with or without a .meta', () => {
    const extras: Array<Record<string, string>> = [
      { 'standings/nope/opengraph-image.body': 'png', 'standings/nope/opengraph-image.meta': OK_META },
      { 'standings/nope/opengraph-image.body': 'png' },
    ];
    for (const extra of extras) {
      const r = run(tree(extra));
      expect(r.output).toContain('FAIL standings/: opengraph-image without its page: standings/nope/opengraph-image');
      expect(r.status).toBe(1);
    }
  });
});

/**
 * scripts/assert-vinext-prerender.ts reports like the other build-output gates: a missing build is
 * one line and exit 1, never a stack trace.
 */
describe('assert-vinext-prerender before a vinext build', () => {
  it('fails in one line, naming the file it needs and the build that writes it', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'scvalfh-vinext-'));
    const res = runScript('scripts/assert-vinext-prerender.ts', [], { cwd: root });
    expect(res.stderr.trim()).toBe(
      'assert-vinext-prerender: dist/server/vinext-prerender.json does not exist; ' +
        'run `pnpm build:vinext` (or `pnpm build:cloudflare`) first',
    );
    expect(res.status).toBe(1);
  });
});

/**
 * update-data.yml and deploy-cloudflare.yml must agree on what a data commit is.
 *
 * deploy-cloudflare ships main's tip without a ci run of its own only when every commit above the
 * last ci-tested one is recognisably update-data's: by the bot, one parent, a message with one of
 * the gate's prefixes, and nothing but the gate's data files. Both halves live in YAML shell, so a
 * new data file or a reworded message on one side silently stops deploys (or, worse, widens what
 * ships untested). These read both files as text and hold them to each other.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { gameIdToParam } from '../lib/game-id';
import { LEAGUE_IDS, TOURNAMENT_LEAGUE_IDS } from '../lib/leagues';
import { REPO } from './helpers';

const read = (name: string) => readFileSync(path.join(REPO, '.github', 'workflows', name), 'utf8');
const update = read('update-data.yml');
const deploy = read('deploy-cloudflare.yml');

/** Every path update-data stages: the arguments of its `git add` lines. */
const committedFiles = new Set(
  [...update.matchAll(/^\s*git add ([^\n]+)$/gm)].flatMap((m) => m[1].trim().split(/\s+/)),
);

/** The literal start of every message update-data commits with, up to its first `$`. */
const messagePrefixes = [...update.matchAll(/git commit -m "([^"$]+)/g)].map((m) => m[1]);

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
      'data/player-stats.json',
      'data/snapshot.json',
      'data/snapshot.meta.json',
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

  it('commits as the bot the gate looks for', () => {
    expect(update).toMatch(/git config user\.name {2}"github-actions\[bot\]"/);
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
    expect(stepBody(update, 'Test')).toContain('run: pnpm test');
    for (const text of [update, deploy]) expect(text).not.toMatch(/^\s*CI_GATE:/m);
  });
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

describe('the Stage D gate runs the cloudflare job’s checks', () => {
  const ci = read('ci.yml');
  const gate = readFileSync(path.join(REPO, 'scripts', 'stage-gate-d.sh'), 'utf8');

  it('requires the Build Output config and fails on an env file in the Worker output', () => {
    for (const text of [ci, gate]) {
      expect(text).toContain('node scripts/assert-vinext-prerender.mjs --cloudflare');
      expect(text).toContain('pnpm exec tsx scripts/assert-budgets.ts --worker-only');
      expect(text).toContain('test -f .cloudflare/output/v0/config.json');
      expect(text).toContain(`find .cloudflare/output \\( -name '.dev.vars*' -o -name '.env*' \\) -print`);
    }
  });
});

/**
 * scripts/assert-prerender.ts over a synthetic `.next/server/app` that holds exactly what the
 * build prerenders for data/snapshot.json, plus whatever a case adds. `next start` caches the 404
 * of an unknown param's opengraph-image there (a 0-byte `.body` + a `.meta` with status 404), so
 * the assertion must still pass on a `.next` that has served the smoke script or a crawler.
 */
describe('assert:prerender on a .next that has served traffic', () => {
  const SNAPSHOT = path.join(REPO, 'data', 'snapshot.json');
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as {
    games: Array<{ contestId: string; dateKey: string }>;
    supersededGames?: Record<string, string>;
    teams: Array<{ slug: string }>;
  };
  const OK_META = JSON.stringify({ status: 200, headers: { 'content-type': 'image/png' } });
  const NOT_FOUND_META = JSON.stringify({ headers: {}, status: 404 });

  function tree(extra: Record<string, string>): string {
    const root = mkdtempSync(path.join(tmpdir(), 'scvalfh-prerender-'));
    const app = path.join(root, '.next', 'server', 'app');
    const put = (rel: string, body = '') => {
      mkdirSync(path.dirname(path.join(app, rel)), { recursive: true });
      writeFileSync(path.join(app, rel), body);
    };
    for (const p of ['index', 'about', 'standings', 'schedule', 'playoffs', 'teams', 'history/2025-26']) {
      put(`${p}.html`);
    }
    put('opengraph-image.body');
    put('standings/opengraph-image.body');
    const families: Record<string, string[]> = {
      standings: [...LEAGUE_IDS],
      schedule: [...LEAGUE_IDS],
      playoffs: [...TOURNAMENT_LEAGUE_IDS],
      game: [
        ...snapshot.games.map((g) => gameIdToParam(g.contestId)),
        ...Object.keys(snapshot.supersededGames ?? {}).map(gameIdToParam),
      ],
      scores: [...new Set(snapshot.games.map((g) => g.dateKey))],
      teams: snapshot.teams.map((t) => t.slug),
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
    for (const [rel, body] of Object.entries(extra)) put(rel, body);
    return root;
  }

  function run(root: string) {
    const res = spawnSync(
      path.join(REPO, 'node_modules', '.bin', 'tsx'),
      [path.join(REPO, 'scripts', 'assert-prerender.ts')],
      { cwd: root, encoding: 'utf8', env: { ...process.env, SCVAL_SNAPSHOT: SNAPSHOT } },
    );
    if (res.error) throw res.error;
    return { status: res.status, output: `${res.stdout}${res.stderr}` };
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

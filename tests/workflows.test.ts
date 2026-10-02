/**
 * update-data.yml and deploy-cloudflare.yml must agree on what a data commit is.
 *
 * deploy-cloudflare ships main's tip without a ci run of its own only when every commit above the
 * last ci-tested one is recognisably update-data's: by the bot, one parent, a message with one of
 * the gate's prefixes, and nothing but the gate's data files. Both halves live in YAML shell, so a
 * new data file or a reworded message on one side silently stops deploys (or, worse, widens what
 * ships untested). These read both files as text and hold them to each other.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

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
  const step = /- name: Fetch player stats\n([\s\S]*?)\n\n/.exec(update)?.[1] ?? '';

  it('runs the stats script, after the snapshot and before the tests', () => {
    expect(step).toContain('run: pnpm fetch-player-stats');
    const at = (s: string) => update.indexOf(s);
    expect(at('- name: Fetch data')).toBeLessThan(at('- name: Fetch player stats'));
    expect(at('- name: Fetch player stats')).toBeLessThan(at('- name: Test'));
  });

  it('can never fail the run: a stats outage must not cost the day’s scores', () => {
    expect(step).toMatch(/continue-on-error: true/);
  });

  it('passes the manual --force through, as fetch-data does', () => {
    expect(step).toContain("inputs.force) && '--force'");
  });
});

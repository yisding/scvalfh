/**
 * Copy honesty over the BUILT HTML (SPEC §10.9, §12.3): what a reader can actually be served.
 *
 *   pnpm build && pnpm assert:copy
 *
 * Over every `.next/server/app/**\/*.html` (visible markup AND the inline RSC payload):
 *  - no case-sensitive "Gabilan". The only allowed trace of the MaxPreps table name is the
 *    lowercase slug inside a MaxPreps URL (`…/pacific-coast--gabilan/…`), so every maxpreps.com URL
 *    is removed first and then no "gabilan" in any case may remain;
 *  - no /eliminat/i;
 *  - no division label on a single-division league ("PCAL Division", "MCAL Division",
 *    "Marin County Division").
 * Inside the `<main>` element only (the site-wide footer, Attribution, is outside it and exempt) of
 * every page of a North Coast Section league (MCAL: `standings/mcal`, `schedule/mcal`,
 * `playoffs/mcal`, its nine team pages): no "automatic qualifier", "at-large", "CCS Division",
 * "CCS picture", no BerthMeter label ("holds <n> of 16"), and "CCS" only in the
 * `CCS playoffs (SCVAL, BVAL, PCAL) →` link.
 * And: `playoffs/mcal.html` contains "North Coast Section"; `standings.html` keeps the old anchors
 * `id="de-anza"` and `id="el-camino"`.
 *
 * League, division and team ids come from lib/leagues.ts and the snapshot, never from the build.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { LEAGUES, TOURNAMENT_LEAGUE_IDS, divisionLabel, isSingleDivision } from '../lib/leagues';

const APP = '.next/server/app';
const SNAPSHOT = process.env.SCVAL_SNAPSHOT ?? 'data/snapshot.json';

if (!existsSync(APP)) {
  console.error(`assert-copy: ${APP} does not exist; run \`pnpm build\` first`);
  process.exit(1);
}

const problems: string[] = [];
const fail = (file: string, msg: string) => problems.push(`${file}: ${msg}`);

/** A short window of text around a match, tags flattened, for the failure line. */
function around(text: string, index: number): string {
  return text.slice(Math.max(0, index - 60), index + 60).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function forbid(file: string, text: string, pattern: RegExp, what: string): void {
  const m = pattern.exec(text);
  if (m) fail(file, `${what} — “…${around(text, m.index)}…”`);
}
/** The `<main>…</main>` element of a page (one per page; the smoke test asserts it exists). */
function mainOf(file: string, html: string): string {
  const m = /<main[\s>][\s\S]*?<\/main>/.exec(html);
  if (!m) {
    fail(file, 'no <main> element');
    return '';
  }
  return m[0];
}

const files = (readdirSync(APP, { recursive: true }) as string[])
  .map((f) => f.split(path.sep).join('/'))
  .filter((f) => f.endsWith('.html'));

// The single-division labels that must never be printed ("PCAL Division", "Marin County Division").
const bannedDivisionLabels = new Set<string>();
for (const league of LEAGUES) {
  if (!isSingleDivision(league.id)) continue;
  bannedDivisionLabels.add(`${league.shortName} Division`);
  for (const d of league.divisions) bannedDivisionLabels.add(`${divisionLabel(d.id)} Division`);
}

for (const file of files) {
  const html = readFileSync(path.join(APP, file), 'utf8');
  forbid(file, html, /Gabilan/, 'contains "Gabilan"');
  const withoutMaxprepsUrls = html.replace(/https?:(?:\/|\\\/){2}(?:www\.)?maxpreps\.com[^\s"'<>\\]*/g, '');
  forbid(file, withoutMaxprepsUrls, /gabilan/i, '"gabilan" outside a MaxPreps URL');
  forbid(file, html, /eliminat/i, 'contains "eliminat…"');
  for (const label of bannedDivisionLabels) {
    const i = html.indexOf(label);
    if (i >= 0) fail(file, `single-division league labelled as a division ("${label}") — “…${around(html, i)}…”`);
  }
}

// ---------------------------------------------------------------- NCS (MCAL) pages, <main> only
const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as { teams: Array<{ slug: string; league: string }> };
const ncsLeagues = LEAGUES.filter((l) => l.sectionId === 'ncs');
const ncsPages: string[] = [];
for (const league of ncsLeagues) {
  ncsPages.push(`standings/${league.id}.html`, `schedule/${league.id}.html`);
  if (TOURNAMENT_LEAGUE_IDS.includes(league.id)) ncsPages.push(`playoffs/${league.id}.html`);
  for (const t of snapshot.teams.filter((x) => x.league === league.id)) ncsPages.push(`teams/${t.slug}.html`);
}
const ALLOWED_CCS = 'CCS playoffs (SCVAL, BVAL, PCAL) →';
for (const file of ncsPages) {
  const p = path.join(APP, file);
  if (!existsSync(p)) {
    fail(file, 'not prerendered');
    continue;
  }
  const main = mainOf(file, readFileSync(p, 'utf8'));
  forbid(file, main, /automatic qualifier/i, '<main> of an NCS page says "automatic qualifier"');
  forbid(file, main, /at-large/i, '<main> of an NCS page says "at-large"');
  forbid(file, main, /CCS Division/i, '<main> of an NCS page says "CCS Division"');
  forbid(file, main, /CCS picture/i, '<main> of an NCS page says "CCS picture"');
  forbid(file, main, /holds \d+ of 16/i, '<main> of an NCS page carries a CCS berth meter');
  forbid(file, main.split(ALLOWED_CCS).join(''), /\bCCS\b/, '<main> of an NCS page names CCS outside the "CCS playoffs (SCVAL, BVAL, PCAL) →" link');
}
for (const league of ncsLeagues) {
  if (!TOURNAMENT_LEAGUE_IDS.includes(league.id)) continue;
  const file = `playoffs/${league.id}.html`;
  const p = path.join(APP, file);
  if (existsSync(p) && !readFileSync(p, 'utf8').includes('North Coast Section')) fail(file, 'does not say "North Coast Section"');
}

// ---------------------------------------------------------------- old anchors
const standings = existsSync(path.join(APP, 'standings.html')) ? readFileSync(path.join(APP, 'standings.html'), 'utf8') : '';
for (const id of ['de-anza', 'el-camino']) {
  if (!standings.includes(`id="${id}"`)) fail('standings.html', `no id="${id}" (old /standings#${id} links must resolve)`);
}

console.log(`assert-copy: ${files.length} HTML files scanned; ${ncsPages.length} NCS pages checked inside <main>`);
if (problems.length) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}
console.log('assert-copy: ok');

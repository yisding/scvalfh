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
 *    "Marin County Division", "EAL Division").
 * Inside the `<main>` element only (the site-wide footer, Attribution, is outside it and exempt) of
 * every page of a league outside the Central Coast Section (MCAL: `standings/mcal`,
 * `schedule/mcal`, `playoffs/mcal`, its nine team pages; EAL: `standings/eal`, `schedule/eal`, its
 * six team pages), and inside the EAL's card on `/playoffs` (`id="eal"`, the page's only non-CCS
 * part outside a pointer link): no "automatic qualifier", "at-large", "CCS Division",
 * "CCS picture", no BerthMeter label ("holds <n> of 16"), and "CCS" only in the
 * `CCS playoffs (SCVAL, BVAL, PCAL) →` link.
 * The visible text of every page (`visibleText`: no scripts, so not the RSC payload; the footer
 * included) makes none of the EAL claims of scripts/copy-rules.ts (DESIGN §22.5): no sentence calls
 * the umpires' grid official, no clause calls Davis or Bella Vista a Northern Section school, Red
 * Bluff is never cancelled, withdrawn, dropped or without a program, and nothing says "EAL
 * school(s)" or "EAL member(s)". The EAL's pages (`standings/eal`, `schedule/eal`, its team pages
 * and the `/playoffs` card) print no seed word ("top seed", "No. 2 seed"): its seeding is quoted,
 * never applied.
 * On every page: no claim that rosters or player stats are SCVAL-only (both now cover all five
 * leagues), e.g. "rosters are SCVAL-only" or "player stats (SCVAL only)".
 * On every page, too: nothing data/clubs.json keeps but never renders (DESIGN §17.2, SPEC §1.1j2) —
 * no affiliation's `basis` and no fragment of a source's verbatim `quote`, whole or excerpted, beyond
 * the public names scripts/public-terms.ts lists (`affiliationLeaks` in scripts/copy-rules.ts, which
 * reads past tags, entities and the RSC payload's JSON escapes). Both
 * can name people who are not on the tracked rosters, so a hit is a privacy failure; the line
 * names the page and whose record leaked. One coincidence is not a leak: a quote is verbatim public
 * text, and a page that is NOT built from the clubs file can print the same document from a source
 * of its own and cite it (/history/2025-26 prints the SCVAL all-league PDF, which four quotes copy
 * a line of). On such a page a quote from a document the page itself links is not reported. On the
 * pages built from the clubs file — /clubs, /clubs/<slug>, every /teams/<slug> (the club line) and
 * /about — nothing is excused, since they link the very sources the quotes come from.
 * The same rule covers data/commits.json (DESIGN §21.2, `commitmentLeaks`): no commitment's `basis`
 * and no fragment of a source's `quote` on any page, nothing excused on /commits, every
 * /teams/<slug> (the commitment line) and /about.
 * `history/2025-26.html` (the archive covers SCVAL and BVAL, and marks PCAL, MCAL and EAL unavailable):
 *  - never says the archive is SCVAL-only (it was, once);
 *  - has one section per league of lib/leagues.ts (`id="scval"` ... `id="eal"`), the division
 *    anchors of every available league, and a "Unavailable" card, with the reason, in the section of
 *    every league the data marks unavailable;
 *  - an unavailable league's section has no table and names no champion, winner or award, so
 *    nothing is shown for it that we could not read from an official source;
 *  - an available league's tables are the data's: every varsity row's league record is on the page.
 * `leaders.html` (the site-wide leaderboards):
 *  - has `id="players"`, `id="schools"` and the anchor of every board the view model builds;
 *  - names every team that has entered no player stats, so no player board reads as if it covered
 *    all 49 teams.
 * And: each `playoffs/<league>.html` names its league's section (`playoffs/mcal.html`: "North Coast
 * Section"); `standings.html` keeps the old anchors `id="de-anza"` and `id="el-camino"`.
 *
 * League, division and team ids come from lib/leagues.ts and the snapshot, never from the build.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { buildLeadersView } from '../components/leaders/leaders-view';
import { getClubsFile } from '../lib/clubs';
import { getCommitsFile } from '../lib/commits';
import { getHistoryLeagues } from '../lib/history';
import { getPlayerStats } from '../lib/player-stats';
import {
  LEAGUES,
  TOURNAMENT_LEAGUE_IDS,
  UNBRACKETED_LEAGUE_IDS,
  divisionLabel,
  getSection,
  isSingleDivision,
} from '../lib/leagues';
import type { LeagueId } from '../lib/types';
import {
  EAL_SCHOOL_CLAIM,
  RED_BLUFF_STATUS_CLAIM,
  SCVAL_ONLY_CLAIM,
  SEED_CLAIM,
  affiliationLeaks,
  commitmentLeaks,
  elementById,
  nonMemberSectionClaims,
  sectionById,
  umpireOfficialClaims,
  visibleText,
} from './copy-rules';
import { PUBLIC_TERMS } from './public-terms';

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

const clubsFile = getClubsFile();
/** The pages whose code reads lib/clubs.ts: app/clubs/**, the roster of app/teams/[slug], app/about. */
const builtFromClubs = (file: string) =>
  file === 'clubs.html' || file.startsWith('clubs/') || file.startsWith('teams/') || file === 'about.html';
const clubSourceUrls = [...new Set(clubsFile.affiliations.flatMap((a) => a.sources.map((s) => s.url)))];
/** The clubs file's source documents a page links (an href is HTML-escaped: `&` is `&amp;`). */
const citedBy = (html: string) =>
  new Set(clubSourceUrls.filter((url) => html.includes(`"${url}"`) || html.includes(`"${url.replace(/&/g, '&amp;')}"`)));

const commitsFile = getCommitsFile();
/** The pages whose code reads lib/commits.ts: app/commits, the roster of app/teams/[slug], app/about. */
const builtFromCommits = (file: string) => file === 'commits.html' || file.startsWith('teams/') || file === 'about.html';
const commitSourceUrls = [...new Set(commitsFile.commitments.flatMap((c) => c.sources.map((s) => s.url)))];
/** The commits file's source documents a page links, as `citedBy` finds the clubs file's. */
const commitCitedBy = (html: string) =>
  new Set(commitSourceUrls.filter((url) => html.includes(`"${url}"`) || html.includes(`"${url.replace(/&/g, '&amp;')}"`)));

for (const file of files) {
  const html = readFileSync(path.join(APP, file), 'utf8');
  forbid(file, html, /Gabilan/, 'contains "Gabilan"');
  const withoutMaxprepsUrls = html.replace(/https?:(?:\/|\\\/){2}(?:www\.)?maxpreps\.com[^\s"'<>\\]*/g, '');
  forbid(file, withoutMaxprepsUrls, /gabilan/i, '"gabilan" outside a MaxPreps URL');
  forbid(file, html, /eliminat/i, 'contains "eliminat…"');
  forbid(
    file,
    html,
    SCVAL_ONLY_CLAIM,
    'claims rosters or player stats are SCVAL-only',
  );
  for (const label of bannedDivisionLabels) {
    const i = html.indexOf(label);
    if (i >= 0) fail(file, `single-division league labelled as a division ("${label}") — “…${around(html, i)}…”`);
  }
  const printsItself = builtFromClubs(file) ? undefined : citedBy(html);
  for (const leak of affiliationLeaks(html, clubsFile, { printsItself, publicTerms: PUBLIC_TERMS })) {
    fail(file, `shows what data/clubs.json never renders: ${leak}`);
  }
  const printsCommitSource = builtFromCommits(file) ? undefined : commitCitedBy(html);
  for (const leak of commitmentLeaks(html, commitsFile, { printsItself: printsCommitSource, publicTerms: PUBLIC_TERMS })) {
    fail(file, `shows what data/commits.json never renders: ${leak}`);
  }
  // The EAL claims (DESIGN §22.5), over what a reader sees.
  const text = visibleText(html);
  for (const s of umpireOfficialClaims(text)) fail(file, `calls the umpires' grid official — “${s}”`);
  for (const c of nonMemberSectionClaims(text)) fail(file, `calls Davis or Bella Vista a Northern Section school — “${c}”`);
  forbid(file, text, RED_BLUFF_STATUS_CLAIM, 'says more about Red Bluff than "not fielding a varsity team in 2026"');
  forbid(file, text, EAL_SCHOOL_CLAIM, 'says "EAL school(s)" or "EAL member(s)" (the field hockey EAL is not the all-sports league; say "EAL teams")');
}

// ---------------------------------------------------------------- non-CCS (MCAL, EAL) pages, <main> only
const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as {
  teams: Array<{ slug: string; league: string; name: string }>;
};
const nonCcsLeagues = LEAGUES.filter((l) => l.sectionId !== 'ccs');
/** Each league's own pages: its standings and schedule, its tournament page if it has one, its team pages. */
const leaguePages = (id: LeagueId): string[] => [
  `standings/${id}.html`,
  `schedule/${id}.html`,
  ...(TOURNAMENT_LEAGUE_IDS.includes(id) ? [`playoffs/${id}.html`] : []),
  ...snapshot.teams.filter((x) => x.league === id).map((t) => `teams/${t.slug}.html`),
];
const nonCcsPages = nonCcsLeagues.flatMap((l) => leaguePages(l.id));
const ALLOWED_CCS = 'CCS playoffs (SCVAL, BVAL, PCAL) →';
/** The CCS concepts no part of a non-CCS league's pages may carry. */
function forbidCcs(file: string, part: string, where: string): void {
  forbid(file, part, /automatic qualifier/i, `${where} says "automatic qualifier"`);
  forbid(file, part, /at-large/i, `${where} says "at-large"`);
  forbid(file, part, /CCS Division/i, `${where} says "CCS Division"`);
  forbid(file, part, /CCS picture/i, `${where} says "CCS picture"`);
  forbid(file, part, /holds \d+ of 16/i, `${where} carries a CCS berth meter`);
  forbid(file, part.split(ALLOWED_CCS).join(''), /\bCCS\b/, `${where} names CCS outside the "CCS playoffs (SCVAL, BVAL, PCAL) →" link`);
}
for (const file of nonCcsPages) {
  const p = path.join(APP, file);
  if (!existsSync(p)) {
    fail(file, 'not prerendered');
    continue;
  }
  forbidCcs(file, mainOf(file, readFileSync(p, 'utf8')), '<main> of a non-CCS page');
}
for (const league of nonCcsLeagues) {
  if (!TOURNAMENT_LEAGUE_IDS.includes(league.id)) continue;
  const file = `playoffs/${league.id}.html`;
  const p = path.join(APP, file);
  const section = getSection(league.sectionId).name;
  if (existsSync(p) && !readFileSync(p, 'utf8').includes(section)) fail(file, `does not say "${section}"`);
}

// ---------------------------------------------------------------- the EAL: its /playoffs card, and no seed words
// /playoffs stays the CCS page; an unbracketed league (EAL) gets a card there with its league id,
// which the league chip and jump link target. The card is that league's copy, so it gets the
// non-CCS bans; it, the league's own pages and its team pages get the seed-word ban (its seeding
// criteria are quoted, never applied).
const playoffsMain = existsSync(path.join(APP, 'playoffs.html'))
  ? mainOf('playoffs.html', readFileSync(path.join(APP, 'playoffs.html'), 'utf8'))
  : '';
let unbracketedPages = 0;
for (const id of UNBRACKETED_LEAGUE_IDS) {
  const card = elementById(playoffsMain, id, 'div');
  if (!card) fail('playoffs.html', `no <div id="${id}"> card (the /playoffs#${id} chip and jump link resolve to it)`);
  forbidCcs('playoffs.html', card, `the #${id} card`);
  forbid('playoffs.html', visibleText(card), SEED_CLAIM, `the #${id} card prints a seed word`);
  for (const file of leaguePages(id)) {
    const p = path.join(APP, file);
    if (!existsSync(p)) continue; // reported above, with the other non-CCS pages
    forbid(file, visibleText(readFileSync(p, 'utf8')), SEED_CLAIM, `a page of an unbracketed league (${id}) prints a seed word`);
    unbracketedPages += 1;
  }
}

// ---------------------------------------------------------------- /history/2025-26
const historyFile = 'history/2025-26.html';
const historyPath = path.join(APP, historyFile);
if (!existsSync(historyPath)) {
  fail(historyFile, 'not prerendered');
} else {
  const html = readFileSync(historyPath, 'utf8');
  const main = mainOf(historyFile, html);
  forbid(historyFile, main, /SCVAL[- ]only/i, 'says the archive is SCVAL-only');
  forbid(historyFile, main, /Only SCVAL/i, 'says only SCVAL has an archive');
  /** A league's `<section … id="<league>" …>…</section>`, its division sections included. */
  const sectionOf = (id: string): string => sectionById(main, id);
  const attrDecode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'");
  for (const { id, entry } of getHistoryLeagues()) {
    const section = sectionOf(id);
    if (!section) {
      fail(historyFile, `no <section id="${id}">`);
      continue;
    }
    if (entry.status === 'available') {
      for (const d of entry.divisions) {
        if (!section.includes(`id="${d.division}"`)) fail(historyFile, `${id}: no id="${d.division}" division anchor`);
        for (const row of d.standings.varsity) {
          if (!section.includes(`>${row.leagueRecord}<`)) {
            fail(historyFile, `${id}/${d.division}: ${row.name}'s record ${row.leagueRecord} is not on the page`);
          }
        }
      }
      if (/Unavailable/.test(section)) fail(historyFile, `${id}: an available league says "Unavailable"`);
    } else {
      if (!section.includes('Unavailable')) fail(historyFile, `${id}: unavailable league has no "Unavailable" card`);
      if (!attrDecode(section).includes(entry.reason.slice(0, 40))) fail(historyFile, `${id}: the reason is not on the page`);
      if (/<table/.test(section)) fail(historyFile, `${id}: an unavailable league shows a table`);
      forbid(historyFile, section, /champion|winner|all-league|MVP|first team/i, `${id}: an unavailable league shows a result or award`);
    }
  }
}

// ---------------------------------------------------------------- /leaders
{
  const file = 'leaders.html';
  const p = path.join(APP, file);
  if (!existsSync(p)) {
    fail(file, 'not prerendered');
  } else {
    const main = mainOf(file, readFileSync(p, 'utf8'));
    const view = buildLeadersView();
    for (const id of ['players', 'schools', ...[...view.players, ...view.schools].map((b) => b.id)]) {
      if (!main.includes(`id="${id}"`)) fail(file, `no id="${id}" (anchor /leaders#${id})`);
    }
    // The Players section only: a team with no stats can still be named on a school board, which
    // says nothing about its players.
    const start = main.indexOf('<section id="players"');
    const end = main.indexOf('<section id="schools"');
    // `&amp;` last, so an escaped `&amp;#39;` decodes once (to `&#39;`), never twice.
    const players = (start >= 0 && end > start ? main.slice(start, end) : '')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&amp;/g, '&');
    const statSlugs = new Set(getPlayerStats().teams.filter((t) => t.players.length > 0).map((t) => t.slug));
    for (const team of snapshot.teams) {
      if (statSlugs.has(team.slug)) continue;
      if (!players.includes(team.name)) fail(file, `${team.name} has no player stats, and the Players section does not say so`);
    }
  }
}

// ---------------------------------------------------------------- old anchors
const standings = existsSync(path.join(APP, 'standings.html')) ? readFileSync(path.join(APP, 'standings.html'), 'utf8') : '';
for (const id of ['de-anza', 'el-camino']) {
  if (!standings.includes(`id="${id}"`)) fail('standings.html', `no id="${id}" (old /standings#${id} links must resolve)`);
}

console.log(
  `assert-copy: ${files.length} HTML files scanned (the EAL claims over the visible text of each); ` +
    `${nonCcsPages.length} non-CCS pages checked inside <main>; ${UNBRACKETED_LEAGUE_IDS.length} /playoffs card(s) ` +
    `and ${unbracketedPages} pages of unbracketed leagues checked for seed words; ` +
    `the quotes and bases of ${clubsFile.affiliations.length} club affiliations and ${commitsFile.commitments.length} ` +
    `college commitments looked for on every page`,
);
if (problems.length) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}
console.log('assert-copy: ok');

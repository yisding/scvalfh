#!/usr/bin/env node
/**
 * Keep a copy of the California field hockey clubs' own public roster pages, so the high school field hockey
 * rosters can be compared with them (`pnpm compare-club-rosters:field-hockey`; README, "Field hockey: club
 * rosters"). No league or event publishes California club rosters (TourneyMachine's festival feed carries no
 * athletes, Cal Cup's Playbook pages give results only, SportsRecruits' event rosters need a college coach's
 * login, the SoCal Field Hockey Federation's roster data answers 401), so the copy is the clubs' own pages:
 *
 *   SportsRecruits (NFHCA Recruits) club players lists, one team per heading, each row "Name, class year":
 *     SF Hawks (San_Francisco_Youth_FHC), Myto (mytofieldhockey), HTC (htcfieldhockey; its California team only)
 *   SF Hawks' Current Players page (sfyouthfieldhockey.com), by class year
 *   NorCal Impact's Player Directory (norcalimpactfh.weebly.com), each player's graduation year
 *   RUSH's Elite Performance Group directory (rushfieldhockey.org), each profile's graduation year
 *   Lightning's SportsEngine rosters (lightningfieldhockey.org), names only
 *
 *   pnpm fetch-club-rosters:field-hockey             rewrite data/field-hockey/club-rosters.json
 *   pnpm fetch-club-rosters:field-hockey --dry-run   fetch and count, write nothing
 *
 * Every page is served whole to a plain request. One request at a time, a second apart (about 35).
 * Kept per team: the group (`league`), name, club and page; per player: name, class year (where the page gives
 * one), position. Not kept: jerseys, photos, commitments, the HTC teams outside California and anyone too young
 * to be in high school in 2026-27 (a class year after 2030, counted in `tooYoung`) or past it (before 2027,
 * left out with them). A page that gives no class year (Lightning's) is kept and never links on a name alone.
 * `clubSlugs` is hand-kept and carried over. The file is never rendered: it names players who are on no tracked
 * roster.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'field-hockey', 'club-rosters.json');
const DRY_RUN = process.argv.includes('--dry-run');
const PAUSE_MS = 1000;
const SEASON = '26-27';
const FIRST_CLASS = 2027;
const LAST_CLASS = 2030;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getText(url) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA } });
      if (res.ok) {
        const body = await res.text();
        await sleep(PAUSE_MS);
        return body;
      }
      if (attempt >= 3 || (res.status < 500 && res.status !== 429)) throw new Error(`${res.status} ${url}`);
    } catch (e) {
      if (attempt >= 3) throw e;
    }
    await sleep(PAUSE_MS * 5 * attempt);
  }
}

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&#0?39;|&#8217;|&rsquo;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#8203;|​/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** "Genevieve (Evie) Ferrini" → { firstName: 'Genevieve', lastName: 'Ferrini' }; the last word is the surname but for a lower-case particle ("van de Braak"). */
function splitName(raw) {
  const words = decode(raw).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
  if (words.length < 2) return null;
  let i = words.length - 1;
  while (i > 1 && /^(van|de|der|von|la|le|di|da|del)$/i.test(words[i - 1])) i -= 1;
  return { firstName: words.slice(0, i).join(' '), lastName: words.slice(i).join(' ') };
}

const counts = { tooYoung: 0 };
/** A player row, or null for one out of the season's classes (counted). */
function player(rawName, gradYear, position) {
  const name = splitName(rawName);
  if (name === null) return null;
  if (gradYear !== null && (gradYear > LAST_CLASS || gradYear < FIRST_CLASS)) {
    counts.tooYoung += 1;
    return null;
  }
  return { ...name, gradYear, position: position && position.trim() !== '' ? position.trim() : null, playerType: null };
}

// ---------------------------------------------------------------- SportsRecruits players lists

const SR_ORGS = [
  { slug: 'San_Francisco_Youth_FHC', club: 'SF Hawks' },
  { slug: 'mytofieldhockey', club: 'Myto Field Hockey' },
  { slug: 'htcfieldhockey', club: 'HTC', only: /California/ },
];

async function sportsRecruits() {
  const teams = [];
  for (const org of SR_ORGS) {
    const embed = `https://nfhca.sportsrecruits.com/organization/${org.slug}/embed/?type=players&teamid=all`;
    const html = await getText(embed);
    // Each team is an <h3> heading (a link to the team's own page, or plain text for "Unassigned Players"),
    // then its players' cards: "<a … class="weight-400 name">Name, 2028</a>" and a "<p>" of jersey and positions.
    const parts = html.split(/<h3[^>]*>/).slice(1);
    for (const part of parts) {
      const head = part.slice(0, part.indexOf('</h3>'));
      const name = decode(head);
      const link = /href="(https:\/\/nfhca\.sportsrecruits\.com\/organization\/[^"]+)"/.exec(head)?.[1] ?? embed;
      if (org.only && !org.only.test(name)) continue;
      const players = [];
      let tooYoung = 0;
      const before = counts.tooYoung;
      for (const m of part.matchAll(/class="weight-400 name"[^>]*>([^<]+)<\/a>\s*<\/div>\s*<p[^>]*>([\s\S]*?)<\/p>/g)) {
        const card = /^(.*),\s*(\d{4})$/.exec(decode(m[1]));
        const positions = decode(m[2]).replace(/^#\d+,?\s*/, '');
        const p = card ? player(card[1], Number(card[2]), positions) : player(m[1], null, positions);
        if (p) players.push(p);
      }
      tooYoung = counts.tooYoung - before;
      teams.push({ league: 'sportsrecruits', division: name, teamId: teams.length + 1, teamName: name, clubId: org.slug, clubName: org.club, url: link, hidden: 0, tooYoung, players });
    }
  }
  return teams;
}

// ---------------------------------------------------------------- the clubs' own pages

async function sfHawks() {
  const url = 'https://sfyouthfieldhockey.com/current-players/';
  const html = await getText(url);
  const players = [];
  const before = counts.tooYoung;
  // "Class of 2027" headings (h2), then each player's image box: <h3 …title>Name</h3><p …description>Forward | #44</p>.
  for (const section of html.split(/<h2[^>]*>\s*(?:<span>)?\s*Class of /).slice(1)) {
    const year = Number(/^(\d{4})/.exec(section)?.[1]);
    for (const m of section.matchAll(/<h3 class="elementor-image-box-title">([\s\S]*?)<\/h3>(?:<p class="elementor-image-box-description">([\s\S]*?)<\/p>)?/g)) {
      const p = player(m[1], year, decode(m[2] ?? '').replace(/\s*\|?\s*#\d+$/, ''));
      if (p) players.push(p);
    }
  }
  return [{ league: 'club-sites', division: 'Current Players', teamId: 1, teamName: 'SF Hawks Current Players', clubId: 'sfyouthfieldhockey.com', clubName: 'SF Hawks', url, hidden: 0, tooYoung: counts.tooYoung - before, players }];
}

async function norcalImpact() {
  const url = 'https://norcalimpactfh.weebly.com/player-directory.html';
  const html = await getText(url);
  const players = [];
  const before = counts.tooYoung;
  // Each player: a button with the name, then "Graduation Year: 2027" and "Position(s): …".
  for (const m of html.matchAll(/<span class="wsite-button-inner">([^<]+)<\/span>([\s\S]*?)(?=<span class="wsite-button-inner">|$)/g)) {
    const text = decode(m[2]);
    const year = /Graduation Year:\s*(\d{4})/.exec(text);
    if (!year) continue;
    const position = /Position\(s\):\s*([A-Za-z ,/]+?)(?:\s+Commitment:|\s*$|\s+Graduation)/.exec(text)?.[1] ?? null;
    const p = player(m[1], Number(year[1]), position);
    if (p) players.push(p);
  }
  return [{ league: 'club-sites', division: 'Player Directory', teamId: 2, teamName: 'NorCal Impact Player Directory', clubId: 'norcalimpactfh.weebly.com', clubName: 'NorCal Impact', url, hidden: 0, tooYoung: counts.tooYoung - before, players }];
}

async function rush() {
  const url = 'https://www.rushfieldhockey.org/player-directory/';
  const html = await getText(url);
  const links = [...new Set([...html.matchAll(/href="(https:\/\/www\.rushfieldhockey\.org\/player-directory\/elite-performance-group\/[a-z0-9-]+\/)"/g)].map((m) => m[1]))];
  const players = [];
  const before = counts.tooYoung;
  for (const link of links) {
    const page = decode(await getText(link));
    // "Elite Performance Group Directory <Name> Graduation Year: 2029 Position: B/M"
    const m = /Elite Performance Group Directory (.+?) Graduation Year:\s*(\d{4})(?: Position:\s*([A-Za-z/]+))?/.exec(page);
    if (!m) continue;
    const p = player(m[1], Number(m[2]), m[3] ?? null);
    if (p) players.push(p);
  }
  return [{ league: 'club-sites', division: 'Elite Performance Group', teamId: 3, teamName: 'RUSH Elite Performance Group', clubId: 'rushfieldhockey.org', clubName: 'RUSH Field Hockey', url, hidden: 0, tooYoung: counts.tooYoung - before, players }];
}

async function lightning() {
  const teams = [];
  for (const id of [9155774, 9155773]) {
    const url = `https://www.lightningfieldhockey.org/roster/show/${id}?subseason=950528`;
    const html = await getText(url);
    const title = decode(/<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? `Roster ${id}`).replace(/\s*-\s*Roster$/, '');
    const players = [];
    for (const m of html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)) {
      const name = decode(m[1]);
      if (!/^[A-Z][A-Za-z'.-]+( [A-Za-z'.-]+)+$/.test(name)) continue;
      const p = player(name, null, null);
      if (p) players.push(p);
    }
    teams.push({ league: 'club-sites', division: title, teamId: id, teamName: `Lightning ${title}`, clubId: 'lightningfieldhockey.org', clubName: 'Lightning Field Hockey', url, hidden: 0, tooYoung: 0, players });
  }
  return teams;
}

async function main() {
  const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
  const teams = [...(await sportsRecruits()), ...(await sfHawks()), ...(await norcalImpact()), ...(await rush()), ...(await lightning())];
  const today = new Date().toISOString().slice(0, 10);
  const file = {
    builtBy:
      'pnpm fetch-club-rosters:field-hockey (scripts/fetch-club-rosters-field-hockey.mjs): the California field hockey clubs\' own public roster pages, on SportsRecruits and their own sites. clubSlugs is kept by hand and carried over.',
    fetchedAt: new Date().toISOString(),
    season: SEASON,
    notes: [
      'A kept copy of the public roster pages of the California field hockey clubs that publish one, so a high school roster can be compared with them (pnpm compare-club-rosters:field-hockey). No league or event publishes California club rosters, so this is far from every club player: the Los Angeles, Orange County and Ventura clubs, and most Northern California clubs, post none. Never rendered: it names players who are on no tracked roster.',
      'SportsRecruits lists only the players who linked their own profile to the club, each with a class year; the club pages list their current players (SF Hawks, by class year; NorCal Impact and RUSH, each with a graduation year); Lightning\'s SportsEngine rosters (its 2025 Fall Season, the latest it posts) give names only and never link on a name alone.',
      `Kept per player: name, class year where the page gives one, position. Not kept: jerseys, photos, commitments, HTC's teams outside California, and players outside the classes of ${FIRST_CLASS}-${LAST_CLASS} (counted in tooYoung). Read ${today}.`,
    ],
    leagues: [
      { id: 'sportsrecruits', name: 'SportsRecruits club players lists (SF Hawks, Myto, HTC California)', eventId: 0, url: 'https://nfhca.sportsrecruits.com/organization/San_Francisco_Youth_FHC/embed/?type=players&teamid=all' },
      { id: 'club-sites', name: 'The clubs\' own roster pages (SF Hawks, NorCal Impact, RUSH, Lightning)', eventId: 0, url: 'https://sfyouthfieldhockey.com/current-players/' },
    ],
    clubSlugs: previous?.clubSlugs ?? {},
    counts: {
      teams: teams.length,
      players: teams.reduce((n, t) => n + t.players.length, 0),
      hidden: 0,
      tooYoung: teams.reduce((n, t) => n + t.tooYoung, 0),
      emptyTeams: teams.filter((t) => t.players.length === 0).length,
    },
    teams,
  };
  for (const t of teams) console.log(`${t.clubName} / ${t.teamName}: ${t.players.length} kept, ${t.tooYoung} out of the classes`);
  console.log(JSON.stringify(file.counts));
  if (!DRY_RUN) writeFileSync(OUT, `${JSON.stringify(file, null, 1)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

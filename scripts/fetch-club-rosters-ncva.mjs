#!/usr/bin/env node
/**
 * Keep a copy of the public team rosters of the NCVA's Girls Power League, the Northern California region's
 * girls club volleyball league, so the high school volleyball rosters can be compared with them
 * (`pnpm compare-club-rosters:volleyball`; README, "Girls volleyball: club rosters"):
 *
 *   2026 NCVA Girls Power League (the 2025-26 club season, Jan-May 2026)   TM2Sign event 2136
 *   2027 NCVA Girls Power League (the 2026-27 club season, from Jan 2027)  TM2Sign event 2585
 *
 *   pnpm fetch-club-rosters:volleyball             rewrite data/volleyball/club-rosters.json
 *   pnpm fetch-club-rosters:volleyball --dry-run   fetch and count, write nothing
 *
 * The NCVA runs its events on TM2Sign (ncva.com's results link there). TM2Sign's public JSON API answers a
 * plain request with no login: `api/public/scheduler-teams?filter[event_id]=<event>` lists an event's teams
 * (name, club name, the USAV team code whose first letters give the age group, the team's USAV region), and
 * `api/public/scheduler-teams/<team>/roster` its players (first and last name, jersey) and staff. robots.txt
 * disallows the app's /app/event/ pages, not /api/public/. One request at a time, a second apart.
 *
 * Read: the girls teams of the NCVA region (region NC, or a team with no region of a club that has NC teams),
 * in the age groups that can hold a player in high school in 2026-27 (below). A team listed twice (in its
 * league division and a second one) is read once. Kept per team: league, age group, name, club name, the
 * roster's API address and the classes the age group admits; per player: first and last name. Not kept:
 * jerseys, staff, and any team id other than TM2Sign's. A roster gives no class year, position or school.
 *
 * The age group (USA Volleyball's age definition): in the season ending in year Y, an "A's" team is for
 * players born on or after July 1 of Y-A-1, and a player not playing up was born before July 1 of Y-A.
 * California's school-entry cutoff is September 1, so those players are in the classes of Y-A+17 (born July
 * or August of Y-A-1) and Y-A+18: a 16s team of the 2026 league is the classes of 2027 and 2028. A player
 * playing up (a younger player on an older team) is in a later class, which the comparison never admits.
 * The 2026 league's 18s (classes 2025 and 2026) and the 2027 league's 13s (2031 and 2032) are not read.
 *
 * `clubSlugs` (a TM2Sign club name → the club's slug in data/volleyball/clubs.json) is hand-kept in the file
 * and carried over; a club with no entry is compared but never linked. The file is never rendered.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'volleyball', 'club-rosters.json');
const DRY_RUN = process.argv.includes('--dry-run');
const API = 'https://tm2sign.com/api/public';
const PAUSE_MS = 1000;

/** The high school season the copy is for. */
const SEASON = '26-27';
const SEASON_CLASSES = { first: 2027, last: 2030 };

const LEAGUES = [
  { id: 'ncva-power-2026', eventId: 2136, seasonEnd: 2026, clubSeason: '2025-26', name: '2026 NCVA Girls Power League (the 2025-26 club season)' },
  { id: 'ncva-power-2027', eventId: 2585, seasonEnd: 2027, clubSeason: '2026-27', name: '2027 NCVA Girls Power League (the 2026-27 club season)' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (res.ok) return await res.json();
      if (attempt >= 3 || (res.status < 500 && res.status !== 429)) throw new Error(`${res.status} ${url}`);
    } catch (e) {
      if (attempt >= 3) throw e;
    }
    await sleep(PAUSE_MS * 5 * attempt);
  }
}

/** The classes an age group admits in the season ending in `seasonEnd` (see the header). */
export function ageGroupClassYears(age, seasonEnd) {
  return [seasonEnd - age + 17, seasonEnd - age + 18];
}

/** "G16RROCK2NC" → 16; null for a code that does not start with G and an age. */
function ageOf(code) {
  const m = /^G(\d{2})/.exec(code ?? '');
  return m ? Number(m[1]) : null;
}

async function main() {
  const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
  const teams = [];
  const notes = [];
  for (const league of LEAGUES) {
    const listed = await getJson(`${API}/scheduler-teams?filter[event_id]=${league.eventId}`);
    await sleep(PAUSE_MS);
    const all = Array.isArray(listed) ? listed : listed.data;
    const ncClubs = new Set(all.filter((t) => t.region === 'NC').map((t) => t.club_name));
    const seen = new Set();
    const wanted = [];
    for (const t of all.sort((a, b) => a.id - b.id)) {
      const age = ageOf(t.alternate_identifier);
      if (age === null) continue;
      if (!(t.region === 'NC' || ((t.region === null || t.region === '') && ncClubs.has(t.club_name)))) continue;
      const [first, last] = ageGroupClassYears(age, league.seasonEnd);
      if (last < SEASON_CLASSES.first || first > SEASON_CLASSES.last) continue;
      const key = t.club_team_id ?? `id-${t.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      wanted.push({ t, age, classYears: [first, last].filter((y) => y >= SEASON_CLASSES.first && y <= SEASON_CLASSES.last) });
    }
    let read = 0;
    let filled = 0;
    for (const { t, age, classYears } of wanted) {
      const url = `${API}/scheduler-teams/${t.id}/roster`;
      const roster = await getJson(url);
      await sleep(PAUSE_MS);
      read += 1;
      const players = (roster.players ?? [])
        .map((p) => ({ firstName: String(p.first_name ?? '').trim(), lastName: String(p.last_name ?? '').trim(), gradYear: null, position: null, playerType: null }))
        .filter((p) => p.firstName !== '' || p.lastName !== '');
      if (players.length > 0) filled += 1;
      teams.push({
        league: league.id,
        division: `${age}s`,
        teamId: t.id,
        teamName: t.name,
        clubId: t.club_name,
        clubName: t.club_name,
        url,
        classYears,
        hidden: 0,
        tooYoung: 0,
        players,
      });
      if (read % 50 === 0) console.log(`${league.id}: ${read}/${wanted.length} rosters read, ${filled} with players`);
    }
    console.log(`${league.id}: ${read} rosters read, ${filled} with players`);
    notes.push(`${league.name}: ${read} teams read on ${new Date().toISOString().slice(0, 10)}, ${filled} listing players.`);
  }
  const counts = {
    teams: teams.length,
    players: teams.reduce((n, t) => n + t.players.length, 0),
    hidden: 0,
    tooYoung: 0,
    emptyTeams: teams.filter((t) => t.players.length === 0).length,
  };
  const file = {
    builtBy:
      'pnpm fetch-club-rosters:volleyball (scripts/fetch-club-rosters-ncva.mjs): the public team rosters of the NCVA Girls Power League, read from TM2Sign\'s public API (the NCVA\'s own event system). clubSlugs is kept by hand and carried over.',
    fetchedAt: new Date().toISOString(),
    season: SEASON,
    notes: [
      'A kept copy of the public team rosters of the NCVA Girls Power League (USA Volleyball\'s Northern California region), so a high school roster can be compared with them (pnpm compare-club-rosters:volleyball) without reading the league\'s pages again. Never rendered: it names players who are on no tracked roster.',
      'A TM2Sign roster gives each player\'s first and last name and jersey, and nothing else: no class year, position or school. A team is compared on the classes its age group admits (classYears; USA Volleyball\'s July 1 age definition and California\'s September 1 school cutoff), so a player playing up on an older team is never matched.',
      'Kept per player: first and last name. Not kept: jerseys, staff, and the 2026 league\'s 18s and the 2027 league\'s 13s and younger, which hold no player in high school in 2026-27 (a 13s team of the 2026 league holds the class of 2030 born in July or August 2012 only).',
      ...notes,
    ],
    leagues: LEAGUES.map((l) => ({ id: l.id, name: l.name, eventId: l.eventId, url: `${API}/events/${l.eventId}`, clubSeason: l.clubSeason })),
    clubSlugs: previous?.clubSlugs ?? {},
    counts,
    teams,
  };
  console.log(JSON.stringify(counts));
  if (!DRY_RUN) writeFileSync(OUT, `${JSON.stringify(file, null, 1)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

#!/usr/bin/env node
/**
 * Keep a copy of the public club basketball team rosters of the Northern California boys events on The Passport,
 * so the high school basketball rosters can be compared with them (`pnpm compare-club-rosters:basketball`;
 * README, "Boys basketball: club rosters").
 *
 * The Passport (Open Gym Premier's platform; `sportspassports.com` redirects there) runs the events of Grassroots
 * 365 (G365), adidas 3SSB, The Stage, the Breakthrough Circuit, Strictly Hoops and For the Love of the Game. Its
 * JSON API answers a plain request with no login: `events/cards` lists events, `events/<n>/teams` an event's
 * teams by division (name, season, program), and `events/<n>/teams/<team>/roster` a team's roster as it played
 * that event (name, positions, height, class year, verification). One request at a time, a second apart.
 *
 * Read: the boys teams in 14U-17U of every Passport event held in Northern California (Oakland, Alameda,
 * Roseville) from March 2026 on, and, of the adidas 3SSB boys sessions (national), the teams of the programs
 * data/basketball/clubs.json has a record for. A team plays several events with one team number: it is read once,
 * at the latest event it played. Not read: girls events (Hype Her Hoops, the 3SSB Girls), high school
 * (JV/Varsity) divisions, 13U and younger, EYBL, Puma and the Exposure Events tournaments (their rosters are not
 * public).
 *
 * Kept per team: the event it was read at (`league`), division, name, program and the roster's API address; per
 * player: name, positions and class year. Not kept: jerseys, heights, photos, player ids, coaches, and players
 * outside the classes of 2027-2030 (counted in `tooYoung`). `clubSlugs` (a Passport program number → the club's
 * slug in clubs.json) is hand-kept and carried over. The file is never rendered.
 *
 *   pnpm fetch-club-rosters:basketball             rewrite data/basketball/club-rosters.json
 *   pnpm fetch-club-rosters:basketball --dry-run   fetch and count, write nothing
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'basketball', 'club-rosters.json');
const DRY_RUN = process.argv.includes('--dry-run');
const API = 'https://api.the-passport.com/api';
const PAUSE_MS = 1000;
const SEASON = '26-27';
const FIRST_CLASS = 2027;
const LAST_CLASS = 2030;
const FROM = '2026-03-01';
const NORCAL_CITIES = new Set(['Oakland', 'Alameda', 'Roseville', 'San Jose', 'San Francisco', 'Sacramento', 'Walnut Creek']);
const DIVISIONS = new Set(['14U', '15U', '16U', '17U']);
/**
 * The adidas 3SSB boys sessions, and (since 2026-11-28) adidas' western Jr. 3SSB and 3Stripes Gold events held away
 * from Northern California (the West/Mountain Super Regional, the West Open Qualifier, the Gold West Open and
 * Championships, the Open Qualifier Tip-Off and the November West Regionals): only the programs clubs.json has a
 * record for are read. Camps (the All American Camps) are not team events and are not read.
 */
const NATIONAL_EVENTS = new Set([11344, 11346, 11282, 11300, 11336, 11340, 11531, 11577]);
const GIRLS = /Hype Her|Girls/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (res.ok) {
        const body = await res.json();
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

const fold = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function main() {
  const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
  const clubs = JSON.parse(readFileSync(path.join(ROOT, 'data', 'basketball', 'clubs.json'), 'utf8')).clubs;
  const clubNames = clubs.flatMap((c) => [c.name, c.shortName, ...c.aliases]).filter(Boolean).map(fold);
  const isKnownProgram = (name) => clubNames.some((n) => fold(name) === n || fold(name).startsWith(`${n} `));

  const today = new Date().toISOString().slice(0, 10);
  const cards = await getJson(`${API}/events/cards?startDateFrom=${FROM}&startDateTo=${today}`);
  const events = cards
    .filter((e) => !GIRLS.test(`${e.name} ${e.brand?.name ?? ''}`))
    .filter((e) => NATIONAL_EVENTS.has(e.eventNumber) || (e.venues ?? []).some((v) => v.state === 'CA' && NORCAL_CITIES.has(v.city)))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  /** teamNumber → the latest event it played and its listing there. */
  const latest = new Map();
  const leagues = [];
  for (const e of events) {
    const detail = await getJson(`${API}/events/${e.eventNumber}`);
    const listed = await getJson(`${API}/events/${e.eventNumber}/teams`);
    let n = 0;
    for (const [division, teams] of Object.entries(listed.teamsByDivision ?? {})) {
      if (!DIVISIONS.has(division)) continue;
      for (const t of teams) {
        if (t.gender !== 'MALE') continue;
        if (NATIONAL_EVENTS.has(e.eventNumber) && !isKnownProgram(t.program?.name ?? '')) continue;
        latest.set(t.teamNumber, { event: e, team: t });
        n += 1;
      }
    }
    const seasonYear = Number(detail.season ?? e.startDate.slice(0, 4));
    leagues.push({
      id: `passport-${e.eventNumber}`,
      name: `${e.name} (${e.startDate.slice(0, 10)}, ${(e.venues ?? []).map((v) => v.city).join(' / ') || 'venue not listed'})`,
      eventId: e.eventNumber,
      url: `${API}/events/${e.eventNumber}`,
      clubSeason: `${seasonYear}-${String((seasonYear + 1) % 100).padStart(2, '0')}`,
      teams: n,
    });
    console.log(`${e.eventNumber} ${e.name}: ${n} teams 14U-17U`);
  }

  const teams = [];
  let read = 0;
  for (const { event, team } of [...latest.values()].sort((a, b) => a.team.teamNumber - b.team.teamNumber)) {
    const url = `${API}/events/${event.eventNumber}/teams/${team.teamNumber}/roster`;
    const roster = await getJson(url);
    read += 1;
    let tooYoung = 0;
    const players = [];
    for (const entry of roster.entries ?? []) {
      const p = entry.player ?? {};
      const gradYear = Number.isInteger(p.graduationYear) ? p.graduationYear : null;
      if (gradYear !== null && (gradYear < FIRST_CLASS || gradYear > LAST_CLASS)) {
        tooYoung += 1;
        continue;
      }
      const firstName = String(p.firstName ?? '').trim();
      const lastName = String(p.lastName ?? '').trim();
      if (firstName === '' && lastName === '') continue;
      const positions = (p.positions ?? []).map((x) => x.charAt(0) + x.slice(1).toLowerCase()).join(', ');
      players.push({ firstName, lastName, gradYear, position: positions === '' ? null : positions, playerType: null });
    }
    teams.push({
      league: `passport-${event.eventNumber}`,
      division: team.division,
      teamId: team.teamNumber,
      teamName: team.name,
      clubId: Number(team.program?.programNumber ?? 0),
      clubName: team.program?.name ?? team.name,
      url,
      hidden: 0,
      tooYoung,
      players,
    });
    if (read % 50 === 0) console.log(`${read}/${latest.size} rosters read`);
  }
  const used = new Set(teams.map((t) => t.league));
  const file = {
    builtBy:
      'pnpm fetch-club-rosters:basketball (scripts/fetch-club-rosters-passport.mjs): the public boys club team rosters of the Northern California events on The Passport (G365, The Stage, Breakthrough, Strictly Hoops, For the Love of the Game) and of the programs clubs.json has a record for at the adidas 3SSB sessions. clubSlugs is kept by hand and carried over.',
    fetchedAt: new Date().toISOString(),
    season: SEASON,
    notes: [
      'A kept copy of the public boys club basketball team rosters on The Passport, so a high school roster can be compared with them (pnpm compare-club-rosters:basketball). Never rendered: it names players who are on no tracked roster.',
      'A Passport roster gives each player\'s name, positions, height and class year, and no school. A team is read at the latest event it played (its roster as it stood then); the events are listed in leagues[], each with the club season it is for (the spring and summer 2026 events are the 2025-26 club season, the fall events the 2026-27 season).',
      `Kept per player: name, positions, class year. Not kept: jerseys, heights, photos, ids, coaches, and players outside the classes of ${FIRST_CLASS}-${LAST_CLASS} (counted in tooYoung). Read ${today}.`,
    ],
    leagues: leagues.filter((l) => used.has(l.id)).map((l) => ({ id: l.id, name: l.name, eventId: l.eventId, url: l.url, clubSeason: l.clubSeason })),
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
  console.log(JSON.stringify(file.counts));
  if (!DRY_RUN) writeFileSync(OUT, `${JSON.stringify(file, null, 1)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

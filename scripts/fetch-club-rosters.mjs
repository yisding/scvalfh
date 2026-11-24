#!/usr/bin/env node
/**
 * Keep a copy of the public team rosters of the three Northern California girls leagues ECNL runs, so the
 * high school rosters can be compared with them whenever a school posts one (`pnpm compare-club-rosters`):
 *
 *   ECNL Girls Northern Cal              https://app.athleteone.com/public/event/4267/schedules-standings
 *   ECNL Regional League, NorCal         https://app.athleteone.com/public/event/4307/schedules-standings
 *   ECNL Regional League, Golden State   https://app.athleteone.com/public/event/4300/schedules-standings
 *     (the ECNL Northern Cal clubs' second teams; no public page links it: found 2026-11-24 by reading the
 *     names of Athlete One events 4250-4300 through the public page, with the owner's approval)
 *
 *   pnpm fetch-club-rosters             rewrite data/soccer/club-rosters.json
 *   pnpm fetch-club-rosters --dry-run   fetch and count, write nothing
 *
 * The leagues' schedule site is a script-drawn page whose data answers only the page itself (a plain
 * request gets 403), so this drives a local headless Chromium over the DevTools protocol: it opens
 * each league's public Schedules & Standings page and reads, through the page, what the page itself
 * loads for a division's standings and for each team's page (whose "Roster" button lists the players).
 * No dependency: Node's own WebSocket and the Chromium at $CHROME_BIN (default /usr/bin/chromium).
 * One request at a time, a pause after each.
 *
 * What is kept: per team, its league, age group, name, club and public page; per player, her name,
 * position, the class year the page's data carries and the roster's label for her ("First Team
 * Player", "Club Player Pool"). What is not: staff (the data carries their phones and emails), jersey
 * numbers, account ids, a player the team has hidden from its public roster, and any player too
 * young to be in high school this season (a class year after `YOUNGEST_CLASS`, or none on a team
 * below GU15); each team records how many were left out. The file is never rendered: it names
 * players who are on no tracked roster (README, "Club rosters").
 *
 * `clubSlugs` (the leagues' club id → the club's slug in data/soccer/clubs.json) is hand-kept in the
 * file and carried over on every run; a club with no entry is compared but never linked.
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'soccer', 'club-rosters.json');
const CHROME = process.env.CHROME_BIN ?? '/usr/bin/chromium';
const DRY_RUN = process.argv.includes('--dry-run');

/** The season the file is for, and the youngest class in high school during it. */
const SEASON = '26-27';
const YOUNGEST_CLASS = 2030;
const OLDEST_CLASS = 2026;

const LEAGUES = [
  { id: 'ecnl', eventId: 4267 },
  { id: 'ecnl-rl', eventId: 4307 },
  { id: 'ecnl-rl-golden-state', eventId: 4300 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- a minimal DevTools client

async function launch() {
  const profile = mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'club-rosters-chrome-'));
  const child = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      // Chromium refuses to start as root (a container) without it.
      ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
      `--user-data-dir=${profile}`,
      '--remote-debugging-port=0',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i += 1) await sleep(200);
  if (!existsSync(portFile)) throw new Error(`${CHROME} did not start (set CHROME_BIN)`);
  const port = readFileSync(portFile, 'utf8').split('\n')[0];
  const exited = new Promise((resolve) => child.once('exit', resolve));
  /** Stops Chromium and, once it has exited (it writes to its profile until then), removes the profile. */
  const close = async () => {
    child.kill();
    await exited;
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  return { port, close };
}

async function openPage(port, url) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${url}`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let next = 0;
  const waiting = new Map();
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    const w = waiting.get(msg.id);
    if (!w) return;
    waiting.delete(msg.id);
    if (msg.error) w.reject(new Error(msg.error.message));
    else w.resolve(msg.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      next += 1;
      waiting.set(next, { resolve, reject });
      ws.send(JSON.stringify({ id: next, method, params }));
    });
  /** Runs `fn(...args)` in the page and returns what it resolves to. */
  const evaluate = async (fn, ...args) => {
    const r = await send('Runtime.evaluate', {
      expression: `(${fn})(...${JSON.stringify(args)})`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { evaluate, close: () => ws.close() };
}

// ---------------------------------------------------------------- what runs in the page

/** One GET of the data the page itself loads; `null` when it answers anything but 200. */
const pageGet = async (pathname) => {
  const r = await fetch(`https://api.athleteone.com/api/${pathname}`);
  if (!r.ok) return { error: r.status };
  return { data: (await r.json()).data };
};

/** Waits (up to two minutes) until the league page has loaded and drawn itself. */
async function loaded(page) {
  for (let i = 0; i < 60; i += 1) {
    await sleep(2000);
    const ready = await page
      .evaluate(() => location.hostname === 'app.athleteone.com' && document.readyState === 'complete' && (document.body?.innerText ?? '').includes('Schedules'))
      .catch(() => false);
    if (ready) return;
  }
  throw new Error('the league page did not load');
}

async function get(page, pathname) {
  const r = await page.evaluate(pageGet, pathname);
  await sleep(300);
  if (r.error) throw new Error(`${pathname}: HTTP ${r.error}`);
  return r.data;
}

// ---------------------------------------------------------------- the run

const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

/** Whether a roster row is kept: a player who can be in high school this season. */
function kept(player, ageGroup) {
  const year = player.gradYear || null;
  if (year !== null) return year >= OLDEST_CLASS && year <= YOUNGEST_CLASS;
  return ageGroup >= 15;
}

async function fetchLeague(page, league) {
  const details = await get(page, `team/get-event-details-by-eventID/${league.eventId}`);
  const name = clean(details.eventName ?? details.name);
  if (!name) throw new Error(`event ${league.eventId}: no name`);
  const divisions = (await get(page, `Event/get-event-schedule-or-standings-athleteone/${league.eventId}`)).girlsDivAndFlightList;
  const teams = [];
  for (const division of divisions) {
    const ageGroup = Number(/U(\d+)/.exec(division.divisionName)?.[1]);
    if (!(ageGroup >= 14)) continue; // GU13 and below: nobody of high school age
    for (const flight of division.flightList) {
      const standings = await get(page, `Event/get-standings-by-div-and-flight/${division.divisionID}/${flight.flightID}/${league.eventId}`);
      const teamIds = [...new Set(standings.flatMap((group) => (group.teamStandings ?? []).map((row) => row.teamID)))];
      if (teamIds.length !== flight.teamsCount) {
        console.warn(`${name} ${division.divisionName}: the standings list ${teamIds.length} teams, the division says ${flight.teamsCount}`);
      }
      for (const teamId of teamIds) {
        const team = await get(page, `Event/get-individual-event-team-info/${league.eventId}/${teamId}`);
        const info = team.teamStandingInfo ?? {};
        const all = team.playerList ?? [];
        const shown = all.filter((p) => !p.hideFromPublicTeamRoster);
        const players = shown
          .filter((p) => kept(p, ageGroup))
          .map((p) => ({
            firstName: clean(p.firstName),
            lastName: clean(p.lastName),
            gradYear: p.gradYear || null,
            position: clean(p.position) || null,
            playerType: clean(p.playerType) || null,
          }))
          .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'en') || (a.gradYear ?? 0) - (b.gradYear ?? 0));
        teams.push({
          league: league.id,
          division: division.divisionName,
          teamId,
          teamName: clean(info.teamName),
          clubId: info.clubID,
          clubName: clean(info.clubName),
          url: `https://app.athleteone.com/public/event/${league.eventId}/schedules-standings/team/${teamId}/${flight.flightID}`,
          hidden: all.length - shown.length,
          tooYoung: shown.length - players.length,
          players,
        });
      }
      console.log(`${name} ${division.divisionName}: ${teamIds.length} teams`);
    }
  }
  return {
    league: { id: league.id, name, eventId: league.eventId, url: `https://app.athleteone.com/public/event/${league.eventId}/schedules-standings` },
    teams,
  };
}

async function main() {
  const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
  const browser = await launch();
  try {
    const leagues = [];
    const teams = [];
    for (const league of LEAGUES) {
      const page = await openPage(browser.port, `https://app.athleteone.com/public/event/${league.eventId}/schedules-standings`);
      await loaded(page); // its data host answers the loaded page only
      const got = await fetchLeague(page, league);
      page.close();
      leagues.push(got.league);
      teams.push(...got.teams);
    }
    const fetchedAt = new Date().toISOString();
    const file = {
      builtBy:
        'pnpm fetch-club-rosters (scripts/fetch-club-rosters.mjs): the public team rosters of ECNL Girls Northern Cal and of ECNL Regional League Girls NorCal and Golden State, read through each league\'s own Schedules & Standings page in a local Chromium. clubSlugs is kept by hand.',
      fetchedAt,
      season: SEASON,
      notes: previous?.notes ?? [],
      leagues,
      clubSlugs: previous?.clubSlugs ?? {},
      counts: {
        teams: teams.length,
        players: teams.reduce((n, t) => n + t.players.length, 0),
        hidden: teams.reduce((n, t) => n + t.hidden, 0),
        tooYoung: teams.reduce((n, t) => n + t.tooYoung, 0),
        emptyTeams: teams.filter((t) => t.players.length === 0 && t.tooYoung === 0).length,
      },
      teams,
    };
    console.log(JSON.stringify(file.counts));
    if (!DRY_RUN) {
      writeFileSync(OUT, `${JSON.stringify(file, null, 1)}\n`);
      console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * The JV rosters: data/jv-rosters.json (MaxPreps' JV roster pages, `pnpm fetch-rosters --level jv`),
 * data/jv-rosters-school-sites.json (the schools' own JV lists, transcribed), lib/jv/jv-rosters.ts
 * (which list a school gets, less its varsity players) and the team page's JV roster section
 * (components/jv/jv-roster-view.ts, TeamJvRoster).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import TeamJvRoster from '../components/jv/TeamJvRoster';
import { buildTeamJvRosterView } from '../components/jv/jv-roster-view';
import { JvSiteRostersFileSchema, getJvRoster, getJvRostersFile, getJvSiteRostersFile } from '../lib/jv/jv-rosters';
import { getEnrichedTeamRoster } from '../lib/players/rosters';
import { ROSTER_TEAM_COUNT, RostersSchema } from '../lib/players/rosters-schema';
import { JV_SPORT_SEASON_ID, SPORT_SEASON_ID } from '../lib/season';
import { jvRosterUrl, parseRosterPage } from '../lib/sources/maxpreps-roster';
import { TEAMS, getTeamBySlug } from '../lib/teams';
import { REPO } from './helpers';
import { textOf } from './ui/html-text';

const read = (name: string): unknown => JSON.parse(readFileSync(path.join(REPO, 'data', name), 'utf8'));

describe('data/jv-rosters.json', () => {
  const file = RostersSchema.parse(read('jv-rosters.json'));

  it('holds one MaxPreps JV roster entry per registry school, each read from its JV roster page', () => {
    expect(file.teams).toHaveLength(ROSTER_TEAM_COUNT);
    for (const t of file.teams) {
      expect(t.rosterUrl, t.slug).toBe(jvRosterUrl(getTeamBySlug(t.slug)!));
      expect(t.rosterUrl, t.slug).toMatch(/\/field-hockey\/jv\/roster\/$/);
    }
    expect(file.source.notes.join(' ')).toMatch(/JV roster page on MaxPreps/);
    expect(getJvRostersFile().counts).toEqual(file.counts);
  });
});

describe('parseRosterPage: the sport season a page must be for', () => {
  /** The smallest page parseRosterPage accepts: no players, MaxPreps' JV season id. */
  const page = (sportSeasonId: string) =>
    `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          countData: { teamId: 't-1', sportSeasonId, athleteCount: 0, staffCount: 2 },
          athleteData: [],
        },
      },
    })}</script><table><thead><tr><th>#</th><th>Player</th><th>Grade</th><th>Position</th><th>Height</th></tr></thead><tbody></tbody></table>`;

  it('reads a JV page with the JV season id, and refuses it as a varsity page', () => {
    expect(parseRosterPage(page(JV_SPORT_SEASON_ID), { sportSeasonId: JV_SPORT_SEASON_ID }).players).toEqual([]);
    expect(() => parseRosterPage(page(JV_SPORT_SEASON_ID))).toThrow(/expected e302eb3e/);
    expect(() => parseRosterPage(page(SPORT_SEASON_ID), { sportSeasonId: JV_SPORT_SEASON_ID })).toThrow(
      new RegExp(`expected ${JV_SPORT_SEASON_ID}`),
    );
  });
});

describe('data/jv-rosters-school-sites.json', () => {
  const file = JvSiteRostersFileSchema.parse(read('jv-rosters-school-sites.json'));

  it('validates, one entry per school, each list this season’s and dated', () => {
    expect(getJvSiteRostersFile()).toEqual(file);
    expect(file.teams.length).toBeGreaterThan(0);
    for (const t of file.teams) {
      expect(t.season, t.slug).toBe('2026-27');
      expect(t.seasonEvidence.length, t.slug).toBeGreaterThan(30);
      expect(t.checkedOn <= file.capturedAt, t.slug).toBe(true);
    }
  });

  it('never guesses: names are re-cased only out of all-lower-case or all-capitals', () => {
    for (const t of file.teams) {
      for (const p of t.players) {
        expect(p.name, t.slug).not.toBe(p.name.toLowerCase());
        expect(p.name, t.slug).not.toBe(p.name.toUpperCase());
      }
    }
  });
});

describe('getJvRoster: which list a school gets', () => {
  const sites = new Set(getJvSiteRostersFile().teams.map((t) => t.slug));
  const maxpreps = new Map(getJvRostersFile().teams.map((t) => [t.slug, t]));

  it('the fuller list, less varsity players, where both sources have one (the school’s on a tie); else the one there is', () => {
    for (const t of TEAMS) {
      const roster = getJvRoster(t.slug);
      const mp = maxpreps.get(t.slug)!;
      const hasSite = sites.has(t.slug);
      const hasMp = mp.players.length > 0;
      if (!hasSite && !hasMp) {
        expect(roster, t.slug).toBeNull();
        continue;
      }
      expect(roster, t.slug).not.toBeNull();
      if (hasSite && hasMp) {
        expect(roster!.other, t.slug).not.toBeNull();
        expect(roster!.players.length, t.slug).toBeGreaterThanOrEqual(roster!.other!.count);
        if (roster!.players.length === roster!.other!.count) expect(roster!.source, t.slug).toBe('school-site');
      } else {
        expect(roster!.other, t.slug).toBeNull();
        expect(roster!.source, t.slug).toBe(hasSite ? 'school-site' : 'maxpreps');
      }
      if (roster!.source === 'maxpreps') expect(roster!.url, t.slug).toBe(mp.rosterUrl);
    }
    // Los Gatos' MaxPreps JV page lists one player (its varsity page carries the program); its site's list is shown.
    expect(getJvRoster('los-gatos')).toMatchObject({ source: 'school-site', other: { source: 'maxpreps' } });
  });

  it('leaves out every player on the varsity roster the page shows, and counts them', () => {
    for (const t of TEAMS) {
      const roster = getJvRoster(t.slug);
      if (!roster) continue;
      const varsity = (getEnrichedTeamRoster(t.slug)?.players ?? []).filter((p) => p.level !== 'jv');
      const names = new Set(varsity.map((p) => p.fullName.toLowerCase()));
      for (const p of roster.players) expect(names.has(p.name.toLowerCase()), `${t.slug}: ${p.name}`).toBe(false);
      const listed =
        roster.source === 'school-site'
          ? getJvSiteRostersFile().teams.find((s) => s.slug === t.slug)!.players.length
          : maxpreps.get(t.slug)!.players.length;
      expect(roster.players.length + roster.onVarsity, t.slug).toBe(listed);
    }
    // Marin Academy's MaxPreps JV page carries its whole program: its 18 varsity players are left out.
    expect(getJvRoster('marin-academy')).toMatchObject({ source: 'maxpreps', onVarsity: 18 });
  });

  it('York, which plays Santa Catalina’s JV slot, has no list on either source, so Santa Catalina has none', () => {
    expect(getJvRoster('santa-catalina')).toBeNull();
  });
});

describe('the team page’s JV roster section', () => {
  it('is built for exactly the schools some source lists JV players for', () => {
    for (const t of TEAMS) {
      expect(buildTeamJvRosterView(t.slug) === null, t.slug).toBe(getJvRoster(t.slug) === null);
    }
  });

  it('prints only facts the source gives, in the site’s words', () => {
    for (const t of TEAMS) {
      const view = buildTeamJvRosterView(t.slug);
      if (!view) continue;
      for (const row of view.rows) {
        for (const fact of row.facts) {
          // A position MaxPreps' code list does not know ("SW") is printed as entered, as on the varsity roster.
          expect(fact, `${t.slug}: ${row.name}`).toMatch(/^(Freshman|Sophomore|Junior|Senior|Grade \d+|\d'\d{1,2}"|[A-Z][A-Za-z]*( \/ [A-Z][A-Za-z]*)*)$/);
          expect(fact).not.toMatch(/null|undefined/);
        }
      }
    }
    // Saint Francis' page says "Defense/Midfield": the varsity roster's words for it.
    const sf = buildTeamJvRosterView('saint-francis')!;
    expect(sf.rows.some((r) => r.facts.includes('Defense / Midfield'))).toBe(true);
  });

  it('names its source and date, and counts the players left out for the varsity roster', () => {
    const ma = textOf(renderToStaticMarkup(createElement(TeamJvRoster, { view: buildTeamJvRosterView('marin-academy')! })));
    expect(ma).toMatch(/What the coach entered on MaxPreps’ JV roster as of \w{3} \w{3} \d+\./);
    expect(ma).toMatch(/18 more players on MaxPreps’ JV roster are on the varsity roster above and are not repeated here\./);

    const sf = textOf(renderToStaticMarkup(createElement(TeamJvRoster, { view: buildTeamJvRosterView('saint-francis')! })));
    expect(sf).toMatch(/Saint Francis’s own JV list on sfhsathletics\.com, as read Nov 6, 2026\./);

    // Palo Alto: MaxPreps' list is the fuller one; the school's is named with its count.
    const paly = textOf(renderToStaticMarkup(createElement(TeamJvRoster, { view: buildTeamJvRosterView('palo-alto')! })));
    expect(paly).toMatch(/The other list we found, the JV list on palyathletics\.com.*, has \d+; the fuller list is shown\./);
    expect(sf).toMatch(/sfhsathletics\.com JV roster/);
  });

  it('says so, in place of the grid, when every player listed is on the varsity roster', () => {
    const allVarsity = TEAMS.map((t) => buildTeamJvRosterView(t.slug)).find((v) => v && v.rows.length === 0 && v.onVarsity > 0);
    if (!allVarsity) return;
    const text = textOf(renderToStaticMarkup(createElement(TeamJvRoster, { view: allVarsity })));
    expect(text).toMatch(/is on the varsity roster above, so none is repeated here\./);
  });
});

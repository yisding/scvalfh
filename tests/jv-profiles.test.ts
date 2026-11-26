/**
 * The JV players' recruiting pages: filed by person in data/player-accounts.json, shown on the team page's JV list
 * through lib/jv/jv-profiles.ts (which finds each JV row's person by name, data/field-hockey/player-index.json), the
 * profile links on the team page's JV roster (components/jv/jv-roster-view.ts, TeamJvRoster) and the JV rows on
 * /recruiting.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import TeamJvRoster from '../components/jv/TeamJvRoster';
import { buildTeamJvRosterView } from '../components/jv/jv-roster-view';
import { buildRecruitingView } from '../components/recruiting/recruiting-view';
import { getJvPlayerProfiles, getJvProfilesFile } from '../lib/jv/jv-profiles';
import { getJvRoster, nameKey } from '../lib/jv/jv-rosters';
import { readAccountsFile } from '../lib/players/registry-file';
import { classOf, getEnrichedTeamRoster, getRosterEnrichment } from '../lib/players/rosters';
import type { TeamSlug } from '../lib/types';
import { REPO } from './helpers';
import { textOf } from './ui/html-text';

const file = getJvProfilesFile();
const accounts = readAccountsFile(REPO)!;
/** Every JV list row with a profile, as the site shows it. */
const entries = file.teams.flatMap((t) => t.players.map((p) => ({ slug: t.slug, ...p })));
/** Each page field hockey's JV round linked, with its maintainers' note. */
const jvRoundNote = new Map(
  accounts.players.flatMap((p) =>
    p.accounts.filter((a) => a.linkedBy.some((r) => r.build === 'field-hockey' && r.list === 'jv')).map((a) => [a.url, a.note] as const),
  ),
);
/** The JV rows as field hockey's JV round linked them: its pages only, each with its note. */
const fileEntries = entries
  .map((e) => ({ ...e, profiles: e.profiles.filter((x) => jvRoundNote.has(x.url)).map((x) => ({ ...x, note: jvRoundNote.get(x.url) ?? null })) }))
  .filter((e) => e.profiles.length > 0);

describe('the JV lists\u2019 recruiting pages', () => {
  it('carry the JV round\u2019s own record', () => {
    expect(file.capturedAt).toBe(accounts.jvResearch['field-hockey']?.capturedAt);
    expect(file.season).toBe(getRosterEnrichment().season);
    expect(file.notes.join(' ')).toMatch(/SportsRecruits/);
  });

  it('show on a player on the JV list the team page shows, never a varsity player', () => {
    for (const e of entries) {
      const roster = getJvRoster(e.slug);
      expect(roster, e.slug).not.toBeNull();
      expect(roster!.players.some((p) => nameKey(p.name) === nameKey(e.name)), `${e.slug}: ${e.name}`).toBe(true);
      const varsity = (getEnrichedTeamRoster(e.slug)?.players ?? []).filter((p) => p.level !== 'jv').map((p) => nameKey(p.fullName));
      expect(varsity, `${e.slug}: ${e.name}`).not.toContain(nameKey(e.name));
      expect(getJvPlayerProfiles(e.slug, e.name)).toEqual(e.profiles);
    }
  });

  it('show a JV-marked MaxPreps row\u2019s pages on the JV list (Los Gatos, whose MaxPreps list is the whole program)', () => {
    const marked = (getEnrichedTeamRoster('los-gatos')?.players ?? []).filter((p) => p.level === 'jv' && p.profiles.length > 0);
    expect(marked.length).toBeGreaterThan(0);
    for (const p of marked) {
      const urls = getJvPlayerProfiles('los-gatos', p.sourceName ?? p.fullName).map((x) => x.url);
      for (const x of p.profiles.filter((y) => y.platform !== 'maxpreps')) expect(urls, p.fullName).toContain(x.url);
    }
  });

  it('agree with the JV list\u2019s grade wherever a page states a class year, and link no MaxPreps page', () => {
    for (const e of entries) {
      const grade = getJvRoster(e.slug)!.players.find((p) => nameKey(p.name) === nameKey(e.name))!.grade;
      for (const x of e.profiles) {
        expect(x.platform, `${e.slug}: ${e.name}`).not.toBe('maxpreps');
        if (x.classOf === null || grade === null) continue;
        expect(x.classOf, `${e.slug}: ${e.name}`).toBe(classOf(file.season, grade));
      }
    }
  });

  it('link no page twice', () => {
    const urls = entries.flatMap((e) => e.profiles.map((x) => x.url));
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('hold what the 2026-11-06 research found: 33 SportsRecruits pages from the address probe and one NCSA page', () => {
    const all = fileEntries.flatMap((e) => e.profiles.map((x) => ({ e, x })));
    const probe = all.filter(({ x }) => x.note?.includes('Found by the 2026-11-06 address probe'));
    // 33 pages for 33 players at 13 schools when found; on 2026-11-13 six of those players joined their varsity
    // rosters (Berkeley, Leland, Marin Catholic twice, Saint Francis, Westview), so their pages moved to their
    // varsity rows: 27 here, at 11 schools.
    expect(probe).toHaveLength(27);
    expect(new Set(probe.map(({ e }) => `${e.slug} ${e.name}`)).size).toBe(27);
    expect(probe.every(({ x }) => x.platform === 'sportsrecruits' && x.classOf !== null)).toBe(true);
    expect(probe.filter(({ x }) => x.sport === 'lacrosse')).toHaveLength(26);
    expect(probe.filter(({ x }) => x.sport === undefined).map(({ e }) => e.name)).toEqual(['Jayla Gerrard']);
    expect(all.filter(({ x }) => x.platform === 'ncsa').map(({ e }) => e.name)).toEqual(['Katie Todd']);
    // The probe's 27 pages are at 11 schools; Scripps Ranch, the twelfth, is here for Katie Todd's NCSA page.
    expect(new Set(probe.map(({ e }) => e.slug)).size).toBe(11);
    const by1106 = fileEntries.filter((e) => e.profiles.some((x) => !x.note?.includes('Found by the 2026-11-13')));
    expect(by1106).toHaveLength(28);
    expect(new Set(by1106.map((e) => e.slug)).size).toBe(12);
    // Where a player had more than one live page, the one the rule kept is linked, not the other.
    const url = (slug: string, name: string) => getJvPlayerProfiles(slug as TeamSlug, name).map((x) => x.url);
    expect(url('saint-francis', "Aoife O'Connor")).toEqual(['https://iwlca.sportsrecruits.com/athlete/aoife_oconnor2']);
    expect(url('st-ignatius', 'Mika Nejasmich')).toEqual(['https://iwlca.sportsrecruits.com/athlete/mika_nejasmich3']);
    expect(url('st-ignatius', 'Simone Stiefel')).toEqual(['https://iwlca.sportsrecruits.com/athlete/simone_stiefel2']);
    expect(url('lick-wilmerding', 'Mira Mathus')).toEqual(['https://iwlca.sportsrecruits.com/athlete/mira_mathus']);
    expect(url('st-ignatius', 'Luciana Bennett')).toEqual(['https://iwlca.sportsrecruits.com/athlete/luciana_bennett']);
  });

  it('hold what the 2026-11-13 Hudl sweep found: seven JV players\u2019 Hudl pages at three schools', () => {
    const found = fileEntries.flatMap((e) => e.profiles.filter((x) => x.note?.includes('Found by the 2026-11-13 Hudl team-roster sweep')).map((x) => ({ e, x })));
    // An eighth, Berkeley's Sage Murphy, joined the varsity roster the same day: her page is on her varsity row.
    expect(found.map(({ e }) => `${e.slug} ${e.name}`).sort()).toEqual([
      'bonita Agatha Sosa',
      'bonita Peyton Moronez',
      'great-oak London Harvey',
      'harvard-westlake Grace Eisner',
      'harvard-westlake Isabella Park',
      'harvard-westlake Karina Ferrie',
      'harvard-westlake Katiya Chen',
    ]);
    expect(found.every(({ x }) => x.platform === 'hudl' && x.sport === undefined)).toBe(true);
    // 35 JV players with a page of the JV round at 15 schools.
    expect(fileEntries).toHaveLength(35);
    expect(new Set(fileEntries.map((e) => e.slug)).size).toBe(15);
    expect(file.capturedAt).toBe('2026-11-13');
  });
});

describe('the profile links on the team page’s JV roster', () => {
  it('give each listed JV player their links, in the varsity roster’s words, and explain them', () => {
    const slugs = [...new Set(entries.map((e) => e.slug))];
    for (const slug of slugs) {
      const view = buildTeamJvRosterView(slug)!;
      for (const e of entries.filter((x) => x.slug === slug)) {
        const row = view.rows.find((r) => nameKey(r.name) === nameKey(e.name))!;
        expect(row.profiles.map((p) => p.url).sort(), `${slug}: ${e.name}`).toEqual(e.profiles.map((p) => p.url).sort());
        for (const p of row.profiles) expect(p.label).toMatch(/^(NCSA|SportsRecruits|FieldLevel|Hudl|Captain U|MAX Field Hockey)( [a-z &]+)? profile$|recruiting site$/i);
      }
      expect(view.profilePlatforms.length, slug).toBeGreaterThan(0);
      const text = textOf(renderToStaticMarkup(createElement(TeamJvRoster, { view })));
      expect(text).toMatch(/Profile links go to JV players’ own recruiting pages on .+, each matched to a player here/);
      expect(text).toMatch(/recall is partial/);
      const first = entries.find((x) => x.slug === slug)!;
      expect(text).toContain(`${first.name}’s `);
    }
  });

  it('are absent, and unexplained, on a JV roster with none', () => {
    const linked = new Set(entries.map((e) => e.slug));
    const bare = ['saint-francis', 'palo-alto', 'marin-academy'].find((s) => !linked.has(s as TeamSlug)) as TeamSlug | undefined;
    if (!bare) return;
    const view = buildTeamJvRosterView(bare)!;
    expect(view.rows.every((r) => r.profiles.length === 0)).toBe(true);
    expect(textOf(renderToStaticMarkup(createElement(TeamJvRoster, { view })))).not.toMatch(/Profile links/);
  });
});

describe('/recruiting’s JV rows', () => {
  const view = buildRecruitingView();
  const rows = view.regions.flatMap((r) => r.leagues.flatMap((l) => l.schools.flatMap((s) => s.rows.map((row) => ({ slug: s.slug, row })))));

  it('list every JV player with a profile or a club line, after the school’s varsity rows, with "JV" leading the facts and no commitment', () => {
    const jv = rows.filter((r) => r.row.jv);
    // A JV row is listed for its profile links, or for its club line alone (data/<sport>/clubs.json jvAffiliations).
    const withProfile = jv.filter((r) => r.row.profiles.length > 0);
    expect(withProfile.length).toBe(entries.length);
    expect(jv.filter((r) => r.row.profiles.length === 0).every((r) => r.row.clubs.length > 0)).toBe(true);
    expect(view.counts.jvWithProfile).toBe(jv.length);
    expect(view.counts.jvWithClub).toBe(jv.filter((r) => r.row.clubs.length > 0).length);
    for (const { slug, row } of jv) {
      expect(row.facts[0]).toBe('JV');
      expect(row.commitment).toBeNull();
      expect(row.profiles.length + row.clubs.length).toBeGreaterThan(0);
      const school = rows.filter((r) => r.slug === slug).map((r) => r.row.jv);
      expect(school.indexOf(true), slug).toBe(school.length - school.filter(Boolean).length);
    }
    if (jv.length > 0) {
      expect(view.lede).toMatch(
        view.counts.jvWithClub
          ? /and every JV player with a recruiting profile or a youth club, school by school\./
          : /and every JV player with a recruiting profile, school by school\./,
      );
    }
  });
});

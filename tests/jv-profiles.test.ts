/**
 * The JV players' recruiting pages: data/jv-profiles.json, lib/jv/jv-profiles.ts (which joins each
 * entry to the team page's JV list by name), the profile links on the team page's JV roster
 * (components/jv/jv-roster-view.ts, TeamJvRoster) and the JV rows on /recruiting.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import TeamJvRoster from '../components/jv/TeamJvRoster';
import { buildTeamJvRosterView } from '../components/jv/jv-roster-view';
import { buildRecruitingView } from '../components/recruiting/recruiting-view';
import { JvProfilesFileSchema, getJvPlayerProfiles, getJvProfilesFile } from '../lib/jv/jv-profiles';
import { getJvRoster, nameKey } from '../lib/jv/jv-rosters';
import { classOf, getEnrichedTeamRoster, getRosterEnrichment } from '../lib/players/rosters';
import type { TeamSlug } from '../lib/types';
import { REPO } from './helpers';
import { textOf } from './ui/html-text';

const file = JvProfilesFileSchema.parse(
  JSON.parse(readFileSync(path.join(REPO, 'data', 'jv-profiles.json'), 'utf8')) as unknown,
);
const entries = file.teams.flatMap((t) => t.players.map((p) => ({ slug: t.slug as TeamSlug, ...p })));

describe('data/jv-profiles.json', () => {
  it('validates, and is the file the site reads', () => {
    expect(getJvProfilesFile()).toEqual(file);
    expect(file.season).toBe(getRosterEnrichment().season);
    expect(file.notes.join(' ')).toMatch(/SportsRecruits/);
  });

  it('joins every entry to a player on the JV list the team page shows, never a varsity player', () => {
    for (const e of entries) {
      const roster = getJvRoster(e.slug);
      expect(roster, e.slug).not.toBeNull();
      expect(roster!.players.some((p) => nameKey(p.name) === nameKey(e.name)), `${e.slug}: ${e.name}`).toBe(true);
      const varsity = (getEnrichedTeamRoster(e.slug)?.players ?? []).map((p) => nameKey(p.fullName));
      expect(varsity, `${e.slug}: ${e.name}`).not.toContain(nameKey(e.name));
      expect(getJvPlayerProfiles(e.slug, e.name)).toEqual(e.profiles);
    }
  });

  it('agrees with the JV list’s grade wherever a profile states a class year', () => {
    for (const e of entries) {
      const grade = getJvRoster(e.slug)!.players.find((p) => nameKey(p.name) === nameKey(e.name))!.grade;
      for (const x of e.profiles) {
        if (x.classOf === null) continue;
        if (grade === null) expect(x.classOf, `${e.slug}: ${e.name}`).toBeGreaterThanOrEqual(2027);
        else expect(x.classOf, `${e.slug}: ${e.name}`).toBe(classOf(file.season, grade));
      }
    }
  });

  it('links no page that the varsity overlay links, and none twice', () => {
    const varsity = new Set(
      getRosterEnrichment().teams.flatMap((t) => t.players.flatMap((p) => p.profiles.map((x) => x.url))),
    );
    const urls = entries.flatMap((e) => e.profiles.map((x) => x.url));
    expect(new Set(urls).size).toBe(urls.length);
    for (const u of urls) expect(varsity.has(u), u).toBe(false);
  });

  it('refuses a claimed-MaxPreps profile, two profiles on one platform in one sport, and a player listed twice', () => {
    const profile = (over: object) => ({ platform: 'sportsrecruits', url: 'https://nfhca.sportsrecruits.com/athlete/a_b', classOf: 2029, note: null, ...over });
    const one = (players: unknown[]) => ({ ...file, teams: [{ slug: 'st-ignatius', players }] });
    expect(JvProfilesFileSchema.safeParse(one([{ name: 'A B', profiles: [profile({})] }])).success).toBe(true);
    expect(
      JvProfilesFileSchema.safeParse(one([{ name: 'A B', profiles: [profile({ platform: 'maxpreps', url: 'https://www.maxpreps.com/x' })] }])).success,
    ).toBe(false);
    expect(
      JvProfilesFileSchema.safeParse(one([{ name: 'A B', profiles: [profile({}), profile({ url: 'https://nfhca.sportsrecruits.com/athlete/a_b1' })] }])).success,
    ).toBe(false);
    expect(
      JvProfilesFileSchema.safeParse(
        one([
          { name: 'A B', profiles: [profile({})] },
          { name: 'a  b', profiles: [profile({ url: 'https://nfhca.sportsrecruits.com/athlete/a_b2' })] },
        ]),
      ).success,
    ).toBe(false);
    expect(JvProfilesFileSchema.safeParse(one([{ name: 'A B', profiles: [] }])).success).toBe(false);
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
        for (const p of row.profiles) expect(p.label).toMatch(/^(NCSA|SportsRecruits|FieldLevel|Hudl|Captain U)( [a-z &]+)? profile$|recruiting site$/i);
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

  it('list every JV player with a profile, after the school’s varsity rows, with "JV" leading the facts and profile links only', () => {
    const jv = rows.filter((r) => r.row.jv);
    expect(jv.length).toBe(entries.length);
    expect(view.counts.jvWithProfile).toBe(entries.length);
    for (const { slug, row } of jv) {
      expect(row.facts[0]).toBe('JV');
      expect(row.commitment).toBeNull();
      expect(row.clubs).toEqual([]);
      expect(row.profiles.length).toBeGreaterThan(0);
      const school = rows.filter((r) => r.slug === slug).map((r) => r.row.jv);
      expect(school.indexOf(true), slug).toBe(school.length - school.filter(Boolean).length);
    }
    if (entries.length > 0) expect(view.lede).toMatch(/and every JV player with a recruiting profile, school by school\./);
  });
});

/**
 * `components/recruiting/recruiting-view.ts` and /recruiting over the committed data files
 * (DESIGN §25): the page that gathers every school's recruiting profiles, clubs and commitments.
 *
 * The page makes promises a test can hold it to:
 *   - the same rows as the team pages: every listed player is a row of that school's roster view
 *     with at least one of the three lines, and every such row is listed, under its own school;
 *   - no school drops out: each registry team is listed, or named as having nothing found, or as
 *     having no roster to match against, exactly once;
 *   - regions: each region's leagues sit in that region's `data-region-scope` block, under the switcher;
 *   - privacy: nothing data/clubs.json or data/commits.json keeps but never renders reaches the
 *     page, and the metadata names no player;
 *   - links in: the team rosters with a listed player link their school's block, and /teams, /clubs
 *     and /commits link the page.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import ClubsPage from '../../app/clubs/page';
import CommitsPage from '../../app/commits/page';
import RecruitingPage, { metadata } from '../../app/recruiting/page';
import TeamPage from '../../app/teams/[slug]/page';
import TeamsPage from '../../app/teams/page';
import { buildRecruitingView, ledeWords, regionSummary, schoolMeta } from '../../components/recruiting/recruiting-view';
import { buildRosterView } from '../../components/teams/roster-view';
import { getClubsFile } from '../../lib/clubs';
import { getCommitsFile } from '../../lib/commits';
import { getTeamsGrouped } from '../../lib/data';
import { TEAMS } from '../../lib/teams';
import { affiliationLeaks, commitmentLeaks } from '../../scripts/copy-rules';
import { PUBLIC_TERMS } from '../../scripts/public-terms';
import { textOf } from './html-text';

const view = buildRecruitingView();
const html = renderToStaticMarkup(createElement(RecruitingPage));
const headings = (h: string) => [...h.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));

async function renderTeam(slug: string): Promise<string> {
  return renderToStaticMarkup(await TeamPage({ params: Promise.resolve({ slug }) } as never));
}

const listed = (r: { commitment: unknown; clubs: unknown[]; profiles: unknown[] }) =>
  r.commitment !== null || r.clubs.length > 0 || r.profiles.length > 0;

describe('buildRecruitingView', () => {
  const leagues = view.regions.flatMap((r) => r.leagues);
  const schools = leagues.flatMap((l) => l.schools);

  it('lists each school’s roster rows that have a profile, a club or a commitment, in roster order', () => {
    for (const s of schools) {
      const roster = buildRosterView(s.slug)!;
      expect(
        s.rows.map((r) => r.key),
        s.slug,
      ).toEqual(roster.rows.filter(listed).map((r) => r.key));
      for (const row of s.rows) {
        const rosterRow = roster.rows.find((r) => r.key === row.key)!;
        expect(row.commitment, `${s.slug} / ${row.name}`).toEqual(rosterRow.commitment);
        expect(row.clubs).toEqual(rosterRow.clubs);
        expect(row.profiles).toEqual(rosterRow.profiles);
        expect(row.facts).toEqual(rosterRow.facts.map((f) => f.text));
      }
      expect(s.href).toBe(`/teams/${s.slug}#roster`);
    }
  });

  it('accounts for every registry team exactly once, in its own region and league', () => {
    const seen = leagues.flatMap((l) => [...l.schools, ...l.nothingFound, ...l.noRoster].map((s) => s.slug));
    expect([...seen].sort()).toEqual(TEAMS.map((t) => t.slug).sort());
    for (const region of view.regions) {
      // Section by section, as /teams groups them (the Southern Section's independents before the San Diego Section).
      expect(region.leagues.map((l) => l.id)).toEqual(
        getTeamsGrouped(region.id).flatMap((g) => g.leagues.map((l) => l.league.id)),
      );
    }
    for (const l of leagues) {
      for (const s of l.nothingFound) expect(buildRosterView(s.slug)!.rows.length, s.slug).toBeGreaterThan(0);
      for (const s of l.noRoster) expect(buildRosterView(s.slug)!.rows.length, s.slug).toBe(0);
    }
  });

  it('counts what the files hold: every commitment, and every player tied to a club on a varsity row', () => {
    const rows = schools.flatMap((s) => s.rows);
    expect(view.counts.players).toBe(rows.length);
    expect(view.counts.schools).toBe(schools.length);
    expect(view.counts.committed).toBe(getCommitsFile().commitments.length);
    expect(view.counts.withClub).toBe(
      new Set(getClubsFile().affiliations.map((a) => `${a.teamSlug} ${a.athleteId}`)).size,
    );
    expect(view.counts.withProfile).toBe(rows.filter((r) => r.profiles.length > 0).length);
  });

  it('words the counts', () => {
    expect(schoolMeta([])).toBe('0 players');
    expect(ledeWords(3, { players: 0, schools: 0, committed: 0, withClub: 0, withProfile: 0 })).toBe(
      'Every player on this site’s 3 varsity rosters with a recruiting profile, a youth club or a college commitment that a public page shows, school by school. No public page we found shows one for a player here yet.',
    );
    expect(ledeWords(3, { players: 1, schools: 1, committed: 1, withClub: 0, withProfile: 1 })).toBe(
      'Every player on this site’s 3 varsity rosters with a recruiting profile, a youth club or a college commitment that a public page shows, school by school. 1 player from 1 school is listed: 1 has committed to a college and 1 has a recruiting profile.',
    );
    expect(regionSummary('Northern California', { players: 5, schools: 2, committed: 0, withClub: 2, withProfile: 4 }, 49)).toBe(
      'Northern California: 5 players at 2 of the 49 schools. Of them, 2 are tied to a club and 4 have a recruiting profile.',
    );
  });
});

describe('/recruiting, rendered', () => {
  it('has one h1, skips no heading level, and ends with how the page is built', () => {
    const levels = headings(html);
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    expect(html.lastIndexOf('<section')).toBe(html.indexOf('<section aria-labelledby="how-matched"'));
  });

  it('gives every id once, and puts each region’s leagues in its own scope block, NorCal first', () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    expect(html.indexOf('data-region-scope="norcal"')).toBeLessThan(html.indexOf('data-region-scope="socal"'));
    for (const region of view.regions) {
      const start = html.indexOf(`<div id="${region.id}" data-region-scope="${region.id}">`);
      expect(start, region.id).toBeGreaterThan(-1);
      for (const l of region.leagues) {
        const at = html.indexOf(`id="${l.id}"`);
        expect(at, l.id).toBeGreaterThan(start);
        for (const s of l.schools) expect(html.indexOf(`id="${s.id}"`), s.slug).toBeGreaterThan(at);
      }
    }
    // The switcher, before the first region block.
    expect(html.indexOf('NorCal')).toBeLessThan(html.indexOf('data-region-scope="norcal"'));
  });

  it('shows every listed player’s lines, linking /commits and /clubs, and no quote or basis', () => {
    for (const s of view.regions.flatMap((r) => r.leagues).flatMap((l) => l.schools)) {
      for (const row of s.rows) {
        if (row.commitment) expect(html).toContain(`href="${row.commitment.college.href}"`);
        for (const g of row.clubs) for (const c of g.clubs) expect(html).toContain(`href="${c.href}"`);
        for (const p of row.profiles) expect(html).toContain(`href="${p.url.replace(/&/g, '&amp;')}"`);
      }
    }
    expect(affiliationLeaks(html, getClubsFile(), { publicTerms: PUBLIC_TERMS })).toEqual([]);
    expect(commitmentLeaks(html, getCommitsFile(), { publicTerms: PUBLIC_TERMS })).toEqual([]);
  });

  it('names no player in its metadata', () => {
    const meta = `${String(metadata.title)} ${String(metadata.description)}`;
    expect(meta).toContain('Unofficial and incomplete.');
    for (const s of view.regions.flatMap((r) => r.leagues).flatMap((l) => l.schools)) {
      for (const row of s.rows) expect(meta).not.toContain(row.name);
    }
  });
});

describe('the pages that link /recruiting', () => {
  it('a team page with a listed player links its school’s block; one with none does not', async () => {
    const schools = view.regions.flatMap((r) => r.leagues).flatMap((l) => l.schools);
    const withRows = schools[0];
    expect(await renderTeam(withRows.slug)).toContain(`href="/recruiting#${withRows.slug}"`);
    const without = view.regions.flatMap((r) => r.leagues).flatMap((l) => [...l.nothingFound, ...l.noRoster])[0];
    expect(await renderTeam(without.slug)).not.toContain('href="/recruiting');
  });

  it('/teams, /clubs and /commits link it', () => {
    for (const page of [TeamsPage, ClubsPage, CommitsPage]) {
      expect(renderToStaticMarkup(createElement(page))).toContain('href="/recruiting"');
    }
    expect(textOf(renderToStaticMarkup(createElement(TeamsPage)))).toContain(
      'Recruiting: the recruiting page gathers every school’s recruiting profiles, clubs and commitments in one place.',
    );
  });
});

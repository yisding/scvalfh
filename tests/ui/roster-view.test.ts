/**
 * `components/teams/roster-view.ts` and `TeamRoster` — the team page's roster section, over the
 * committed data/rosters.json + data/rosters-enrichment.json.
 *
 * The section makes three promises a test can hold it to: it is varsity only, a blank is never
 * filled with a guess, and every value that did not come from MaxPreps is marked and sourced.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import TeamRoster from '../../components/teams/TeamRoster';
import { buildRosterView } from '../../components/teams/roster-view';
import { getEnrichedTeamRoster } from '../../lib/rosters';
import { TEAMS } from '../../lib/teams';

const views = TEAMS.map((t) => ({ slug: t.slug, view: buildRosterView(t.slug)! }));

describe('buildRosterView', () => {
  it('builds a view for every team in the registry', () => {
    for (const { slug, view } of views) expect(view, slug).toBeDefined();
  });

  it('lists every MaxPreps row except the ones a school source marks JV', () => {
    for (const { slug, view } of views) {
      const merged = getEnrichedTeamRoster(slug)!;
      const varsity = merged.players.filter((p) => p.level !== 'jv');
      expect(view.rows.map((r) => r.name).sort(), slug).toEqual(varsity.map((p) => p.fullName).sort());
      expect(view.jvLeftOut, slug).toBe(merged.players.length - varsity.length);
    }
    // Los Gatos' MaxPreps page is the whole program; the school site splits it.
    const losGatos = views.find((v) => v.slug === 'los-gatos')!.view;
    expect(losGatos.jvLeftOut).toBeGreaterThan(0);
    expect(losGatos.rows.length).toBeLessThan(getEnrichedTeamRoster('los-gatos')!.players.length);
  });

  it('prints only facts somebody published, in words', () => {
    for (const { slug, view } of views) {
      const merged = new Map(getEnrichedTeamRoster(slug)!.players.map((p) => [p.fullName, p]));
      for (const row of view.rows) {
        const p = merged.get(row.name)!;
        const expected = (p.grade !== null ? 1 : 0) + (p.positions.length ? 1 : 0) + (p.height !== null ? 1 : 0);
        expect(row.facts.length, `${slug} / ${row.name}`).toBe(expected);
        expect(row.jersey?.text ?? null, `${slug} / ${row.name}`).toBe(p.jersey);
        for (const f of row.facts) {
          expect(f.text, `${slug} / ${row.name}`).not.toMatch(/^(null|undefined|)$/);
          // Position codes are spelled out; the raw MaxPreps letters never reach the page.
          expect(f.text, `${slug} / ${row.name}`).not.toMatch(/^[FMDG]( \/ [FMDG])*$/);
        }
      }
    }
  });

  it('marks exactly the values that came from somewhere other than MaxPreps', () => {
    for (const { slug, view } of views) {
      const merged = new Map(getEnrichedTeamRoster(slug)!.players.map((p) => [p.fullName, p]));
      for (const row of view.rows) {
        const p = merged.get(row.name)!;
        const grade = row.facts.find((f) => /^(Freshman|Sophomore|Junior|Senior)$/.test(f.text));
        if (grade) expect(grade.elsewhere, `${slug} / ${row.name}`).toBe(p.provenance.grade !== 'maxpreps');
        if (row.jersey) expect(row.jersey.elsewhere, `${slug} / ${row.name}`).toBe(p.provenance.jersey !== 'maxpreps');
      }
      expect(view.hasElsewhere, slug).toBe(
        view.rows.some((r) => r.jersey?.elsewhere || r.facts.some((f) => f.elsewhere)),
      );
    }
    // Saint Francis is MaxPreps-complete; Cupertino's grades all come from the school site.
    expect(views.find((v) => v.slug === 'saint-francis')!.view.hasElsewhere).toBe(false);
    expect(views.find((v) => v.slug === 'cupertino')!.view.hasElsewhere).toBe(true);
  });

  it('drops the number column only when no listed player has a number', () => {
    for (const { slug, view } of views) {
      expect(view.showNumbers, slug).toBe(view.rows.some((r) => r.jersey !== null));
    }
  });

  it('publishes every recorded disagreement, in the list’s own words', () => {
    for (const { slug, view } of views) {
      const merged = getEnrichedTeamRoster(slug)!;
      const expected = merged.players
        .filter((p) => p.level !== 'jv')
        .reduce((n, p) => n + p.conflicts.length, 0);
      expect(view.conflicts.length, slug).toBe(expected);
    }
    const monta = views.find((v) => v.slug === 'monta-vista')!.view;
    expect(monta.conflicts.length).toBeGreaterThan(0);
    expect(monta.conflicts.every((c) => c.field === 'number')).toBe(true);
    const saratoga = views.find((v) => v.slug === 'saratoga')!.view.conflicts;
    expect(saratoga.map((c) => [c.field, c.shown, c.other])).toEqual([['grade', 'junior', 'sophomore']]);
  });

  it('leads the sources with the MaxPreps roster and lists each page once, under its own label', () => {
    for (const { slug, view } of views) {
      expect(view.sources[0], slug).toEqual({ label: 'MaxPreps roster', url: getEnrichedTeamRoster(slug)!.rosterUrl });
      const urls = view.sources.map((s) => s.url);
      const labels = view.sources.map((s) => s.label);
      expect(new Set(urls).size, slug).toBe(urls.length);
      expect(new Set(labels).size, slug).toBe(labels.length);
      for (const s of view.sources) expect(s.url, slug).toMatch(/^https?:\/\//);
    }
  });

  it('links the page behind every value it marks †, MaxPreps career and JV pages included', () => {
    for (const { slug, view } of views) {
      const merged = getEnrichedTeamRoster(slug)!;
      const linked = new Set(view.sources.map((s) => s.url));
      const hosts = new Set(view.sources.map((s) => new URL(s.url).hostname));
      for (const p of merged.players.filter((x) => x.level !== 'jv')) {
        for (const tag of Object.values(p.provenance)) {
          if (tag === null || tag === 'maxpreps') continue;
          // Either the exact page, or (for a run of per-player profiles) that site's roster page.
          const reachable = linked.has(tag.source) || hosts.has(new URL(tag.source).hostname);
          expect(reachable, `${slug} / ${p.fullName}: ${tag.source}`).toBe(true);
          if (tag.kind.startsWith('maxpreps-')) {
            expect(linked.has(tag.source), `${slug} / ${p.fullName}: ${tag.source}`).toBe(true);
          }
        }
      }
      for (const c of merged.coaches) expect(linked.has(c.source), `${slug} coach ${c.name}`).toBe(true);
    }
    // The grades the review caught going unsourced: Los Altos' career-page grades, Homestead's JV one.
    const labels = (slug: string) => views.find((v) => v.slug === slug)!.view.sources.map((s) => s.label);
    expect(labels('los-altos').filter((l) => l.startsWith('MaxPreps career:')).length).toBeGreaterThan(0);
    expect(labels('homestead')).toContain('MaxPreps JV roster: grade');
    // Saratoga's 20 player profiles fold into its school roster page rather than 20 links.
    expect(labels('saratoga')).toContain('shs-athletics.com: grades (player pages)');
  });

  it("links each listed player's own recruiting pages, and names the platforms once", () => {
    for (const { slug, view } of views) {
      const merged = new Map(getEnrichedTeamRoster(slug)!.players.map((p) => [p.fullName, p]));
      for (const row of view.rows) {
        const p = merged.get(row.name)!;
        expect(row.profiles.map((x) => x.url).sort(), `${slug} / ${row.name}`).toEqual(
          p.profiles.map((x) => x.url).sort(),
        );
        for (const x of row.profiles) expect(x.label, `${slug} / ${row.name}`).toMatch(/profile$|^Recruiting site$/);
      }
      expect(view.profilePlatforms.length > 0, slug).toBe(view.rows.some((r) => r.profiles.length > 0));
      expect(new Set(view.profilePlatforms).size, slug).toBe(view.profilePlatforms.length);
      // A profile is not a source of a listed value: it never joins the Sources row.
      const sources = new Set(view.sources.map((s) => s.url));
      for (const row of view.rows) for (const x of row.profiles) expect(sources.has(x.url), slug).toBe(false);
    }
  });
});

describe('TeamRoster', () => {
  it('renders every row, a † only where a value came from elsewhere, and no raw nulls', () => {
    for (const { slug, view } of views) {
      const html = renderToStaticMarkup(createElement(TeamRoster, { view }));
      for (const row of view.rows) {
        expect(html, `${slug} / ${row.name}`).toContain(row.name.replace(/&/g, '&amp;').replace(/'/g, '&#x27;'));
      }
      expect(html.includes('†'), slug).toBe(view.hasElsewhere);
      expect(html, slug).not.toMatch(/>(null|undefined)</);
      expect((html.match(/<li/g) ?? []).length, slug).toBeGreaterThanOrEqual(view.rows.length);
    }
  });

  it('renders a profile as an off-site link named for the player, and explains the links once', () => {
    const base = views.find((v) => v.slug === 'saint-francis')!.view;
    const [first, second, ...rest] = base.rows;
    const view = {
      ...base,
      rows: [
        { ...first, profiles: [{ label: 'NCSA profile', url: 'https://www.ncsasports.org/x/one' }] },
        { ...second, facts: [], profiles: [{ label: 'Recruiting site', url: 'https://example.com/two' }] },
        ...rest.map((r) => ({ ...r, profiles: [] })),
      ],
      profilePlatforms: ['NCSA', 'personal sites'],
    };
    const html = renderToStaticMarkup(createElement(TeamRoster, { view }));
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/'/g, '&#x27;');
    expect(html).toMatch(
      /<a href="https:\/\/www\.ncsasports\.org\/x\/one" target="_blank" rel="noopener noreferrer"[^>]*>/,
    );
    expect(html).toContain(`<span class="sr-only">${esc(first.name)}’s </span>NCSA profile`);
    // A row with no facts still gets its meta line, holding just the link.
    expect(html).toContain(`<span class="sr-only">${esc(second.name)}’s </span>Recruiting site`);
    expect(html).toContain('own recruiting pages on NCSA and personal sites,');
    expect(html.match(/own recruiting pages/g)?.length).toBe(1);

    const none = renderToStaticMarkup(
      createElement(TeamRoster, { view: { ...view, rows: view.rows.map((r) => ({ ...r, profiles: [] })), profilePlatforms: [] } }),
    );
    expect(none).not.toContain('own recruiting pages');
    expect(none).not.toContain('ncsasports.org');
  });

  it('shows a stated empty state, not an empty card, when a team has no rows', () => {
    const base = views[0].view;
    const html = renderToStaticMarkup(
      createElement(TeamRoster, { view: { ...base, status: 'empty', rows: [], conflicts: [], coaches: [] } }),
    );
    expect(html).toContain(`MaxPreps lists no players for ${base.teamName}.`);
    expect(html).not.toContain('<ul class="sx-card');
  });
});

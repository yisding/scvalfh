/**
 * `components/teams/roster-view.ts` and `TeamRoster` — the team page's roster section, over the
 * committed data/rosters.json + data/rosters-enrichment.json.
 *
 * The section makes three promises a test can hold it to: it is varsity only, a blank is never
 * filled with a guess, and every value that did not come from MaxPreps is marked and sourced. A
 * fourth is the club line (DESIGN §17.4): a club a source only lists is never worded as current,
 * and every club line links that club's page on this site, which cites the sources.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import TeamRoster from '../../components/teams/TeamRoster';
import { buildRosterView, seasonPage } from '../../components/teams/roster-view';
import { getPlayerClubs } from '../../lib/clubs';
import { LEAGUE_IDS } from '../../lib/leagues';
import { getEnrichedTeamRoster } from '../../lib/rosters';
import { TEAMS, teamsInLeague } from '../../lib/teams';
import { textOf } from './html-text';

/** Rosters cover every registry team, all five leagues: 49 views. */
const views = TEAMS.map((t) => ({ slug: t.slug, view: buildRosterView(t.slug)! }));

describe('buildRosterView', () => {
  it('builds a view for every team of every league, and null only for a slug that is no team', () => {
    expect(views).toHaveLength(49);
    for (const { slug, view } of views) expect(view, slug).toBeTruthy();
    for (const id of LEAGUE_IDS) {
      for (const t of teamsInLeague(id)) expect(buildRosterView(t.slug), `${id} / ${t.slug}`).not.toBeNull();
    }
    expect(buildRosterView('not-a-school' as never)).toBeNull();
  });

  it('says what each team\'s list is: its players, MaxPreps listing none, a failed read, or not covered yet', () => {
    for (const { slug, view } of views) {
      const merged = getEnrichedTeamRoster(slug)!;
      expect(view.status, slug).toBe(merged.status);
      if (view.status === 'error' || view.status === 'pending' || view.status === 'empty') expect(view.rows, slug).toEqual([]);
      if (view.status === 'pending') expect(view.asOf, slug).toBeNull();
    }
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

  it('names a MaxPreps roster page of an earlier season by what it is, never as a career page', () => {
    expect(seasonPage('https://www.maxpreps.com/ca/larkspur/redwood-giants/field-hockey/25-26/roster/')?.label).toBe('2025-26 roster');
    expect(seasonPage('https://www.maxpreps.com/ca/san-jose/leland-chargers/field-hockey/jv/25-26/roster/')?.label).toBe(
      '2025-26 JV roster',
    );
    expect(seasonPage('https://www.maxpreps.com/ca/cupertino/homestead-mustangs/field-hockey/jv/roster/')).toBeNull();
    expect(seasonPage('https://www.maxpreps.com/ca/x/y/athletes/z/?careerid=abc')).toBeNull();
    for (const { slug, view } of views) {
      for (const s of view.sources) {
        if (seasonPage(s.url)) expect(s.label, `${slug} ${s.url}`).toMatch(/^MaxPreps 20\d\d-\d\d (JV )?roster: /);
      }
    }
    const redwood = views.find((v) => v.slug === 'redwood')!.view.sources.map((s) => s.label);
    expect(redwood).toContain('MaxPreps 2025-26 roster: grades');
    expect(redwood.some((l) => l.startsWith('MaxPreps career') && l.includes('Pipitone'))).toBe(false);
  });

  it('says what an earlier season’s roster shows and what that grade means now', () => {
    const redwood = views.find((v) => v.slug === 'redwood')!.view.conflicts;
    const tonderys = redwood.filter((c) => c.name === 'Eloise Tonderys');
    expect(tonderys.map((c) => [c.shown, c.other, c.now, c.sourceLabel])).toEqual([
      [null, 'junior', null, 'a news story'],
      [null, 'freshman', 'sophomore', "MaxPreps' 2025-26 roster"],
    ]);
    const leland = views.find((v) => v.slug === 'leland')!.view.conflicts;
    expect(leland.find((c) => c.name === 'Michaela Reichmuth' && c.now)).toMatchObject({
      other: 'sophomore',
      now: 'junior',
      sourceLabel: "MaxPreps' 2025-26 JV roster",
    });
    // A career page shows a class year, not this grade: the line says the grade was worked out.
    const alejandrino = views.find((v) => v.slug === 'berkeley')!.view.conflicts.find((c) => c.derived)!;
    expect(alejandrino).toMatchObject({ name: 'Anisa Alejandrino', other: 'senior', now: null });
    const html = renderToStaticMarkup(createElement(TeamRoster, { view: views.find((v) => v.slug === 'redwood')!.view }));
    expect(html.replace(/<!-- -->/g, '')).toMatch(/freshman on <a [^>]*>MaxPreps’ 2025-26 roster|freshman on <a [^>]*>MaxPreps&#x27; 2025-26 roster/);
    expect(html.replace(/<!-- -->/g, '')).toContain(', so sophomore now.');
  });

  it('calls news a news story, never a school paper (BenitoLink is local news)', () => {
    for (const { slug, view } of views) {
      const html = renderToStaticMarkup(createElement(TeamRoster, { view }));
      expect(html, slug).not.toContain('school paper');
    }
    const hollister = views.find((v) => v.slug === 'hollister')!.view;
    expect(hollister.conflicts.map((c) => c.sourceLabel)).toEqual(['a news story']);
    expect(hollister.elsewhereSources).toEqual(['a news story']);
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
    const platforms = (slug: string) => views.find((v) => v.slug === slug)!.view.profilePlatforms;
    expect(platforms('los-gatos')).toEqual(['NCSA', 'SportsRecruits']);
    expect(platforms('saratoga')).toEqual(['Hudl']);
    expect(platforms('valley-christian')).toEqual([]);
    // The EAL (recruiting pages swept 2026-10-04): footnote platforms in NCSA, SportsRecruits, Hudl order.
    expect(platforms('chico')).toEqual(['NCSA', 'SportsRecruits', 'Hudl']);
    expect(platforms('davis')).toEqual(['NCSA', 'SportsRecruits']);
    expect(platforms('lassen')).toEqual(['NCSA']);
    expect(platforms('pleasant-valley')).toEqual(['NCSA', 'Hudl']);
    expect(platforms('bella-vista')).toEqual([]);
    expect(platforms('corning')).toEqual([]);
    const eal = (slug: string) => views.find((v) => v.slug === slug)!.view.rows;
    expect(eal('chico').filter((r) => r.profiles.length > 0).length).toBe(13);
    expect(eal('davis').filter((r) => r.profiles.length > 0).length).toBe(4);
    expect(eal('pleasant-valley').filter((r) => r.profiles.length > 0).length).toBe(11);
    expect(eal('lassen').filter((r) => r.profiles.length > 0).length).toBe(1);
    expect(eal('chico').find((r) => r.name === 'Olivia Council')!.profiles.map((x) => x.label)).toEqual([
      'NCSA profile',
      'SportsRecruits profile',
      'Hudl profile',
    ]);
    // NCSA first on a row that has both.
    const lizzie = views.find((v) => v.slug === 'los-gatos')!.view.rows.find((r) => r.name === 'Lizzie Moorehouse')!;
    expect(lizzie.profiles.map((x) => x.label)).toEqual(['NCSA profile', 'SportsRecruits profile']);
  });

  it('shows no profile from a JV row, which the list leaves out', () => {
    const lg = getEnrichedTeamRoster('los-gatos')!;
    const jvWithProfile = lg.players.filter((p) => p.level === 'jv' && p.profiles.length > 0);
    expect(jvWithProfile.length).toBeGreaterThan(0);
    const shown = new Set(views.find((v) => v.slug === 'los-gatos')!.view.rows.flatMap((r) => r.profiles.map((x) => x.url)));
    for (const p of jvWithProfile) for (const x of p.profiles) expect(shown.has(x.url), p.fullName).toBe(false);
  });
});

describe('buildRosterView: club lines (DESIGN §17.4)', () => {
  const rowOf = (slug: string, name: string) => views.find((v) => v.slug === slug)!.view.rows.find((r) => r.name === name)!;
  const pairs = (slug: string, name: string) => rowOf(slug, name).clubs.map((g) => [g.label, g.clubs.map((c) => c.name)]);

  it('gives every row exactly its player’s clubs: current, then listed, then earlier', () => {
    let tied = 0;
    for (const { slug, view } of views) {
      const merged = getEnrichedTeamRoster(slug)!.players.filter((p) => p.level !== 'jv');
      for (const row of view.rows) {
        const p = merged.find((x) => (x.athleteId ?? `${x.fullName}`) === row.key || x.fullName === row.name)!;
        const ties = p.athleteId === null ? [] : getPlayerClubs(slug, p.athleteId);
        const shown = row.clubs.flatMap((g) => g.clubs.map((c) => `${g.status} ${c.slug}`));
        expect(shown.sort(), `${slug} / ${row.name}`).toEqual(ties.map((a) => `${a.status} ${a.club}`).sort());
        expect(row.clubs.map((g) => g.status), `${slug} / ${row.name}`).toEqual(
          (['current', 'unknown', 'past'] as const).filter((s) => ties.some((a) => a.status === s)),
        );
        for (const g of row.clubs) {
          const many = g.clubs.length > 1;
          const words = { current: ['Club', 'Clubs'], unknown: ['Listed club', 'Listed clubs'], past: ['Earlier club', 'Earlier clubs'] }[g.status];
          expect(g.label, `${slug} / ${row.name}`).toBe(words[many ? 1 : 0]);
          expect(g.srLabel, `${slug} / ${row.name}`).toBe(g.label.toLowerCase());
          for (const c of g.clubs) expect(c.href).toBe(`/clubs/${c.slug}`);
        }
        if (row.clubs.length > 0) tied += 1;
      }
      expect(view.hasClubs, slug).toBe(view.rows.some((r) => r.clubs.length > 0));
      expect(view.hasListedClub, slug).toBe(view.rows.some((r) => r.clubs.some((g) => g.status === 'unknown')));
      // A club page is not a source of a listed value: it never joins the Sources row.
      for (const s of view.sources) expect(s.url, slug).not.toMatch(/^\/clubs/);
    }
    expect(tied).toBe(80);
  });

  it('words the pinned rows', () => {
    expect(pairs('saint-francis', 'Melanie Henderson')).toEqual([
      ['Club', ['NorCal Impact']],
      ['Earlier clubs', ['Fly FHC', 'Lightning']],
    ]);
    expect(pairs('los-altos', 'Riya Mehrotra')).toEqual([['Listed club', ['Fly FHC']]]);
    expect(pairs('homestead', 'Gabrielle Moll')).toEqual([['Listed club', ['Fly FHC']]]);
    expect(pairs('st-ignatius', 'Storey Lewis')).toEqual([['Club', ['SF Hawks']]]);
    expect(pairs('davis', 'Kira Kelly')).toEqual([['Club', ['NorCal Impact']], ['Listed club', ['D-City']]]);
    expect(pairs('davis', 'Amelia Zedonis')).toEqual([['Club', ['NorCal Impact']], ['Listed club', ['D-City']]]);
    expect(pairs('davis', 'Kate Loscutoff')).toEqual([['Club', ['NorCal Impact']], ['Earlier club', ['D-City']]]);
    expect(pairs('pleasant-valley', 'Lilah Letcher')).toEqual([['Club', ['Chico Hotshots']]]);
    expect(pairs('pleasant-valley', 'Kate Panighetti')).toEqual([['Club', ['Chico Hotshots']]]);
    expect(pairs('gilroy', 'Hailey Moncada')).toEqual([
      ['Club', ['HTC']],
      ['Earlier club', ['Infinity']],
    ]);
    expect(rowOf('valley-christian', views.find((v) => v.slug === 'valley-christian')!.view.rows[0].name).clubs).toEqual([]);
  });
});

describe('TeamRoster', () => {
  it('renders every row, a † only where a value came from elsewhere, and no raw nulls', () => {
    for (const { slug, view } of views) {
      const html = renderToStaticMarkup(createElement(TeamRoster, { view }));
      for (const row of view.rows) {
        expect(html, `${slug} / ${row.name}`).toContain(row.name.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;'));
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
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    expect(html).toMatch(
      /<a href="https:\/\/www\.ncsasports\.org\/x\/one" target="_blank" rel="noopener noreferrer"[^>]*>/,
    );
    // One wrapper span, so `.sx-action`'s inline-flex cannot trim the space before the label.
    expect(html).toContain(`<span><span class="sr-only">${esc(first.name)}’s </span>NCSA profile</span>`);
    // A row with no facts still gets its line of links.
    expect(html).toContain(`<span><span class="sr-only">${esc(second.name)}’s </span>Recruiting site</span>`);
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
      createElement(TeamRoster, {
        view: {
          ...base,
          status: 'empty',
          rows: [],
          conflicts: [],
          coaches: [],
          otherRosters: { status: 'none', checkedOn: '2026-10-03', note: 'looked' },
        },
      }),
    );
    expect(html).toContain(`MaxPreps lists no players for ${base.teamName}.`);
    expect(html).toContain('No other public source we checked has a current roster either.');
    expect(html).not.toContain('<ul class="sx-card');
  });

  it('says only what the file records about other sources: none, a partial list, or not checked', () => {
    for (const { slug, view } of views) {
      expect(view.otherRosters, slug).toEqual(getEnrichedTeamRoster(slug)!.otherRosters);
    }
    // Every team MaxPreps lists nobody for says what other sources showed, or that none were checked;
    // none is left to a default.
    const empty = views.filter((v) => v.view.status === 'empty').map((v) => [v.slug, v.view.otherRosters.status]);
    expect(empty).toEqual([
      ['del-mar', 'none'],
      ['silver-creek', 'none'],
      ['sobrato', 'none'],
      ['monterey', 'none'],
      ['santa-catalina', 'none'],
      ['marin-academy', 'partial'],
      // An EAL team with no MaxPreps players: no school-athletics sweep has been done, and the card says so.
      ['corning', 'not-checked'],
    ]);
    for (const { slug, view } of views.filter((v) => v.view.status === 'empty')) {
      const html = renderToStaticMarkup(createElement(TeamRoster, { view }));
      expect(html.includes('No other public source we checked'), slug).toBe(view.otherRosters.status === 'none');
    }
    // Marin Academy's school page lists 18 current players as first name + last initial: not "none".
    const ma = views.find((v) => v.slug === 'marin-academy')!.view;
    const maHtml = renderToStaticMarkup(createElement(TeamRoster, { view: ma })).replace(/<!-- -->/g, '');
    expect(maHtml).toContain('lists 18 current players');
    expect(maHtml).toContain('href="https://www.ma.org/athletics/athletic-teams/team-details/~athletics-team-id/175"');

    const base = views[0].view;
    const unchecked = renderToStaticMarkup(
      createElement(TeamRoster, {
        view: { ...base, status: 'empty', rows: [], conflicts: [], coaches: [], otherRosters: { status: 'not-checked' } },
      }),
    );
    expect(unchecked).toContain('We have not checked other public sources for this team.');
    expect(unchecked).not.toContain('No other public source we checked');
  });

  it('shows the coaches and their sources for a team with no list', () => {
    for (const slug of ['del-mar', 'marin-academy', 'silver-creek', 'sobrato']) {
      const view = views.find((v) => v.slug === slug)!.view;
      expect(view.rows, slug).toEqual([]);
      expect(view.coaches.length, slug).toBeGreaterThan(0);
      const html = renderToStaticMarkup(createElement(TeamRoster, { view }));
      for (const c of view.coaches) expect(html, `${slug} ${c.name}`).toContain(c.name);
      expect(html, slug).toContain('Sources');
      for (const c of getEnrichedTeamRoster(slug)!.coaches) expect(html, `${slug} ${c.source}`).toContain(`href="${c.source}"`);
    }
  });

  it('says a pending list will appear once a run collects it, not "after the next one"', () => {
    const base = views[0].view;
    const html = renderToStaticMarkup(
      createElement(TeamRoster, { view: { ...base, status: 'pending', rows: [], conflicts: [], coaches: [], asOf: null } }),
    );
    expect(html).toContain('It will appear once a run collects it.');
    expect(html).not.toContain('after the next one');
  });

  it('says a team no update has covered yet is not collected, and never that MaxPreps lists nobody', () => {
    const base = views[0].view;
    const html = renderToStaticMarkup(
      createElement(TeamRoster, {
        view: { ...base, status: 'pending', rows: [], conflicts: [], coaches: [], asOf: null },
      }),
    );
    expect(html).toContain(`${base.teamName}&#x27;s roster has not been collected yet.`);
    expect(html).not.toContain('MaxPreps lists no players');
    expect(html).not.toContain('could not be read');
    // Every pending team in the committed file renders the same way.
    for (const { slug, view } of views.filter((v) => v.view.status === 'pending')) {
      const out = renderToStaticMarkup(createElement(TeamRoster, { view }));
      expect(out, slug).toContain('has not been collected yet');
      expect(out, slug).not.toMatch(/>(null|undefined)</);
    }
  });
});

describe('TeamRoster: commitment lines', () => {
  // A synthetic row on a real view: the line's markup is what is under test, and no real player is
  // named as committed anywhere data/commits.json does not say so.
  const si = views.find((v) => v.slug === 'st-ignatius')!.view;
  const committedRow = (status: 'committed' | 'signed', college = 'Example', sport: string | null = null) => ({
    ...si.rows[0],
    key: 'pat-example',
    name: 'Pat Example',
    commitment: {
      status,
      label: status === 'signed' ? ('Signed' as const) : ('Committed' as const),
      srLabel: `college ${sport === null ? '' : `${sport} `}${status === 'signed' ? 'signing' : 'commitment'}`,
      college: { slug: 'example-college', name: college, href: '/commits#st-ignatius-pat-example' },
      sport,
    },
  });
  const withLine = (row: ReturnType<typeof committedRow>) =>
    renderToStaticMarkup(
      createElement(TeamRoster, { view: { ...si, rows: [row, ...si.rows.slice(1)], hasCommitments: true } }),
    );

  it('links the player’s row on /commits, named for the player, right under the facts and above the club line', () => {
    const html = withLine(committedRow('committed'));
    expect(html).toContain('href="/commits#st-ignatius-pat-example"');
    expect(html).toContain('<span><span class="sr-only">Pat Example’s college commitment: </span>Example</span>');
    expect(html).toContain('<span aria-hidden="true" class="text-ink-3">Committed:</span>');
    const row = /<li[^>]*>(?:(?!<\/li>)[\s\S])*?Pat Example(?:(?!<\/li>)[\s\S])*<\/li>/.exec(html)![0];
    const at = row.indexOf('/commits#');
    if (row.includes('/clubs/')) expect(at).toBeLessThan(row.indexOf('/clubs/'));
    if (row.includes('target="_blank"')) expect(at).toBeLessThan(row.indexOf('target="_blank"'));
    // Internal: no arrow, no new tab; and not nowrap, since an official college name must wrap.
    const a = /<a[^>]*href="\/commits#st-ignatius-pat-example"[^>]*>/.exec(html)![0];
    expect(a).not.toContain('target=');
    expect(a).not.toContain('whitespace-nowrap');
  });

  it('names a sport other than field hockey after the college, and in the link’s name', () => {
    const html = withLine(committedRow('committed', 'Example', 'soccer'));
    expect(html).toContain(
      '<span><span class="sr-only">Pat Example’s college soccer commitment: </span>Example<span aria-hidden="true"> (soccer)</span></span>',
    );
    expect(withLine(committedRow('committed'))).not.toContain('(field hockey)');
  });

  it('says "Signed" only for a signed commitment', () => {
    const html = withLine(committedRow('signed'));
    expect(html).toContain('<span aria-hidden="true" class="text-ink-3">Signed:</span>');
    expect(html).toContain('<span class="sr-only">Pat Example’s college signing: </span>');
  });

  it('explains commitment lines once where there are any, linking /commits, and never elsewhere', () => {
    const footnote = 'Commitment lines link to the player’s entry on the';
    const count = (html: string, s: string) => html.split(s).length - 1;
    const html = withLine(committedRow('committed'));
    expect(count(html, footnote)).toBe(1);
    expect(textOf(html)).toContain(
      `Commitment lines link to the player’s entry on the college commitments page, which cites a source for each one; “Signed” appears only where a source says so. They were checked by hand on ${si.commitsCheckedOn} and are not part of the twice-daily update. Recall is partial: a player with no commitment line may still have committed.`,
    );
    expect(html).toContain('href="/commits"');
    for (const { slug, view } of views) {
      expect(count(renderToStaticMarkup(createElement(TeamRoster, { view })), footnote), slug).toBe(view.hasCommitments ? 1 : 0);
    }
  });
});

describe('TeamRoster: club lines', () => {
  const si = views.find((v) => v.slug === 'st-ignatius')!.view;

  it('links the club’s page, named for the player, between the facts and the profile links', () => {
    const html = renderToStaticMarkup(createElement(TeamRoster, { view: si }));
    expect(html).toContain('href="/clubs/sf-hawks"');
    expect(html).toContain('<span><span class="sr-only">Storey Lewis’s club: </span>SF Hawks</span>');
    expect(html).toContain('<span aria-hidden="true" class="text-ink-3">Club:</span>');
    // The club line comes before the row's profile links.
    const row = /<li[^>]*>(?:(?!<\/li>)[\s\S])*?Storey Lewis(?:(?!<\/li>)[\s\S])*<\/li>/.exec(html)![0];
    expect(row.indexOf('/clubs/sf-hawks')).toBeGreaterThan(-1);
    expect(row.indexOf('/clubs/sf-hawks')).toBeLessThan(row.indexOf('target="_blank"'));
    // Internal links: no arrow, no "opens in a new tab", never prefetched as a row.
    expect(/<a[^>]*href="\/clubs\/sf-hawks"[^>]*>/.exec(html)![0]).not.toContain('target=');
  });

  it('explains club lines once where there are any, and "listed club" only where one is shown', () => {
    const footnote = 'Club lines link to the club’s page on this site';
    const listed = 'A “listed club” is one a source names';
    const count = (html: string, s: string) => html.split(s).length - 1;
    const withClubs = renderToStaticMarkup(createElement(TeamRoster, { view: si }));
    expect(count(withClubs, footnote)).toBe(1);
    expect(withClubs).toContain('Recall is partial: a player with no club line may still play for a club.');
    expect(si.hasListedClub).toBe(false);
    expect(withClubs).not.toContain(listed);
    const losAltos = renderToStaticMarkup(createElement(TeamRoster, { view: views.find((v) => v.slug === 'los-altos')!.view }));
    expect(count(losAltos, listed)).toBe(1);
    expect(losAltos).toContain('<span><span class="sr-only">Riya Mehrotra’s listed club: </span>Fly FHC</span>');
    for (const { slug, view } of views) {
      const html = renderToStaticMarkup(createElement(TeamRoster, { view }));
      expect(count(html, footnote), slug).toBe(view.hasClubs ? 1 : 0);
      expect(count(html, listed), slug).toBe(view.hasListedClub ? 1 : 0);
    }
    const none = renderToStaticMarkup(
      createElement(TeamRoster, { view: { ...si, rows: si.rows.map((r) => ({ ...r, clubs: [] })), hasClubs: false } }),
    );
    expect(none).not.toContain(footnote);
    expect(none).not.toContain('/clubs/');
  });

  it('separates a row’s groups and clubs so no dot or comma starts a line', () => {
    const sf = views.find((v) => v.slug === 'saint-francis')!.view;
    const html = renderToStaticMarkup(createElement(TeamRoster, { view: sf }));
    // textOf puts a space where each tag was, so compare without whitespace.
    const text = textOf(html).replace(/\s+/g, '');
    expect(text).toContain(
      'Club: Melanie Henderson’s club: NorCal Impact · Earlier clubs: Melanie Henderson’s earlier clubs: Fly FHC, Melanie Henderson’s earlier clubs: Lightning'.replace(/\s+/g, ''),
    );
    // The comma sits after the closing tag of the club before it, so it cannot start a line.
    expect(html).toContain('Fly FHC</span></a></span><span>, <a');
    expect(html).toMatch(/\u00a0· <span aria-hidden="true" class="text-ink-3">Earlier clubs:<\/span>\u00a0/);
  });
});

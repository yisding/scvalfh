/**
 * The team view model (SPEC §10.5, §8.1; views/teams/team-view.ts): the view of every team, identity lines, league
 * copy, postseason lines, the NEXT card, opponent record lines, earlier meetings and the official-only fixtures.
 * League-specific values are asserted on the all-2026-10-02 CORPUS snapshot (SPEC §13.6), loaded through
 * useCorpusModules (tests/support/team-view.ts), so live fetch #2 cannot break them. Every assertion message names
 * the module that produced the value, so a failure routes to its owner.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { getTeamBySlug } from '@/lib/registry/teams';
import { textOf } from '@/tests/support/html-text';
import { m } from '@/tests/support/team-view';

describe('team-view.ts over every division (ALL_DIVISIONS)', () => {
  it('builds a view for every registry team, with the division size and "of N in …"', () => {
    let seen = 0;
    for (const division of m.leagues.ALL_DIVISIONS) {
      const scope = m.labels.divisionHeading(division.id) ?? m.leagues.getLeague(division.leagueId).shortName;
      const teams = m.data.getTeams(division.id);
      expect(teams.length, `lib/queries/teams.ts getTeams(${division.id})`).toBe(division.expectedTeams);
      for (const team of teams) {
        const v = m.view.buildTeamPageView(team.slug);
        expect(v, `views/teams/team-view.ts ${team.slug}`).toBeDefined();
        if (!v) continue;
        seen += 1;
        // A Southern Section independent (DESIGN §24.10): a league team's view, with the group's table (no fixed
        // schedule, so no scheduled count) and its standings link labelled 'LA standings'.
        if (m.leagues.isIndependentDivision(division.id)) {
          expect(v.scopeLabel, `views/teams/team-view.ts ${team.slug} scope`).toBe('LA');
          expect(v.divisionSize, `views/teams/team-view.ts ${team.slug} divisionSize`).toBe(division.expectedTeams);
          expect(v.standingsHref, `views/teams/team-view.ts ${team.slug} standingsHref`).toBe(
            `/standings/${division.leagueId}#${division.id}`,
          );
          expect(v.standingsLabel, `views/teams/team-view.ts ${team.slug} standingsLabel`).toBe('LA standings');
          expect(v.leagueScheduled, `views/teams/team-view.ts ${team.slug} scheduled`).toBeNull();
          continue;
        }
        expect(v.divisionSize, `views/teams/team-view.ts ${team.slug} divisionSize`).toBe(division.expectedTeams);
        expect(v.scopeLabel, `views/teams/team-view.ts ${team.slug} scope`).toBe(scope);
        const sub = m.view.placeSub(v);
        // The tile's VALUE is the ordinal (T-prefixed when level); the sub-line only completes it,
        // so a shared place is never written a second way under the value.
        expect(sub, `views/teams/team-view.ts placeSub ${team.slug}`).toBe(
          `of ${division.expectedTeams} in ${scope}`,
        );
        expect(v.standingsHref, `views/teams/team-view.ts standingsHref ${team.slug}`).toBe(
          `/standings/${division.leagueId}#${division.id}`,
        );
        // A league that publishes no schedule (`official.mode` 'none') has no link to give.
        expect(v.officialScheduleUrl, `views/teams/team-view.ts schedule url ${team.slug}`).toBe(
          division.official.mode === 'none' ? null : division.official.scheduleUrl,
        );
        expect(v.leagueScheduled, `views/teams/team-view.ts scheduled ${team.slug}`).toBe(division.gamesPerTeam);
        // The league log is exactly the games that count for this team's table.
        expect(
          v.leagueLog.every((g) => g.countsFor === division.id),
          `views/teams/team-view.ts leagueLog ${team.slug}`,
        ).toBe(true);
        expect(v.nonLeagueLog.every((g) => g.countsFor === null), `views/teams/team-view.ts nonLeagueLog ${team.slug}`).toBe(true);
      }
    }
    expect(seen, 'views/teams/team-view.ts: every registry team').toBe(102);
  });

  it('single-division leagues read "of N in <league short>"', () => {
    expect(m.view.placeSub(m.view.buildTeamPageView('tamalpais')!)).toBe('of 9 in MCAL');
    expect(m.view.placeSub(m.view.buildTeamPageView('carmel')!)).toBe('of 7 in PCAL');
    expect(m.view.placeSub(m.view.buildTeamPageView('leigh')!)).toBe('of 6 in Mt. Hamilton');
  });
});

describe('identity lines (views/teams/team-view.ts identityLine)', () => {
  it('a multi-division team: mascot and sport · division · league · city', () => {
    const leigh = m.view.buildTeamPageView('leigh')!;
    expect(leigh.identityLine, 'views/teams/team-view.ts leigh').toBe(
      `${leigh.team.mascot} girls varsity field hockey · Mt. Hamilton · BVAL · ${leigh.team.city}`,
    );
    const si = m.view.buildTeamPageView('st-ignatius')!;
    expect(si.identityLine, 'views/teams/team-view.ts st-ignatius').toBe(
      `${si.team.mascot} girls varsity field hockey · De Anza · SCVAL · ${si.team.city}`,
    );
  });

  it('a single-division team has no division label (SPEC §10.5 example)', () => {
    expect(m.view.buildTeamPageView('tamalpais')!.identityLine, 'views/teams/team-view.ts tamalpais').toBe(
      'Red-Tailed Hawks girls varsity field hockey · MCAL · Mill Valley',
    );
    const carmel = m.view.buildTeamPageView('carmel')!;
    expect(carmel.identityLine, 'views/teams/team-view.ts carmel').toBe(`${carmel.team.mascot} girls varsity field hockey · PCAL · ${carmel.team.city}`);
  });

  it('the pin label names the team and its league', () => {
    expect(m.view.buildTeamPageView('leigh')!.pinLabel, 'views/teams/team-view.ts pinLabel').toBe(
      'Pin Leigh, Mt. Hamilton · BVAL',
    );
    expect(m.view.buildTeamPageView('tamalpais')!.pinLabel, 'views/teams/team-view.ts pinLabel').toBe('Pin Tamalpais, MCAL');
  });
});

describe('league copy (views/teams/team-view.ts leagueCopy)', () => {
  it('end-of-season and bracket sentences by league', () => {
    const scval = m.view.leagueCopy('scval');
    expect(scval.seasonEndSentence).toBe('The SCVAL league season ends Wed Oct 28 and the SCVAL crossover is Fri Oct 30.');
    expect(scval.bracketSentence).toBe('We will list a playoff game as soon as CCS publishes the bracket.');
    expect(m.view.leagueCopy('bval').seasonEndSentence).toBe(
      'The BVAL league season ends Fri Oct 30 and the BVAL play-in is Sat Oct 31.',
    );
    const mcal = m.view.leagueCopy('mcal');
    expect(mcal.seasonEndSentence).toBe('The MCAL league season ends Thu Oct 22 and the MCAL tournament starts Fri Oct 23.');
    expect(mcal.bracketSentence).toBe('We will list a playoff game as soon as MCAL posts the bracket.');
    expect(m.view.leagueCopy('pcal').bracketSentence).toBe('We will list a playoff game as soon as CCS publishes the bracket.');
  });

  it('an unbracketed league (the Super Regional) states its dates and promises no bracket', () => {
    const unbracketed = m.leagues.LEAGUES.filter((l) => l.postseason.kind === 'unbracketed-tournament');
    expect(unbracketed.length, 'lib/config/leagues.ts: one league has an unbracketed postseason').toBe(1);
    for (const league of unbracketed) {
      if (league.postseason.kind !== 'unbracketed-tournament') continue;
      const copy = m.view.leagueCopy(league.id);
      expect(copy.postseasonKind, 'views/teams/team-view.ts kind').toBe('unbracketed-tournament');
      expect(copy.postseasonName, 'views/teams/team-view.ts postseasonName').toBe('Super Regional');
      expect(copy.seasonEndSentence, 'views/teams/team-view.ts seasonEndSentence').toBe(
        'The EAL league season ends Wed Oct 28; the Super Regional follows, Oct 30–31.',
      );
      expect(copy.bracketSentence, 'views/teams/team-view.ts bracketSentence').toBe(
        'We will not guess a bracket: the Super Regional’s format and site are not published yet.',
      );
    }
    for (const id of ['scval', 'bval', 'pcal']) {
      expect(m.view.leagueCopy(id as never).postseasonName, `views/teams/team-view.ts ${id}`).toBeNull();
    }
    expect(m.view.leagueCopy('mcal').postseasonName, 'views/teams/team-view.ts mcal').toBe('MCAL tournament');
  });
});

describe('postseason lines per kind (lib/queries/postseason.ts getTeamPostseasonLine via team-view)', () => {
  it('CCS ladder leagues link the CCS page; MCAL links its tournament; the EAL states its Super Regional; no CCS sentence outside CCS', () => {
    for (const team of m.data.getTeams()) {
      const v = m.view.buildTeamPageView(team.slug)!;
      const line = v.postseasonLine;
      if (!v.hasResults) continue;
      expect(line, `lib/queries/postseason.ts getTeamPostseasonLine ${team.slug}`).not.toBeNull();
      if (!line) continue;
      if (v.league.postseasonKind === 'ccs-ladder') {
        expect(line.href, `lib/queries/postseason.ts ${team.slug} href`).toBe(`/playoffs#${team.league}`);
        expect(line.linkText, `lib/queries/postseason.ts ${team.slug} link`).toBe('CCS playoffs');
      } else if (v.league.postseasonKind === 'unbracketed-tournament') {
        expect(line.href, `lib/queries/postseason.ts ${team.slug} href`).toBe(`/playoffs#${team.league}`);
        expect(line.linkText, `lib/queries/postseason.ts ${team.slug} link`).toBe('Postseason');
        expect(line.sentence, `lib/queries/postseason.ts ${team.slug} sentence`).toBe(
          'The top six schools play the Super Regional, Oct 30–31; its format and site are not published yet.',
        );
        expect(`${line.label} ${line.sentence}`, `lib/queries/postseason.ts ${team.slug}`).not.toMatch(/CCS|at-large|automatic qualifier|seed/i);
      } else if (v.league.postseasonKind === 'no-postseason' || v.league.postseasonKind === 'section-playoffs') {
        // The Southern California kinds: their cards on /playoffs, never a CCS or "top N" word.
        expect(line.href, `lib/queries/postseason.ts ${team.slug} href`).toBe(`/playoffs#${team.league}`);
        expect(`${line.label} ${line.sentence}`, `lib/queries/postseason.ts ${team.slug}`).not.toMatch(/CCS|at-large|automatic qualifier|top \w+ (make|qualify)/i);
      } else {
        expect(line.href, `lib/queries/postseason.ts ${team.slug} href`).toBe('/playoffs/mcal');
        expect(line.linkText, `lib/queries/postseason.ts ${team.slug} link`).toBe('MCAL tournament');
        expect(line.sentence, `lib/queries/postseason.ts ${team.slug} sentence`).toBe(
          'Top six make the MCAL tournament: quarterfinals Mon Oct 26 (a play-in Fri Oct 23 only if needed), final Fri Oct 30 at Tamalpais; seeds 1-2 get byes to the semifinals.',
        );
        expect(`${line.label} ${line.sentence}`, `lib/queries/postseason.ts ${team.slug}`).not.toMatch(/CCS|at-large|automatic qualifier/i);
      }
    }
    const si = m.view.buildTeamPageView('st-ignatius')!;
    expect(si.postseasonLine?.sentence, 'lib/queries/postseason.ts SCVAL sentence').toBe(
      'The SCVAL crossover and the 4th-place play-in are Fri Oct 30.',
    );
  });

  it('TeamPlayoffLine renders the line and no CCS bracket link for MCAL', async () => {
    const { TeamPlayoffLine } = await import('@/components/teams/TeamPlayoffLine');
    const mcal = renderToStaticMarkup(createElement(TeamPlayoffLine, { view: m.view.buildTeamPageView('tamalpais')! }));
    // The arrow is drawn, not spoken (components/ui/Arrow.tsx): the link's name is the words alone.
    expect(mcal, 'components/teams/TeamPlayoffLine.tsx MCAL').toContain('MCAL tournament <span aria-hidden="true">→</span>');
    expect(mcal, 'components/teams/TeamPlayoffLine.tsx MCAL').not.toContain('CCS');
    const scval = renderToStaticMarkup(createElement(TeamPlayoffLine, { view: m.view.buildTeamPageView('st-ignatius')! }));
    expect(scval, 'components/teams/TeamPlayoffLine.tsx SCVAL').toContain('CCS playoffs <span aria-hidden="true">→</span>');
    expect(scval, 'components/teams/TeamPlayoffLine.tsx SCVAL').toContain('Official CCS bracket');
  });
});

/** The calendar day before a 'YYYY-MM-DD' key, by UTC arithmetic (no clock, no time zone). */
function dayBefore(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Invariants over the corpus snapshot, checked for every registry team in all five leagues rather
// than pinned per team, so a corpus refresh that moves a game keeps them meaningful.
// `buildNextCard` takes `today` as a parameter, so the Today label is tested without the clock.
describe('buildNextCard (views/teams/team-view.ts)', () => {
  it("labels the next game 'Today · ' only on its own day", () => {
    let checked = 0;
    for (const team of m.data.getTeams()) {
      const v = m.view.buildTeamPageView(team.slug)!;
      const next = v.next;
      if (!next || next.isDateTba) continue;
      checked += 1;
      const onDay = m.view.buildNextCard(team, next, [], next.dateKey, v.league);
      const dayAhead = m.view.buildNextCard(team, next, [], dayBefore(next.dateKey), v.league);
      expect(onDay.kind, `views/teams/team-view.ts ${team.slug}`).toBe('game');
      if (onDay.kind === 'none' || dayAhead.kind === 'none') continue;
      expect(onDay.dateLabel.startsWith('Today \u00b7 '), `views/teams/team-view.ts ${team.slug}`).toBe(true);
      expect(dayAhead.dateLabel.startsWith('Today'), `views/teams/team-view.ts ${team.slug}`).toBe(false);
    }
    expect(checked, 'the corpus has upcoming games to label').toBeGreaterThan(0);
  });

  it('prints no place when the sources disagree on the host and no venue is named', () => {
    // The corpus may or may not hold such a game; when it has none the assertion holds vacuously.
    const conflicted = m.data.getGames().filter((g) => g.provenance.hostConflict && !g.venue.name);
    for (const game of conflicted) {
      for (const slug of [game.home.slug, game.away.slug]) {
        const team = slug ? getTeamBySlug(slug) : undefined;
        if (!team) continue;
        const card = m.view.buildNextCard(team, game, [], game.dateKey, m.view.leagueCopy(team.league));
        expect(card.kind === 'game' ? card.place : 'not a game card', `views/teams/team-view.ts ${game.contestId}`).toBeNull();
      }
    }
  });

  it('names an official-only fixture dated before the next contest, and only one dated before it', () => {
    let checked = 0;
    for (const team of m.data.getTeams()) {
      const v = m.view.buildTeamPageView(team.slug)!;
      const next = v.next;
      if (!next || next.isDateTba) continue;
      // A league with no official schedule (`official.mode` 'none') has no fixtures to name.
      const official = m.leagues.getDivision(team.division).official;
      if (official.mode === 'none') continue;
      checked += 1;
      // A fixture of the team's own league, at home against a school outside the registry, so the
      // card must fall back to the schedule's own spelling of the opponent.
      const fixture = (dateKey: string, time: string | null = null) => ({
        id: `${team.division}:${dateKey}:Visitors@${team.slug}`,
        league: team.league,
        division: team.division,
        dateKey,
        time,
        awayName: 'Visitors',
        homeName: team.name,
        awaySlug: null,
        homeSlug: team.slug,
        source: official.source,
      });
      const today = dayBefore(dayBefore(next.dateKey));
      const before = m.view.buildNextCard(team, next, [fixture(dayBefore(next.dateKey))], today, v.league);
      expect(before.kind === 'game' ? before.officialBefore : null, `views/teams/team-view.ts ${team.slug}`).toEqual({
        dateLabel: expect.any(String),
        timeLabel: null,
        versus: 'vs',
        opponentName: 'Visitors',
      });
      // A league that publishes the start time (PCAL, BVAL): the card names it.
      const timed = m.view.buildNextCard(team, next, [fixture(dayBefore(next.dateKey), '16:00')], today, v.league);
      expect(timed.kind === 'game' ? timed.officialBefore?.timeLabel : null, `views/teams/team-view.ts ${team.slug}`).toBe('4:00 PM PT');
      const sameDay = m.view.buildNextCard(team, next, [fixture(next.dateKey)], today, v.league);
      expect(sameDay.kind === 'game' ? sameDay.officialBefore : 'not a game card', `views/teams/team-view.ts ${team.slug}`).toBeNull();
    }
    expect(checked, 'the corpus has upcoming games').toBeGreaterThan(0);
  });
});

describe('fixtureOpponent (views/shared/official-fixtures.ts)', () => {
  it('names a registered opponent by short name and title-cases a grid name outside the registry', () => {
    const team = m.data.getTeams()[0];
    const base = {
      id: `${team.division}:2026-10-20:x@${team.slug}`,
      league: team.league,
      division: team.division,
      dateKey: '2026-10-20',
      time: null,
      homeName: team.name.toUpperCase(),
      homeSlug: team.slug,
      source: 'scval-pdf' as const,
    };
    const outside = m.fixtures.fixtureOpponent({ ...base, awayName: 'VALLEY CHRISTIAN', awaySlug: null }, team);
    expect(outside).toMatchObject({ mineIsHome: true, versus: 'vs', opponent: undefined, opponentName: 'Valley Christian' });
    expect(m.view.officialFixtureHeadline({ ...base, awayName: 'VALLEY CHRISTIAN', awaySlug: null }, team)).toMatch(
      /^vs Valley Christian · /,
    );
    const rival = m.data.getTeams().find((t) => t.slug !== team.slug)!;
    const away = m.fixtures.fixtureOpponent({ ...base, awayName: 'X', awaySlug: rival.slug }, rival);
    expect(away).toMatchObject({ mineIsHome: false, versus: 'at', opponentName: team.shortName });
  });
});

describe('opponentRecordLine (views/teams/team-view.ts)', () => {
  it('prints nothing for an opponent outside the registry, whichever league is asking', () => {
    for (const league of m.leagues.LEAGUES) {
      expect(m.view.opponentRecordLine(undefined, league.id), `views/teams/team-view.ts ${league.id}`).toBeNull();
    }
  });

  it("reads 'W-L-T · [tied ]Nth in <scope>' from its own league, 'tied' exactly when the place is shared", () => {
    for (const team of m.data.getTeams()) {
      const line = m.view.opponentRecordLine(team, team.league);
      if (line === 'no league results yet') continue;
      // An independent has no place: its overall record and the group's short name (DESIGN §24.9).
      if (m.leagues.isIndependentLeague(team.league)) {
        expect(line, `views/teams/team-view.ts ${team.slug}`).toMatch(/^(\d+-\d+-\d+ overall \u00b7 LA|no results yet)$/);
        continue;
      }
      const scope = m.labels.divisionHeading(team.division) ?? m.leagues.getLeague(team.league).shortName;
      const match = /^\d+-\d+-\d+ \u00b7 (tied )?\d+(?:st|nd|rd|th) in (.+)$/.exec(line ?? '');
      expect(match, `views/teams/team-view.ts ${team.slug}: ${line}`).not.toBeNull();
      if (!match) continue;
      expect(match[2], `views/teams/team-view.ts ${team.slug} scope`).toBe(scope);
      const standing = m.data.getStandingFor(team.slug);
      expect(match[1] === 'tied ', `views/teams/team-view.ts ${team.slug} tied`).toBe(standing?.tiebreak.shared ?? false);
    }
  });
});

describe('earlierMeeting (views/teams/team-view.ts)', () => {
  it('recalls only a final played before the next game', () => {
    for (const team of m.data.getTeams()) {
      const next = m.view.buildTeamPageView(team.slug)?.next;
      if (!next) continue;
      const side = next.home.slug === team.slug ? next.away : next.home;
      const opponent = side.slug ? getTeamBySlug(side.slug) : undefined;
      const earlier = m.view.earlierMeeting(team, opponent, next.dateLocal);
      if (!earlier) continue;
      const game = m.data.getGameById(earlier.contestId);
      expect(game?.status, `views/teams/team-view.ts ${team.slug}`).toBe('final');
      expect(game !== undefined && game.dateLocal < next.dateLocal, `views/teams/team-view.ts ${team.slug}`).toBe(true);
    }
  });
});

describe('"Who we haven’t beaten" official-only fixtures (views/teams/team-view.ts buildUnbeaten)', () => {
  it('counts only past-dated fixtures as unreported, and carries the next future one as a date', () => {
    for (const team of m.data.getTeams()) {
      const v = m.view.buildTeamPageView(team.slug);
      if (!v) continue;
      const fixtures = m.data.getOfficialFixtures({ slug: team.slug });
      for (const o of v.unbeaten) {
        const theirs = fixtures.filter((f) => f.awaySlug === o.slug || f.homeSlug === o.slug);
        const past = theirs.filter((f) => f.dateKey < v.today);
        const ahead = theirs.filter((f) => f.dateKey >= v.today).map((f) => f.dateKey).sort();
        expect(o.unreportedFixtures, `views/teams/team-view.ts ${team.slug} v ${o.slug}`).toBe(past.length);
        expect(o.nextFixtureDate, `views/teams/team-view.ts ${team.slug} v ${o.slug}`).toBe(ahead[0] ?? null);
      }
    }
  });

  it('orders rows by the date each one shows, official-only fixtures included', () => {
    for (const team of m.data.getTeams()) {
      const v = m.view.buildTeamPageView(team.slug);
      if (!v) continue;
      const shown = v.unbeaten.map((o) => o.nextDate ?? o.nextFixtureDate);
      const dated = shown.filter((d): d is string => d !== null);
      expect(dated, `views/teams/team-view.ts ${team.slug}`).toEqual([...dated].sort());
      expect(shown.slice(0, dated.length), `views/teams/team-view.ts ${team.slug}`).toEqual(dated);
    }
  });

  it('says "next <date>" for a future fixture and "N unreported" only for a past one', async () => {
    const { TeamUnbeaten } = await import('@/components/teams/TeamUnbeaten');
    const base = m.view.buildTeamPageView('carmel')!;
    const opponent = (slug: string, extra: Partial<import('@/views/teams/team-view').UnbeatenOpponent>) => {
      const t = getTeamBySlug(slug)!;
      return {
        slug: t.slug,
        name: t.name,
        shortName: t.shortName,
        record: { w: 0, l: 1, t: 0 },
        played: 1,
        remaining: 0,
        nextDate: null,
        unreportedFixtures: 0,
        nextFixtureDate: null,
        ...extra,
      };
    };
    const short = base.league.shortName;
    const render = (unbeaten: ReturnType<typeof opponent>[]) =>
      renderToStaticMarkup(createElement(TeamUnbeaten, { view: { ...base, unbeaten } }));
    const others = m.data.getTeams(base.team.division).filter((t) => t.slug !== base.team.slug);

    // Future only: the date, never "unreported", and no footnote about unreported meetings.
    const future = render([opponent(others[0].slug, { nextFixtureDate: '2026-10-14' })]);
    expect(textOf(future), 'components/teams/TeamUnbeaten.tsx future').toContain('next Oct 14');
    expect(future, 'components/teams/TeamUnbeaten.tsx future').not.toContain('unreported');
    expect(future, 'components/teams/TeamUnbeaten.tsx future sentence').toContain(
      `next meeting Oct 14 on ${short}’s schedule`,
    );

    // One past and one future: the future date leads, and since no row then reads "unreported",
    // there is no footnote explaining the word.
    const mixed = render([opponent(others[0].slug, { nextFixtureDate: '2026-10-14', unreportedFixtures: 1 })]);
    expect(textOf(mixed), 'components/teams/TeamUnbeaten.tsx mixed').toContain('next Oct 14');
    expect(mixed, 'components/teams/TeamUnbeaten.tsx mixed footnote').not.toContain('An “unreported” meeting');

    // Past only: "N unreported" and the footnote.
    const past = render([opponent(others[0].slug, { unreportedFixtures: 2 })]);
    expect(textOf(past), 'components/teams/TeamUnbeaten.tsx past').toContain('2 unreported');
    expect(past, 'components/teams/TeamUnbeaten.tsx past sentence').toContain(
      `2 scheduled per ${short} with no result reported`,
    );
  });
});

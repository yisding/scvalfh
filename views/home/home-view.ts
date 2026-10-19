/**
 * Everything `/` renders, assembled once on the server (SPEC §10.1, DESIGN §3.1).
 *
 * This is the only module the home page reads data through, and it reads the snapshot ONLY through
 * `lib/queries/` (plus the pure config helpers of `lib/config/leagues.ts` and `lib/shared/pin-label.ts`). "Today"
 * is always `getToday()` — derived from `snapshot.fetchedAt` in America/Los_Angeles, never
 * `Date.now()` — so the build is reproducible and the "as of" stamp in the header is honest.
 *
 * The page carries EVERY league's panel in its static HTML; which one shows is decided before first
 * paint by `<html data-league>`, `<html data-region>` and the scope stylesheet (SPEC §8.2,
 * DESIGN-socal §2.4). So every view below is built for all nine leagues and the independents, and all 102 pinned-card views
 * are serialized for the client (the pin, and therefore the league, is known only in the browser).
 * Budget: serialized `teamViews` (tests/ui/home-weight.test.ts) — each view is a handful of strings,
 * never a `Game`.
 *
 * Region (DESIGN-socal §2.4): the first-visit blocks that summarise "every league" (the status line's
 * league list, the latest-results block, the league cards' grid) are built once per region, and a
 * panel's "Other leagues" strip names only the leagues of its own region: a NorCal family does not
 * need the San Diego leaders under its league, and the region toggle is how a reader crosses over.
 */

import { byRegion, getLeague, regionIdSuffix } from '@/lib/config/leagues';
import { divisionHeading, standaloneName, standingsLabel } from '@/lib/config/leagues/labels';
import { getToday } from '@/lib/datasets/snapshot';
import { outcomesFor, playoffOutcomeLabel, statusBadge } from '@/lib/engine/standings';
import { ordinal, recordString } from '@/lib/format/numbers';
import { EM_DASH, plural } from '@/lib/format/words';
import type { DivisionId, RegionId } from '@/lib/model/ids';
import type { RegionConfig } from '@/lib/model/league-config';
import type { SeasonPhase } from '@/lib/model/season';
import { getGames, getLatestResultsDate } from '@/lib/queries/games';
import { type LeagueSummary, getLeagueSummaries } from '@/lib/queries/leagues';
import { getSeasonPhase } from '@/lib/queries/phase';
import { getTeamPostseasonLine } from '@/lib/queries/postseason';
import { getStandingContext, getStandingFor } from '@/lib/queries/standings';
import { getTeamSearchIndex, getTeams } from '@/lib/queries/teams';
import { standingsHref } from '@/lib/shared/routes';
import type { SearchIndex } from '@/lib/shared/search';
import { leagueChips } from '@/views/site/league-chips';
import type { LeagueChip } from '@/views/site/league-chips';

import { crossLeagueLatest } from './cross-league';
import type { CrossLeagueLatest } from './cross-league';
import { byKickoff } from './days';
import { POSTSEASON_LEAD, rungCardText } from './home-client';
import type { HomeTeamView, LeagueCardView } from './home-client';
import { buildPanel } from './league-panel';
import type { HomeLeaguePanel } from './league-panel';
import { lastGameView, nextGameView, officialNextView } from './my-team';

// ---------------------------------------------------------------- my-team views

const LATER_PHASES: ReadonlySet<SeasonPhase> = new Set<SeasonPhase>(['preseason', 'regular']);

/**
 * Every team (49), pre-serialized (DESIGN §7.12). The pin lives in the reader's browser, so the
 * server cannot know which one is wanted; shipping every compact view is the cost of the feature.
 */
export function buildTeamViews(): HomeTeamView[] {
  const today = getToday();
  const contexts = new Map<DivisionId, ReturnType<typeof getStandingContext>>();
  return getTeams().map((team) => {
    const league = getLeague(team.league);
    const heading = divisionHeading(team.division);
    if (!contexts.has(team.division)) contexts.set(team.division, getStandingContext(team.division));
    const context = contexts.get(team.division)?.get(team.id);
    const standing = getStandingFor(team.slug);
    const games = getGames({ teamId: team.id }).sort(byKickoff);
    // The last PLAYED game: a final, or a game whose date has come and whose score has not
    // (score-pending), so a card never sits on an older "Last" after a newer game was played.
    const playedGames = games.filter(
      (g) => (g.status === 'final' || g.status === 'score-pending') && g.dateKey <= today,
    );
    const last = playedGames.at(-1) ?? null;
    const next =
      games.find(
        (g) =>
          g.dateKey >= today &&
          (g.status === 'scheduled' || g.status === 'live' || g.status === 'postponed'),
      ) ?? null;
    const hasResults = standing?.hasReportedResults ?? false;
    const place = standing
      ? standing.tiebreak.shared
        ? `tied ${ordinal(standing.computed.place)}`
        : ordinal(standing.computed.place)
      : null;
    const line = getTeamPostseasonLine(team.slug);
    const projected = LATER_PHASES.has(getSeasonPhase(league.id));
    const lead = projected ? POSTSEASON_LEAD.projected : POSTSEASON_LEAD.final;
    // The card's one visible line must show the STATUS at 320px (288px of text): a short lead, and
    // for a place shared across two rungs the rungs' badges ('Play-in or No AQ route (tied)')
    // instead of the full label with its tiebreak citation, which the team page carries.
    const outcomes = standing ? outcomesFor(standing) : [];
    const tieBadges =
      line && outcomes.length > 1 ? `${outcomes.map((o) => statusBadge(team.division, o)).join(' or ')} (tied)` : null;
    // A one-rung label too long for that line ("<who>: <what>", the San Diego Section's champion rung)
    // gets its short form too (home-types.ts rungCardText); every other label is shown whole.
    const oneRung =
      line && outcomes.length === 1
        ? rungCardText(playoffOutcomeLabel(team.division, outcomes), statusBadge(team.division, outcomes[0]))
        : null;
    const shortLabel = tieBadges ?? (oneRung !== null && oneRung !== line?.label ? oneRung : null);
    return {
      // The identity the card draws is the search index's entry for this slug (HomeCardTeam).
      slug: team.slug,
      meta: [hasResults && place ? place : 'No results yet', heading, league.shortName]
        .filter((part): part is string => !!part)
        .join(' · '),
      // 'x of y played' while games are left; a league with no fixed schedule (the Sunset) has no "of y",
      // so its card says 'x played' once the team has played (DESIGN-socal §2.1.7).
      played:
        context === undefined
          ? null
          : context.scheduled === null || context.remaining === null
            ? context.counted > 0
              ? `${context.counted} played`
              : null
            : context.remaining > 0
              ? `${context.counted} of ${context.scheduled} played`
              : null,
      postseason: line ? `${lead.full} ${line.label}` : null,
      ...(shortLabel ? { postseasonShort: `${lead.short} ${shortLabel}` } : {}),
      tableHref: standingsHref(league.id, team.division),
      hasResults,
      leagueRecord: hasResults && standing ? recordString(standing.computed) : EM_DASH,
      overallRecord: standing && standing.overall.gp > 0 ? recordString(standing.overall) : EM_DASH,
      form: hasResults && standing ? [...standing.computed.last5] : [],
      last: last ? lastGameView(last, team.slug) : null,
      next: next ? nextGameView(next, team.slug) : null,
      officialNext: next ? null : officialNextView(team, today, league.shortName),
    };
  });
}

// ---------------------------------------------------------------- the page's data

export interface HomeStatus {
  /** The latest results day across every league, or null before any result. */
  resultsThrough: string | null;
  teamCount: number;
  leagueShorts: string[];
}

/** One region's half of the first-visit view (DESIGN-socal §2.4): what the region-scoped blocks print. */
export interface HomeRegion {
  id: RegionId;
  /** 'Northern California' | 'Southern California': the card grid's h3. */
  name: RegionConfig['name'];
  /** 'NorCal' | 'SoCal' */
  shortName: RegionConfig['shortName'];
  /** The status line, over this region's leagues: its latest results day, its teams and its leagues. */
  status: HomeStatus;
  /** The region's league cards, config order. */
  leagueCards: LeagueCardView[];
  /** The region's latest results day across its leagues, or null before any. */
  latest: CrossLeagueLatest | null;
  /** '' for NorCal (today's ids), '-socal' for SoCal: the id rule for a block both regions repeat. */
  idSuffix: '' | '-socal';
}

export interface HomeView {
  today: string;
  status: HomeStatus;
  /** Every team (49), for the My-team slot. */
  teamViews: HomeTeamView[];
  searchIndex: SearchIndex;
  leagueChips: LeagueChip[];
  leagueCards: LeagueCardView[];
  panels: HomeLeaguePanel[];
  /** NorCal, then SoCal (REGIONS order). */
  regions: HomeRegion[];
}

/** A league's card in "Find your team" (`LeagueCard`). */
function leagueCardView(s: LeagueSummary): LeagueCardView {
  return {
    id: s.id,
    shortName: s.shortName,
    name: s.name,
    sectionShort: s.section.shortName,
    regionId: s.region,
    cities: s.cities,
    teamsLine: plural(s.teamCount, 'team', 'teams'),
    divisions: s.singleDivision ? [] : s.divisions.map((d) => d.label),
    standingsHref: standingsHref(s.id),
    standingsLabel: standingsLabel(s.id),
    showName: standaloneName(s.id),
  };
}

/** The latest results day over some leagues' summaries, or null before any. */
function latestOf(summaries: readonly LeagueSummary[]): string | null {
  const dates = summaries
    .map((s) => getLatestResultsDate({ league: s.id }))
    .filter((d): d is string => d !== null)
    .sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

export function buildHomeView(): HomeView {
  const today = getToday();
  const summaries = getLeagueSummaries();
  const leagueIds = summaries.map((s) => s.id);
  const teams = getTeams();
  const leagueCards = summaries.map(leagueCardView);
  return {
    today,
    status: {
      resultsThrough: getLatestResultsDate(),
      teamCount: teams.length,
      leagueShorts: summaries.map((s) => s.shortName),
    },
    teamViews: buildTeamViews(),
    searchIndex: getTeamSearchIndex(),
    leagueChips: leagueChips(),
    leagueCards,
    panels: summaries.map((s) => buildPanel(s, summaries, today)),
    regions: byRegion(summaries, (s) => s.region).map(({ region, items: mine }) => {
      const ids = mine.map((s) => s.id);
      return {
        id: region.id,
        name: region.name,
        shortName: region.shortName,
        status: {
          resultsThrough: latestOf(mine),
          teamCount: teams.filter((t) => ids.includes(t.league)).length,
          leagueShorts: mine.map((s) => s.shortName),
        },
        leagueCards: leagueCards.filter((c) => c.regionId === region.id),
        latest: crossLeagueLatest(ids, leagueIds),
        idSuffix: regionIdSuffix(region.id),
      };
    }),
  };
}

/**
 * The /jv/game/[id] view model: one JV game's page, shared by the page, its `generateMetadata` and its OG card.
 *
 * A JV game is its own page because a JV result is shared the way a varsity one is, but it is kept apart from
 * varsity on it exactly as everywhere else (README "JV games"): the records under the names are the JV teams'
 * records over their listed JV finals (components/jv/jv-view.ts counts them the same way), the series is the two
 * JV teams' meetings, the competition line links the JV table (/jv) or the league's JV season (/jv/<league>), and
 * what the game counts for is lib/jv/jv-standings.ts' classification in words. Nothing here reads a varsity
 * standing, form or rating; the varsity game played beside it (jvVarsityTwins) is named and linked, never mixed in.
 *
 * SERVER-ONLY: reads lib/jv/jv and lib/data.
 */

import { crossLevelNote, crossLevelSides, isCrossLevelGame } from '../../lib/cross-level';
import { getGameDates } from '../../lib/data';
import { byDateThenId, dateWithYear, matchupJoiner, recordString, shortDate, sideOutcome, timeOfDayPT } from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import {
  getJvClassification,
  getJvGameBySlug,
  getJvGameSlug,
  getJvGameSlugs,
  getJvGames,
  getJvVarsityGame,
  jvGameHref,
} from '../../lib/jv/jv';
import { isOfficialJvContestId } from '../../lib/jv/jv-official';
import type { JvClassification } from '../../lib/jv/jv-standings';
import { jvOutsideTeamByMaxprepsId, type JvSlotTeam } from '../../lib/jv/jv-teams';
import { divisionHeading, getLeague, isSingleDivision, leagueOfDivision, regionOf } from '../../lib/leagues';
import { SPORT } from '../../lib/sports/current';
import { getTeamBySlug } from '../../lib/teams';
import type { DivisionId, Game, GameSide, LeagueId, Outcome, Team } from '../../lib/types';
import { regionIdSuffix } from '../leaders/scope';
import { describeGame, type GameDisplay, type SideView } from '../ui/describe-game';
import { jvDiffersNote } from './jv-view';

export interface JvGameSideModel {
  /** The school's full name, or the source's name for a side outside the registry. */
  name: string;
  /** The name for a `<title>` and an OG card: the short name when the full one is over 24 characters. */
  label: string;
  team: Team | undefined;
  /** York for Santa Catalina's JV slot (lib/jv/jv-teams.ts JV_OUTSIDE_TEAMS): the school whose slot it plays. */
  slot: JvSlotTeam | undefined;
  /** `3-1 JV` — the JV team's record over its listed finals as of this game (after it when it is a final). */
  sub: string | null;
  outcome: Outcome | null;
  view: SideView;
}

export interface JvSeriesMeeting {
  game: Game;
  href: string;
  isThisGame: boolean;
}

export interface JvGameModel {
  game: Game;
  param: string;
  canonical: string;
  display: GameDisplay;
  away: JvGameSideModel;
  home: JvGameSideModel;
  /** The line over the board: the JV table it counts for, else the league's JV season. */
  competition: { name: string; href: string | null };
  /** `JV league game · De Anza` | `Non-league JV game` | `JV game, not counted`, and the sentence under it. */
  countsAs: { label: string; detail: string };
  /** Sentences a reader must not miss: a score another source reports differently, a slot team, a schedule listing. */
  notes: string[];
  /** The caption for the two records: whose and as of when; null when neither side has a JV list here. */
  recordsCaption: string | null;
  /** The varsity game played beside this one, with its page and its result in words. */
  varsity: { href: string; sentence: string; dateLabel: string; sameDay: boolean } | null;
  /** Every listed JV meeting of the two teams this season, oldest first (shown when there are two or more). */
  series: JvSeriesMeeting[];
  /** Whose side the series rows read from: the home side's team id. */
  seriesPerspective: { teamId: string } | null;
  /** The date's page: /scores/<date>#jv (or #jv-socal) when the date has varsity games, else the league's JV season at that date. */
  dayHref: string;
  /** Off-site pages for this game: MaxPreps' JV game page, si.com's, a stream. */
  links: Array<{ href: string; label: string }>;
  /** `Sep 24, 2026 · 4:00 PM PT`, or the date alone when the time is TBA. */
  whenLabel: string;
}

const TITLE_NAME_LIMIT = 24;

const leagueOfSide = (side: GameSide): LeagueId | undefined => {
  const slug = side.slug ?? jvOutsideTeamByMaxprepsId(side.teamId)?.jvFor ?? null;
  return slug ? getTeamBySlug(slug)?.league : undefined;
};

/** The JV game's league for its links: the home side's, else the away side's. */
function leagueOfGame(game: Game): LeagueId | undefined {
  return leagueOfSide(game.home) ?? leagueOfSide(game.away);
}

/** `SCVAL De Anza` / `MCAL`: the JV table's name without "JV". */
function divisionWords(division: DivisionId): string {
  const league = leagueOfDivision(division);
  const heading = divisionHeading(division);
  if (!heading) return league.shortName;
  return heading.startsWith(league.shortName) ? heading : `${league.shortName} ${heading}`;
}

/** `/jv#de-anza` (a division's block) or `/jv#mcal` (a single-division league's section). */
function jvTableHref(division: DivisionId): string {
  const league = leagueOfDivision(division);
  return `/jv#${isSingleDivision(league.id) ? league.id : division}`;
}

/** The record a team carried out of (a final) or into (anything else) this game, over its listed JV finals. */
function recordAsOf(game: Game, teamId: string, all: readonly Game[]): string | null {
  const mine = all.filter((g) => g.home.teamId === teamId || g.away.teamId === teamId).sort(byDateThenId);
  const index = mine.findIndex((g) => g.contestId === game.contestId);
  const upTo = mine.slice(0, game.status === 'final' ? index + 1 : index);
  const tally = { w: 0, l: 0, t: 0 };
  for (const g of upTo) {
    if (g.status !== 'final') continue;
    const outcome = sideOutcome(g, g.home.teamId === teamId ? 'home' : 'away');
    if (outcome === 'W') tally.w += 1;
    else if (outcome === 'L') tally.l += 1;
    else if (outcome === 'T') tally.t += 1;
  }
  return tally.w + tally.l + tally.t === 0 ? null : recordString(tally);
}

function sideModel(game: Game, side: GameSide, view: SideView, display: GameDisplay, all: readonly Game[]): JvGameSideModel {
  const team = side.slug ? getTeamBySlug(side.slug) : undefined;
  const slot = team ? undefined : jvOutsideTeamByMaxprepsId(side.teamId);
  const name = team ? team.name : side.name;
  const tracked = team !== undefined || slot !== undefined;
  const record = tracked && side.teamId ? recordAsOf(game, side.teamId, all) : null;
  return {
    name,
    label: team && name.length > TITLE_NAME_LIMIT ? team.shortName : name,
    team,
    slot,
    sub: tracked ? (record ? `${record} JV` : 'No JV results yet') : null,
    outcome: display.kind !== 'final' ? null : view.weight === 'level' ? 'T' : view.weight === 'winner' ? 'W' : 'L',
    view,
  };
}

/** What the game counts for, in words, from its classification (lib/jv/jv-standings.ts rules 0-4). */
function countsAsFor(c: JvClassification | undefined, game: Game): JvGameModel['countsAs'] {
  if (!c) return { label: 'JV game', detail: 'Not classified.' };
  switch (c.kind) {
    case 'league': {
      const table = divisionWords(c.division);
      const why =
        c.via === 'varsity-game'
          ? 'its varsity game counts for the league table'
          : c.via === 'official-fixture'
            ? `it is on the ${leagueOfDivision(c.division).shortName} schedule`
            : 'a source names it a league game';
      return { label: `JV league game · ${table}`, detail: `Counts in the ${table} JV table: ${why}.` };
    }
    case 'non-league': {
      const why = {
        'varsity-non-league': 'its varsity game is non-league.',
        'different-divisions': 'the two schools are in different divisions.',
        'outside-registry': isCrossLevelGame(game)
          ? 'the opponent is not a JV team.'
          : `${[game.away, game.home].some((s) => s.slug === null && !jvOutsideTeamByMaxprepsId(s.teamId)) ? 'one side is a school outside the leagues this site covers' : 'one side plays no league table here'}.`,
        'off-jv-schedule': 'it is not on the league’s own JV schedule.',
      }[c.reason];
      return { label: 'Non-league JV game', detail: `In no JV table: ${why}` };
    }
    case 'uncounted': {
      const table = divisionWords(c.division);
      const why = {
        'no-varsity-counterpart': 'no varsity game of the two schools is within three days of it, so this site cannot tell whether it is a league game',
        ambiguous: 'two varsity games of the two schools are equally near it, so this site cannot tell which one it goes with',
        'varsity-postseason': 'its varsity game is a postseason game',
      }[c.reason];
      return { label: 'JV game, not counted', detail: `Two ${table} teams, but not in the JV table: ${why}.` };
    }
  }
}

const VARSITY_DATES: ReadonlySet<string> = new Set(getGameDates());

function buildModel(game: Game): JvGameModel {
  const all = getJvGames();
  const display = describeGame(game);
  const away = sideModel(game, game.away, display.away, display, all);
  const home = sideModel(game, game.home, display.home, display, all);
  const param = getJvGameSlug(game.contestId) as string;
  const classification = getJvClassification(game.contestId);
  const league = leagueOfGame(game);

  const competition: JvGameModel['competition'] =
    classification?.kind === 'league'
      ? { name: `${divisionWords(classification.division)} JV`, href: jvTableHref(classification.division) }
      : league
        ? { name: `${getLeague(league).shortName} JV`, href: `/jv/${league}` }
        : { name: 'JV', href: '/jv' };

  const slotSide = [away, home].find((s) => s.slot);
  const notes = [
    ...(slotSide?.slot
      ? [`${slotSide.slot.source} ${slotSide.slot.name} plays ${getTeamBySlug(slotSide.slot.jvFor)?.name ?? slotSide.slot.jvFor}’s JV slot.`]
      : []),
    ...(isOfficialJvContestId(game.contestId)
      ? ['Listed from the league’s own JV schedule; no source lists this game yet.']
      : []),
    ...(jvDiffersNote(game) ? [jvDiffersNote(game) as string] : []),
    ...[crossLevelNote(game, (crossLevelSides(game)?.which === 'home' ? away : home).name)].filter((n): n is string => n !== null),
  ];

  const twin = getJvVarsityGame(game.contestId);
  const varsity = twin
    ? {
        href: gameHref(twin),
        sentence: describeGame(twin).sentence,
        dateLabel: shortDate(twin.dateLocal),
        sameDay: twin.dateKey === game.dateKey,
      }
    : null;

  // A cross-level placeholder is a different team each time (lib/cross-level.ts): it has no series.
  const series = (isCrossLevelGame(game) ? [game] : all)
    .filter(
      (g) =>
        (g.home.teamId === game.home.teamId && g.away.teamId === game.away.teamId) ||
        (g.home.teamId === game.away.teamId && g.away.teamId === game.home.teamId),
    )
    .map((g) => ({ game: g, href: jvGameHref(g) as string, isThisGame: g.contestId === game.contestId }));

  const tracked = [away, home].filter((s) => s.team || s.slot).length;
  const recordsCaption =
    tracked === 0
      ? null
      : `${tracked === 1 ? 'JV record' : 'JV records'} over the games listed here, ${display.kind === 'final' ? 'after this game' : 'going in'}`;

  const links: JvGameModel['links'] = [];
  if (game.urls.maxpreps) links.push({ href: game.urls.maxpreps, label: game.status === 'final' ? 'MaxPreps box score' : 'MaxPreps game' });
  if (game.urls.sblive) links.push({ href: game.urls.sblive, label: 'si.com game' });
  if (game.urls.nfhsStream) links.push({ href: game.urls.nfhsStream, label: 'NFHS stream' });
  if (game.urls.hudl) links.push({ href: game.urls.hudl, label: 'Hudl TV' });

  return {
    game,
    param,
    canonical: jvGameHref(game) as string,
    display,
    away,
    home,
    competition,
    countsAs: countsAsFor(classification, game),
    notes,
    recordsCaption,
    varsity,
    series,
    seriesPerspective: game.home.teamId ? { teamId: game.home.teamId } : null,
    // The day page's JV block of the game's region: `#jv` (NorCal) or `#jv-socal` (components/schedule/ScoreDay.tsx).
    dayHref: VARSITY_DATES.has(game.dateKey) && league
      ? `/scores/${game.dateKey}#jv${regionIdSuffix(regionOf(league))}`
      : league
        ? `/jv/${league}#d-${game.dateKey}`
        : '/jv',
    links,
    whenLabel: game.isTimeTba ? dateWithYear(game.dateLocal) : `${dateWithYear(game.dateLocal)} · ${timeOfDayPT(game.dateLocal)}`,
  };
}

/** The page's params: every listed JV game's slug. */
export function jvGameStaticParams(): Array<{ id: string }> {
  return getJvGameSlugs().map((id) => ({ id }));
}

/** The model for a slug; undefined for a segment that is no JV game's. */
export function buildJvGameView(param: string): JvGameModel | undefined {
  const game = getJvGameBySlug(param);
  return game ? buildModel(game) : undefined;
}

/**
 * The `<title>`, as gameTitle words a varsity one with "JV" after each name: `Los Gatos JV 2, Saratoga JV 1 —
 * field hockey, Sep 15, 2026`, winner first on a decided final; `Carmel JV at Salinas JV field hockey — Oct 2, 2026, 4:00 PM`.
 */
export function jvGameTitle(model: JvGameModel): string {
  const { display, game, away, home } = model;
  const date = dateWithYear(game.dateLocal);
  if (display.kind === 'final') {
    const [first, second] = home.view.weight === 'winner' ? [home, away] : [away, home];
    const decider = display.deciderTag ? ` (${display.deciderTag})` : '';
    return `${first.label} JV ${first.view.glyph}, ${second.label} JV ${second.view.glyph}${decider} — ${SPORT.noun}, ${date}`;
  }
  const suffix =
    display.kind === 'scheduled' ? (game.isTimeTba ? 'time TBA' : timeOfDayPT(game.dateLocal)) : display.statusLabel.toLowerCase();
  return `${away.label} JV ${matchupJoiner(game)} ${home.label} JV ${SPORT.noun} — ${date}, ${suffix}`;
}

/** The meta description: the game's sentence, its competition and what it counts for. */
export function jvGameDescription(model: JvGameModel): string {
  return `JV: ${model.display.sentence} ${model.competition.name}, ${model.whenLabel}. ${model.countsAs.detail}`;
}

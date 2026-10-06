/**
 * The pure display helper behind StatusLabel, GameRow, GameCard, GameLogRow and ScoreBoard.
 *
 * DESIGN §5.2 is a table of eleven rows; this module is the single place that table is
 * implemented, and tests/ui/render-score.test.ts walks every row of it. Nothing in
 * components/ PRINTS `game.home.score` / `game.away.score`: every printed score comes from
 * `renderScore()` in lib/format.ts (directly, or through `describeGame()`), and every glyph from
 * `scoreGlyph()`. The raw reads that remain are null-guarded comparisons and arithmetic that
 * print no score: the level check in game-view's `resultConflictNoteFor` and its
 * `isOneGoalFinal`, day-summary's headline-game margin and leaders-view's goal totals.
 *
 * Deviation from DESIGN §5.2 worth knowing: the data model has no `cancelled` status, because
 * MaxPreps contestState 1 (Deleted) rows are dropped rather than stored (SPEC §5.5.2). The
 * cancelled branch below is therefore reachable only if a future source adds the status; it is
 * kept so the §5.2 table stays implemented end to end.
 */

import { EN_DASH, MINUS, renderScore, scoreGlyph, scoreSentence, shootoutPhrases, timeOfDay } from '../../lib/format';
import { LEAGUES, findDivision, findLeague, getSection, type SectionConfig, type ShootoutInference } from '../../lib/leagues';
import { getTeamBySlug } from '../../lib/teams';
import type { Game, LeagueId, Outcome, PostseasonTag, ScoreView, TeamSlug } from '../../lib/types';

/** The chip a side or a row carries. `none` = no chip at all (a scheduled game). */
export type ChipKind = Outcome | 'pending' | 'cancelled' | 'postponed' | 'none';

export type StatusTone = 'ink' | 'ink-2' | 'ink-3' | 'accent';

export interface SideView {
  name: string;
  /**
   * The registry's short name for one of the teams this site follows ("Mitty", "Sobrato"), and the source
   * name unchanged for everyone else. A dense row — a game list, a bracket — renders this, because
   * the row gives the name roughly 120px once the score and the status label have taken their
   * share and "Archbishop Mitty High School" truncates to "Archbish…". The full name stays on the
   * side view for a page that has room for it, and in `sentence`, which is what a screen reader
   * hears.
   */
  shortName: string;
  slug: TeamSlug | null;
  /** '7', a genuine '0', or an en dash. Never coerced (DESIGN §5.3). */
  glyph: string;
  /** false ⇒ the glyph is the en dash and carries an sr-only "score not reported". */
  hasScore: boolean;
  /** Winner-by-weight is the fourth redundant channel (DESIGN §6.5, R-19). */
  weight: 'winner' | 'loser' | 'level';
  chip: ChipKind;
}

export interface GameDisplay {
  kind: ScoreView['kind'] | 'cancelled';
  /** FINAL · LIVE · SCORE NOT REPORTED · POSTPONED · CANCELLED · '5:30 PM' · TIME TBA */
  statusLabel: string;
  statusTone: StatusTone;
  /** The body sentence under a row that needs one, e.g. the unreported promise. */
  note: string | null;
  /**
   * Mono superscript tags after the score: 'OT', '2 OT', 'SO', 'F'. 'SO' is a shootout win in a section
   * whose shootouts are verified (SectionConfig.shootout.inference 'verified': the EAL's 1 v 1s). A San
   * Diego Section level final MaxPreps marks W and L carries no tag: no source confirms a shootout decided
   * it, so the row shows the level score and the W/L chips, and the sentence says the win is credited.
   */
  deciderTag: string | null;
  /**
   * The words a screen reader hears for an 'SO' `deciderTag`, in the words of the section whose rule
   * decided the game (SectionConfig.shootout.words through `shootoutPhrases(…).decidedOn`): 'decided
   * on 1 v 1s' for an EAL game (the Northern Section's 1 v 1s, the string StatusLabel has always
   * read). Resolved here, on the server, because StatusLabel is client-safe and cannot read the
   * registry; the home My-team card carries it through its slim marks. null whenever `deciderTag` is not
   * 'SO', so null for every San Diego Section game (its inference is 'unverified').
   */
  shootoutLabel: string | null;
  /** '(4–3 SO)' — never produced by this league (By-Laws Article IV) but modelled. */
  shootoutText: string | null;
  /**
   * Non-league carries the word, a 2px rule and (in MarginStrip) an outline column. From
   * `countsFor` (SPEC §10.4): a game that counts for no division table and is not a postseason
   * game. A postseason game carries `postseasonTag` instead.
   */
  isNonLeague: boolean;
  /** The league chip (`SCVAL`, `BVAL`, …) of a counted game: the league of `countsFor`. null otherwise. */
  leagueTag: string | null;
  /**
   * `SCVAL crossover` · `BVAL play-in` · `MCAL tournament` · `EAL Super Regional` · `San Diego Section
   * playoffs` · `CCS` when `postseason` is set.
   */
  postseasonTag: string | null;
  /** 'si.com' when D2 published si.com's score (`provenance.scores === 'sblive'`): the † marker. */
  sourceMark: 'si.com' | null;
  /** A forfeit is excluded from GF/GA/GD and from MarginStrip; the row prints a dagger. */
  isForfeit: boolean;
  /** true ⇒ render the two score cells. false ⇒ the time/label takes the column. */
  showScores: boolean;
  /** Only the TIME is struck through on a cancelled game; names never are. */
  strikeTime: boolean;
  /** LIVE gets an 8px accent dot, a pulse, and the words "scheduled window". */
  liveDot: boolean;
  home: SideView;
  away: SideView;
  /** 'vs' | 'at' from `perspective`'s point of view; null when there is no perspective. */
  versus: 'vs' | 'at' | null;
  /** The result from `perspective`'s side, for a form chip or a game-log row. */
  perspectiveOutcome: Outcome | null;
  /** One screen-reader sentence for the whole score (DESIGN §10.6). */
  sentence: string;
}

const UNREPORTED_NOTE = 'We will update when MaxPreps posts it.';

/** The word after the league's short name in a postseason chip; `ccs` is the section's own chip. */
const POSTSEASON_WORD: Readonly<Record<PostseasonTag['kind'], string | null>> = {
  'scval-crossover': 'crossover',
  'bval-play-in': 'play-in',
  'mcal-tournament': 'tournament',
  // The fallback word; an unbracketed league's tag names its event instead (postseasonTagOf).
  'league-postseason': 'postseason',
  // Never prefixed by a league: the San Diego Section's playoffs are one tournament across its three
  // conferences, so the chip is the event's own name ('San Diego Section playoffs', postseasonTagOf).
  'section-playoffs': 'playoffs',
  ccs: null,
  other: null,
};

/**
 * ` · SCVAL` after a side from a league other than the list's own (`scopeLeague`); '' otherwise,
 * and '' for a side outside the registry or a list with no league of its own. The one rule behind
 * GameRow's and LatestScores' cross-league names.
 */
export function otherLeagueSuffix(slug: TeamSlug | null, scopeLeague: LeagueId | null | undefined): string {
  if (!scopeLeague || !slug) return '';
  const team = getTeamBySlug(slug);
  if (!team || team.league === scopeLeague) return '';
  const league = findLeague(team.league);
  return league ? ` · ${league.shortName}` : '';
}

/** The league chip of a counted game (`countsFor` → its league's short name). */
function leagueTagOf(game: Pick<Game, 'countsFor'>): string | null {
  if (game.countsFor === null) return null;
  const division = findDivision(game.countsFor);
  return division ? (findLeague(division.leagueId)?.shortName ?? null) : null;
}

/**
 * The section-playoffs league of a tag or, when the tag names no league (a San Diego playoff game between two
 * conferences: lib/classify.ts sets leagueId null), of a registry side; null when neither has one.
 */
function sectionPlayoffsName(
  tag: PostseasonTag,
  game: Partial<Pick<Game, 'home' | 'away'>>,
): string | null {
  const leagueIds = [
    tag.leagueId,
    ...[game.home, game.away].map((side) => (side?.slug ? (getTeamBySlug(side.slug)?.league ?? null) : null)),
  ];
  for (const id of leagueIds) {
    const league = id ? findLeague(id) : undefined;
    if (league?.postseason.kind === 'section-playoffs') return league.postseason.name;
  }
  return null;
}

/**
 * `SCVAL crossover`, `BVAL play-in`, `MCAL tournament`, `EAL Super Regional`, `San Diego Section
 * playoffs`, `CCS`; null for no or an unnamed postseason. Pass the sides too (a whole Game does): a San
 * Diego playoff game between two conferences carries no league on its tag, and its sides name the event.
 */
export function postseasonTagOf(game: Pick<Game, 'postseason'> & Partial<Pick<Game, 'home' | 'away'>>): string | null {
  const tag = game.postseason;
  if (!tag) return null;
  if (tag.kind === 'ccs') return 'CCS';
  if (tag.kind === 'section-playoffs') return sectionPlayoffsName(tag, game);
  const word = POSTSEASON_WORD[tag.kind];
  if (!word) return null;
  // Every league kind carries its league (lib/classify.ts postseasonTag); only 'ccs', 'other' and
  // 'section-playoffs' may not.
  if (tag.leagueId === null) return null;
  const league = findLeague(tag.leagueId);
  if (!league) return null;
  // An unbracketed league's postseason has a name of its own ('EAL Super Regional').
  if (tag.kind === 'league-postseason' && league.postseason.kind === 'unbracketed-tournament') {
    return `${league.shortName} ${league.postseason.name}`;
  }
  return `${league.shortName} ${word}`;
}

/** The three kinds of game the site tells apart (SPEC §10.4). */
export type GameKind = 'league' | 'postseason' | 'non-league';

/**
 * What kind of game this is (SPEC §10.4): `league` when it counts for a division table
 * (`countsFor`), else `postseason` when it carries a postseason tag, else `non-league`. The one
 * definition of the split; `isNonLeague` below and every count of league, postseason and
 * non-league games read it.
 */
export function gameKind(game: Pick<Game, 'countsFor' | 'postseason'>): GameKind {
  if (game.countsFor !== null) return 'league';
  return game.postseason !== null ? 'postseason' : 'non-league';
}

const GAME_KIND_LABEL: Readonly<Record<GameKind, 'League' | 'Postseason' | 'Non-league'>> = {
  league: 'League',
  postseason: 'Postseason',
  'non-league': 'Non-league',
};

/**
 * The one word for what kind of game this is, as the team page's Last and Next headers print it
 * (SPEC §10.4): `League` for a counted game, `Postseason` for a tagged one, `Non-league` otherwise.
 */
export function gameKindLabel(game: Pick<Game, 'countsFor' | 'postseason'>): 'League' | 'Postseason' | 'Non-league' {
  return GAME_KIND_LABEL[gameKind(game)];
}

function chipsFor(game: Game): Pick<GameDisplay, 'isNonLeague' | 'leagueTag' | 'postseasonTag' | 'sourceMark'> {
  return {
    isNonLeague: gameKind(game) === 'non-league',
    leagueTag: leagueTagOf(game),
    postseasonTag: postseasonTagOf(game),
    sourceMark: game.provenance.scores === 'sblive' ? 'si.com' : null,
  };
}
const LIVE_NOTE = 'A scheduled window, not a running score — we do not collect live scores.';

/**
 * The section both sides are teams of when it ends a level varsity game with a shootout
 * (SectionConfig.shootout: the Northern Section's 1 v 1s, the San Diego Section's shootout), else null.
 * The same rule lib/normalize.ts writes decider 'SO' by, so every 'SO' game has one.
 */
export function shootoutSectionOf(game: Pick<Game, 'home' | 'away'>): SectionConfig | null {
  const home = game.home.slug ? getTeamBySlug(game.home.slug) : undefined;
  const away = game.away.slug ? getTeamBySlug(game.away.slug) : undefined;
  if (!home || !away || home.section !== away.section) return null;
  const section = getSection(home.section);
  return section.shootout ? section : null;
}

/**
 * What shootout copy calls the teams a section's rule covers: the section's one covered league when it
 * has just one ('EAL': every EAL string has always said "the EAL’s rules", "two EAL teams"), else the
 * section ('San Diego Section': its rule covers the City, North County and Metro conferences alike, and
 * a game between two of them). lib/backfill.ts words its D24 note by the same rule.
 */
export function shootoutGroupName(section: Pick<SectionConfig, 'id' | 'name'>): string {
  const leagues = LEAGUES.filter((l) => l.sectionId === section.id);
  return leagues.length === 1 ? leagues[0].shortName : section.name;
}

/**
 * A section shootout citation split into its source and its procedure: 'Northern Section Field Hockey
 * Guidelines §VII.E.4 (one 10-minute sudden-victory period, then 1 v 1s)' → source 'Northern Section
 * Field Hockey Guidelines §VII.E.4', procedure 'a 10-minute sudden-victory period, then 1 v 1s'. The
 * procedure follows "a level varsity game goes to", so a leading count word 'one' reads as 'a' (the
 * EAL's game-page sentence, pinned by tests, has always said "goes to a 10-minute …"). A citation
 * without a parenthesis is all source, with no procedure.
 */
export function shootoutCitationParts(citation: string): { source: string; procedure: string | null } {
  const m = /^(.*?) \((.*)\)$/.exec(citation);
  if (!m) return { source: citation, procedure: null };
  return { source: m[1], procedure: m[2].replace(/^one /, 'a ') };
}

/**
 * The section whose shootout rule covers this game: `shootoutSectionOf`, unless the game is a tournament
 * row (contestType 2 on either side) and the rule does not reach tournaments (SectionConfig.shootout.
 * coversTournaments false: the SDFHOA procedures cover the regular season and the playoffs only). The
 * same rule lib/normalize.ts reads 'SO' by.
 */
export function shootoutRuleSectionOf(game: Pick<Game, 'home' | 'away' | 'contestTypes'>): SectionConfig | null {
  const section = shootoutSectionOf(game);
  if (!section?.shootout) return null;
  const tournament = game.contestTypes?.home === 2 || game.contestTypes?.away === 2;
  return tournament && !section.shootout.coversTournaments ? null : section;
}

/**
 * true when MaxPreps' overtime count cannot be right for the game: a regular-season game between two
 * teams of a section that plays one overtime period and then a shootout (`shootoutRuleSectionOf`: the
 * EAL's 1 v 1s; the San Diego Section's shootout, outside a tournament) with more than one overtime period
 * recorded. MaxPreps may have stored the shootout win as a goal, so the view shows the score as MaxPreps
 * has it with no overtime tag and no "after overtime".
 *
 * Keyed on the section, as lib/normalize.ts keys 'SO', not on the table the game counts in: Mission Hills
 * 1, Del Norte 2 (Sep 14, 59b0f6a5, Valley v Palomar, countsFor null) has 2 overtime periods recorded and
 * read '(2 OT)', which the San Diego rule of one period then a shootout cannot give. A postseason-tagged
 * game is left alone: the SDFHOA playoff procedure is one full 10-minute period, then a 10-minute
 * sudden-victory period, so a San Diego playoff game can show '2 OT'.
 */
export function overtimeInDoubt(game: Game): boolean {
  if (game.otPeriods <= 1 || (game.postseason !== null && game.postseason !== undefined)) return false;
  return shootoutRuleSectionOf(game) !== null;
}

/** The section's shootout inference for an 'SO' game ('verified' when no section rule is found). */
function shootoutInferenceOf(game: Pick<Game, 'home' | 'away'>): ShootoutInference {
  return shootoutSectionOf(game)?.shootout?.inference ?? 'verified';
}

/**
 * The accessible words of an 'SO' decider tag (GameDisplay.shootoutLabel). Every 'SO' game has a
 * shootout section (lib/normalize.ts writes 'SO' by the same rule), so the generic 'a shootout' — true
 * of any shootout — is reached only by a hand-built game whose sides are outside the registry.
 */
function shootoutLabelFor(game: Game, deciderTag: string | null): string | null {
  if (deciderTag !== 'SO') return null;
  return shootoutPhrases(shootoutSectionOf(game)?.shootout?.words ?? 'a shootout').decidedOn;
}

function deciderTagFor(game: Game): string | null {
  if (game.isForfeit || game.decider === 'FORFEIT') return 'F';
  // A shootout win with no stored tally (an EAL 1 v 1 win); a game with a tally prints it as
  // `shootoutText` instead. A San Diego level W/L final gets no tag: the shootout is not verified.
  if (game.decider === 'SO') return game.shootout || shootoutInferenceOf(game) === 'unverified' ? null : 'SO';
  if (overtimeInDoubt(game)) return null;
  if (game.decider === '2OT') return '2 OT';
  if (game.decider === 'OT') return 'OT';
  return null;
}

function sideView(
  name: string,
  slug: TeamSlug | null,
  score: number | null,
  weight: SideView['weight'],
  chip: ChipKind,
): SideView {
  const team = slug ? getTeamBySlug(slug) : undefined;
  return {
    name,
    shortName: team?.shortName ?? name,
    slug,
    glyph: scoreGlyph(score),
    hasScore: score !== null,
    weight,
    chip,
  };
}

/**
 * Everything a game row needs in order to render, derived once. `perspective` is one of our
 * team slugs; it orients "vs / at" and the W/L/T without changing the away-on-top layout.
 */
export function describeGame(game: Game, perspective?: TeamSlug | null): GameDisplay {
  const view = renderScore(game);
  const isForfeit = game.isForfeit;
  const mineIsHome = perspective ? game.home.slug === perspective : null;
  const versus: GameDisplay['versus'] =
    mineIsHome === null ? null : game.site === 'neutral' ? 'vs' : mineIsHome ? 'vs' : 'at';

  const base = {
    note: null as string | null,
    deciderTag: null as string | null,
    shootoutLabel: null as string | null,
    shootoutText: null as string | null,
    ...chipsFor(game),
    isForfeit,
    strikeTime: false,
    liveDot: false,
    versus,
    sentence: scoreSentence(game, {
      quietOvertime: overtimeInDoubt(game),
      shootoutWords: shootoutSectionOf(game)?.shootout?.words ?? null,
      shootoutInference: shootoutSectionOf(game)?.shootout?.inference ?? null,
    }),
  };

  switch (view.kind) {
    case 'final': {
      const deciderTag = deciderTagFor(game);
      const homeWon = view.outcome === 'W';
      const awayWon = view.outcome === 'L';
      const tie = view.outcome === 'T';
      const homeChip: ChipKind = tie ? 'T' : homeWon ? 'W' : 'L';
      const awayChip: ChipKind = tie ? 'T' : awayWon ? 'W' : 'L';
      const perspectiveOutcome: Outcome | null =
        mineIsHome === null
          ? null
          : tie
            ? 'T'
            : mineIsHome === homeWon
              ? 'W'
              : 'L';
      return {
        ...base,
        kind: 'final',
        statusLabel: 'FINAL',
        statusTone: 'ink-3',
        deciderTag,
        shootoutLabel: shootoutLabelFor(game, deciderTag),
        shootoutText: view.shootout
          ? `(${view.shootout.home}${EN_DASH}${view.shootout.away} SO)`
          : null,
        showScores: true,
        home: sideView(
          game.home.name,
          game.home.slug,
          view.home,
          tie ? 'level' : homeWon ? 'winner' : 'loser',
          homeChip,
        ),
        away: sideView(
          game.away.name,
          game.away.slug,
          view.away,
          tie ? 'level' : awayWon ? 'winner' : 'loser',
          awayChip,
        ),
        perspectiveOutcome,
      };
    }
    case 'unreported':
      return {
        ...base,
        kind: 'unreported',
        statusLabel: 'SCORE NOT REPORTED',
        statusTone: 'ink-3',
        note: UNREPORTED_NOTE,
        showScores: true, // two en dashes, never two zeroes
        home: sideView(game.home.name, game.home.slug, null, 'level', 'pending'),
        away: sideView(game.away.name, game.away.slug, null, 'level', 'pending'),
        perspectiveOutcome: null,
      };
    case 'live':
      return {
        ...base,
        kind: 'live',
        statusLabel: 'LIVE',
        statusTone: 'accent',
        note: LIVE_NOTE,
        liveDot: true,
        showScores: false,
        home: sideView(game.home.name, game.home.slug, null, 'level', 'none'),
        away: sideView(game.away.name, game.away.slug, null, 'level', 'none'),
        perspectiveOutcome: null,
      };
    case 'postponed':
      return {
        ...base,
        kind: 'postponed',
        statusLabel: 'POSTPONED',
        statusTone: 'ink-3',
        note: view.newDate ? null : 'A new date has not been posted.',
        showScores: false,
        strikeTime: true,
        home: sideView(game.home.name, game.home.slug, null, 'level', 'postponed'),
        away: sideView(game.away.name, game.away.slug, null, 'level', 'postponed'),
        perspectiveOutcome: null,
      };
    case 'scheduled':
      return {
        ...base,
        kind: 'scheduled',
        statusLabel: view.time ?? 'TIME TBA',
        statusTone: 'ink-2',
        showScores: false,
        home: sideView(game.home.name, game.home.slug, null, 'level', 'none'),
        away: sideView(game.away.name, game.away.slug, null, 'level', 'none'),
        perspectiveOutcome: null,
      };
  }
}

/**
 * The §5.2 "cancelled" row. The status does not exist in the snapshot today (contestState 1 rows
 * are dropped), so this is reached only through an explicit call — it keeps the table complete
 * and gives /about#conventions something true to document.
 */
export function describeCancelled(game: Game, note: string | null = null): GameDisplay {
  return {
    kind: 'cancelled',
    statusLabel: 'CANCELLED',
    statusTone: 'ink-3',
    note,
    deciderTag: null,
    shootoutLabel: null,
    shootoutText: null,
    ...chipsFor(game),
    sourceMark: null,
    isForfeit: false,
    showScores: false,
    strikeTime: true,
    liveDot: false,
    home: sideView(game.home.name, game.home.slug, null, 'level', 'cancelled'),
    away: sideView(game.away.name, game.away.slug, null, 'level', 'cancelled'),
    versus: game.site === 'neutral' ? 'vs' : null,
    perspectiveOutcome: null,
    sentence: `${game.away.name} versus ${game.home.name}: cancelled.`,
  };
}

/**
 * true when a game's status label IS its own clock time ("4:00 PM", "TIME TBA") — every
 * scheduled game. A row, a card, a log line or the scoreboard that already prints the time then
 * has nothing left to say in the status slot but the NL tag; printing the label as well read
 * "3:30 PM … 3:30 PM". One definition, so GameRow, GameCard, GameLogRow and ScoreBoard cannot
 * drift apart on what counts as "a time".
 */
export function statusLabelIsTime(game: Game, statusLabel: string): boolean {
  return (
    statusLabel === 'TIME TBA' || (!game.isTimeTba && statusLabel === timeOfDay(game.dateLocal))
  );
}

/** '+3' / '−7' / '0' for a per-game margin. */
export function signedMargin(margin: number): string {
  if (margin === 0) return '0';
  return margin > 0 ? `+${margin}` : `${MINUS}${Math.abs(margin)}`;
}

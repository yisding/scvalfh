/**
 * Classification: which division's table a game belongs to, decided ONCE (in the pipeline, and in
 * the v1 migration) and persisted as `Game.countsFor` (SPEC §5.1). Pure: no I/O, no clock.
 *
 * Membership of the same division (`Game.leagueDivision`) is always necessary, never sufficient:
 *  - SCVAL keeps its original contest-type evidence (`isLeague`) and excludes only CCS section games,
 *    so its tables stay byte-identical to the goldens;
 *  - the EAL and the Sunset publish no schedule, so they are classified by contest type too, and also
 *    exclude their own postseason (the EAL's Super Regional) and their `excludeContestTypes` rows;
 *  - BVAL, PCAL and MCAL count a game only when it matched a fixture of that division in the
 *    league's official schedule, and never a postseason game or a contestType 2/4 row;
 *  - the San Diego divisions ('membership', DESIGN-socal §2.1.7) count every game between two members
 *    dated inside the division's leaguePlay, whatever MaxPreps' league flag says: division-mates
 *    play each other home and away on MaxPreps' schedules (a double round robin; on Mon Oct 5 Pacific
 *    every pair was listed twice except Bonita Vista and Helix, once), while MaxPreps flags as few as 0
 *    of Patrick Henry's 10 as league games;
 *  - the LA independents (Bonita, Chaminade, Glendora, Harvard-Westlake and Thousand Oaks,
 *    five schools in no field hockey league; DESIGN §24.10) are a 'membership' division too: every game
 *    between two of them inside the group's leaguePlay counts for its table, though MaxPreps flags only
 *    Bonita's two games with Chaminade.
 *
 * Three San Diego additions sit beside the rule (all pure, all in `classifyGames`):
 *  - a game MaxPreps flags as a league game between two DIVISIONS of one league whose divisions publish
 *    no schedule (Mission Bay's five games against City Eastern teams) counts in neither table and says
 *    why in `provenance.classificationNote`;
 *  - the Section's own playoffs (Nov 2-14) get one tag, 'section-playoffs', whether or not the two
 *    sides share a conference;
 *  - a game counted by membership whose MaxPreps recap calls it a "non-conference" or "non-league" game
 *    loses the recap (`contradictedRecap`): the page would otherwise print MaxPreps' words, unattributed,
 *    beside "League game · Valley".
 */

import { CCS, LEAGUES } from './leagues';
import type { LeagueConfig } from './leagues';
import { teamOfSide } from './teams';
import type { DivisionId, Game, LeagueId, PostseasonTag, Team } from './types';

export interface ClassifyOptions {
  /** Divisions whose official fixture file is missing/invalid this run: classified by contest-type, never by membership alone. */
  degradedDivisions?: ReadonlySet<DivisionId>;
}

/** Read the config at call time (tests override leagues through vi.mock). */
function leagueById(id: LeagueId): LeagueConfig | undefined {
  return LEAGUES.find((l) => l.id === id);
}

function leagueOfDivisionId(id: DivisionId): LeagueConfig | undefined {
  return LEAGUES.find((l) => l.divisions.some((d) => d.id === id));
}

/** Leagues of the registry sides (0, 1 or 2 distinct), home side first. */
export function leaguesOf(game: Pick<Game, 'home' | 'away'>): LeagueId[] {
  const out: LeagueId[] = [];
  for (const side of [game.home, game.away]) {
    const team = teamOfSide(side);
    if (team && !out.includes(team.league)) out.push(team.league);
  }
  return out;
}

/** The one league both sides are registry members of, or null. */
function sharedLeague(game: Pick<Game, 'home' | 'away'>): LeagueConfig | null {
  const home = teamOfSide(game.home);
  const away = teamOfSide(game.away);
  if (!home || !away || home.league !== away.league) return null;
  return leagueById(home.league) ?? null;
}

/**
 * The section both sides are registry teams of when every league they play in has the section's own playoffs
 * (postseason.kind 'section-playoffs': the San Diego Section's City, North County and Metro), else null. Two
 * teams of one section can be in two leagues (a City–Metro playoff game), so this never asks for a shared league.
 */
function sectionPlayoffsPair(
  home: Team | undefined,
  away: Team | undefined,
): { home: LeagueConfig; away: LeagueConfig } | null {
  if (!home || !away || home.section !== away.section) return null;
  const h = leagueById(home.league);
  const a = leagueById(away.league);
  if (!h || !a || h.postseason.kind !== 'section-playoffs' || a.postseason.kind !== 'section-playoffs') return null;
  return { home: h, away: a };
}

/**
 * In order; first match wins:
 *  1. CONFIG PAIRING: game.dateKey === pairing.date, one side in each pairing division (any places), both sides
 *     in the pairing's league → { kind: pairing.tag, leagueId, via: 'config-pairing' }.
 *  2. contestType 4 on either row → { kind, leagueId: the shared league or null, via: 'contest-type-4' }, where kind
 *     is 'mcal-tournament' when both sides are in one league whose postseason.kind is 'league-tournament';
 *     'league-postseason' when it is 'unbracketed-tournament' (the EAL's Super Regional); else 'ccs' when at least
 *     one registry side is in a CCS league and no registry side is in a league of another section (a CCS game is
 *     between CCS teams); else 'other' (an MCAL or EAL team against a non-registry team or a team of another
 *     section or league, or no registry side at all).
 *     Before that: both sides teams of ONE section whose leagues' postseason.kind is 'section-playoffs' (the San
 *     Diego Section) → { kind: 'section-playoffs', leagueId: the shared league or null, via: 'contest-type-4' }.
 *  2b. both sides members of one CCS league (postseason.kind 'ccs-ladder') and game.dateKey >=
 *     CCS.keyDates.quarterfinals → { kind: 'ccs', leagueId: that league, via: 'ccs-window' }.
 *  2c. both sides teams of one section whose leagues' postseason.kind is 'section-playoffs', game.dateKey >= both
 *     leagues' rules.postseasonFrom (Nov 2, the play-ins), and contestId in neither league's leagueGameOverrides →
 *     { kind: 'section-playoffs', leagueId: the shared league or null, via: 'section-postseason-window' }. Ahead of
 *     rule 3, so a San Diego playoff game between two teams of one conference is never 'league-postseason': the
 *     Section's playoffs are one tournament with one label (DESIGN-socal §2.1.7).
 *  3. both sides members of one league L with rules.postseasonFrom, game.dateKey >= postseasonFrom, and
 *     contestId NOT in L.rules.leagueGameOverrides → { kind, leagueId: L, via: 'league-postseason-window' }, where
 *     kind is 'mcal-tournament' for a 'league-tournament' league and 'league-postseason' otherwise (the EAL).
 *  4. null.
 */
export function postseasonTag(game: Game): PostseasonTag | null {
  const home = teamOfSide(game.home);
  const away = teamOfSide(game.away);
  const league = sharedLeague(game);

  // 1. a configured pairing (SCVAL crossover ×4, BVAL play-in)
  if (league && home && away && league.postseason.kind === 'ccs-ladder') {
    for (const pairing of league.postseason.pairings) {
      if (pairing.date !== game.dateKey) continue;
      const [a, b] = pairing.seats;
      const oneEach =
        (home.division === a.division && away.division === b.division) ||
        (home.division === b.division && away.division === a.division);
      if (oneEach) return { kind: pairing.tag, leagueId: league.id, via: 'config-pairing' };
    }
  }

  const sectionPlayoffs = sectionPlayoffsPair(home, away);

  // 2. MaxPreps' own postseason flag on either row
  const types = game.contestTypes ?? { home: null, away: null };
  if (types.home === 4 || types.away === 4) {
    if (sectionPlayoffs) return { kind: 'section-playoffs', leagueId: league ? league.id : null, via: 'contest-type-4' };
    let kind: PostseasonTag['kind'];
    if (league?.postseason.kind === 'league-tournament') kind = 'mcal-tournament';
    else if (league?.postseason.kind === 'unbracketed-tournament') kind = 'league-postseason';
    else {
      const sections = [home, away]
        .filter((t): t is Team => t !== undefined)
        .map((t) => leagueById(t.league)?.sectionId ?? null);
      kind = sections.length > 0 && sections.every((s) => s === 'ccs') ? 'ccs' : 'other';
    }
    return { kind, leagueId: league ? league.id : null, via: 'contest-type-4' };
  }

  // 2b. the CCS bracket window
  if (league && league.postseason.kind === 'ccs-ladder' && game.dateKey >= CCS.keyDates.quarterfinals) {
    return { kind: 'ccs', leagueId: league.id, via: 'ccs-window' };
  }

  // 2c. the section's own playoffs window (the San Diego Section from Nov 2), across conferences
  if (sectionPlayoffs) {
    const from = [sectionPlayoffs.home.rules.postseasonFrom, sectionPlayoffs.away.rules.postseasonFrom];
    const overridden =
      sectionPlayoffs.home.rules.leagueGameOverrides.includes(game.contestId) ||
      sectionPlayoffs.away.rules.leagueGameOverrides.includes(game.contestId);
    if (from.every((d): d is string => d !== null) && from.every((d) => game.dateKey >= d) && !overridden) {
      return { kind: 'section-playoffs', leagueId: league ? league.id : null, via: 'section-postseason-window' };
    }
  }

  // 3. a league's own postseason window (MCAL from Oct 23, EAL from Oct 30)
  if (
    league &&
    league.rules.postseasonFrom !== null &&
    game.dateKey >= league.rules.postseasonFrom &&
    !league.rules.leagueGameOverrides.includes(game.contestId)
  ) {
    const kind = league.postseason.kind === 'league-tournament' ? 'mcal-tournament' : 'league-postseason';
    return { kind, leagueId: league.id, via: 'league-postseason-window' };
  }

  return null;
}

/**
 * The division whose table this game belongs to, for ANY status. null unless leagueDivision !== null. Then by the
 * division's league rule:
 *  - 'membership' (the San Diego divisions and the LA independents):
 *        null if game.postseason !== null
 *        null if contestTypes.home or contestTypes.away ∈ rules.excludeContestTypes ([2, 4]: tournament and
 *          postseason rows)
 *        null unless division.leaguePlay.first <= game.dateKey <= division.leaguePlay.last
 *        else leagueDivision — whatever MaxPreps' league flag (`isLeague`) says
 *  - 'contest-type' (SCVAL, EAL): null unless game.isLeague; null for a 'ccs' or 'league-postseason' tag; null if
 *        contestTypes.home or contestTypes.away ∈ rules.excludeContestTypes (SCVAL's [] makes that a no-op, and
 *        SCVAL never gets a 'league-postseason' tag, so SCVAL is unchanged); else leagueDivision.
 *  - 'official-fixtures' (BVAL, PCAL, MCAL):
 *        null if game.postseason !== null
 *        null if contestTypes.home or contestTypes.away ∈ rules.excludeContestTypes
 *        if leagueDivision ∈ opts.degradedDivisions: game.isLeague ? leagueDivision : null    (never membership alone)
 *        else game.official?.division === leagueDivision ? leagueDivision : null
 */
export function classifyGame(game: Game, opts: ClassifyOptions = {}): DivisionId | null {
  const division = game.leagueDivision;
  if (division === null) return null;
  const league = leagueOfDivisionId(division);
  if (!league) return null;
  const { rules } = league;

  const types = game.contestTypes ?? { home: null, away: null };
  if (rules.classification === 'membership') {
    if (game.postseason !== null && game.postseason !== undefined) return null;
    for (const t of [types.home, types.away]) {
      if (t !== null && rules.excludeContestTypes.includes(t)) return null;
    }
    const config = league.divisions.find((d) => d.id === division);
    if (!config) return null;
    return game.dateKey >= config.leaguePlay.first && game.dateKey <= config.leaguePlay.last ? division : null;
  }
  if (rules.classification === 'contest-type') {
    if (!game.isLeague) return null;
    if (game.postseason?.kind === 'ccs') return null; // SCVAL's rule (golden)
    if (game.postseason?.kind === 'league-postseason') return null; // never produced for SCVAL
    // SCVAL [] → no-op
    for (const t of [types.home, types.away]) if (t !== null && rules.excludeContestTypes.includes(t)) return null;
    return division;
  }

  if (game.postseason !== null && game.postseason !== undefined) return null;
  for (const t of [types.home, types.away]) {
    if (t !== null && rules.excludeContestTypes.includes(t)) return null;
  }
  if (opts.degradedDivisions?.has(division)) return game.isLeague ? division : null;
  return game.official?.division === division ? division : null;
}

/**
 * The note on a game MaxPreps flags as a league game (`isLeague`) between two DIVISIONS of one league, when the
 * league is classified by contest type or by membership and neither division publishes a schedule (the San
 * Diego Section: Mission Bay, City Western, played five City Eastern teams that MaxPreps marks as league games,
 * which is why MaxPreps shows it 3-5-0). It counts in neither table (`leagueDivision` is null, so classifyGame
 * already returns null); the note says so on the game page. A fixture-backed league is left alone: its schedule
 * decides and the official match writes its own notes (SCVAL's cross-division games are golden-gated), and a
 * postseason game is explained by its tag. null otherwise.
 */
export function crossDivisionNote(game: Game): string | null {
  if (!game.isLeague || game.postseason) return null;
  const home = teamOfSide(game.home);
  const away = teamOfSide(game.away);
  if (!home || !away || home.league !== away.league || home.division === away.division) return null;
  const league = leagueById(home.league);
  if (!league || (league.rules.classification !== 'contest-type' && league.rules.classification !== 'membership')) {
    return null;
  }
  const divisions = league.divisions.filter((d) => d.id === home.division || d.id === away.division);
  if (divisions.length !== 2 || divisions.some((d) => d.official.mode !== 'none')) return null;
  return `MaxPreps marks this as a league game; it is between two divisions of the ${league.name}, so it counts in neither table.`;
}

/** MaxPreps' recap words that say a game is not a league game ("…won their away non-conference game…"). */
const NON_LEAGUE_RECAP = /\bnon-(conference|league)\b/i;

/**
 * Whether a game's MaxPreps recap contradicts the site's own classification of it: the game counts for a
 * division classified by 'membership' (the San Diego divisions) and the recap calls it a non-conference or
 * non-league game. MaxPreps writes the recap from its own league flag, which the membership rule overrides
 * on purpose (it flags as few as 0 of Patrick Henry's 10 division games), so the recap is wrong by the
 * Section's alignment: "San Pasqual won their away non-conference game against Westview." on a Valley game
 * (fb944ba7, Sep 2026), printed as the game page's body and meta description beside "League game · Valley".
 *
 * Such a recap is dropped, never rewritten: it is MaxPreps' sentence, and editing a word out would publish an
 * altered quote. With recap null the game page, its meta description and the game rows fall back to the
 * forms they use for every game MaxPreps wrote no recap for. Only 'membership' divisions: a fixture-backed
 * or contest-type league's recap is left as it is (BVAL's Prospect at Live Oak, 258b9301, says
 * "non-conference" because MaxPreps counts four of Prospect's official league games as non-league, which
 * that division's knownCause says; it keeps its recap).
 */
export function contradictedRecap(game: Pick<Game, 'countsFor' | 'recap'>): boolean {
  if (game.countsFor === null || game.recap === null || !NON_LEAGUE_RECAP.test(game.recap)) return false;
  return leagueOfDivisionId(game.countsFor)?.rules.classification === 'membership';
}

/**
 * Sets postseason (if not already set), then countsFor, on a copy of every game; a game that `crossDivisionNote`
 * explains also gets that note as `provenance.classificationNote`, unless a note is already there (the official
 * match's own); a game whose recap `contradictedRecap` gets recap null.
 */
export function classifyGames(games: readonly Game[], opts: ClassifyOptions = {}): Game[] {
  return games.map((g) => {
    const tagged: Game = { ...g, postseason: g.postseason ?? postseasonTag(g) };
    const counted: Game = { ...tagged, countsFor: classifyGame(tagged, opts) };
    const classified: Game = contradictedRecap(counted) ? { ...counted, recap: null } : counted;
    const note = classified.provenance.classificationNote ? null : crossDivisionNote(classified);
    return note ? { ...classified, provenance: { ...classified.provenance, classificationNote: note } } : classified;
  });
}

/** The UI's league / non-league tag: game.countsFor !== null. */
export function isLeagueGame(game: Pick<Game, 'countsFor'>): boolean {
  return game.countsFor !== null;
}

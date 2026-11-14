/**
 * An event's bracket from its game schedule (the 'unbracketed-tournament' kind's `bracket`, lib/league-config/
 * shape.ts: the EAL's Super Regional), joined to the games the site holds and shaped for the shared drawer
 * (components/history/bracket-view.ts BracketDivisionView → components/playoffs/Bracket.tsx), as the San Diego
 * Section's brackets are (sds-bracket-view.ts). Pure: the page hands the league's games down.
 *
 * Each bracket game's sides are resolved in playing order (a team, or the winner or loser of an earlier game),
 * then joined to the one listed game between those two teams on its day. The winner is the game's (the higher
 * score, or the marked side of a level final), or, for a game listed with no score, the side its source says won
 * (the W and L a DATA_QUALITY.addedGames entry carries). So a card can show who went through with no score, and
 * the next round still fills in; a card whose winner no source names stays open, and what depends on it reads
 * "Winner of …". The tree is the first round, the semifinals and the final; the third- and fifth-place games are
 * returned apart (`placement`), since they hang off no line of it. No seed is printed.
 */

import { EN_DASH, leagueClock, leagueClockPT, renderScore, shootoutPhrases, shortDate } from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import type { TournamentBracketGame, TournamentBracketSide } from '../../lib/league-config/shape';
import { winningSide } from '../../lib/postseason/game-winner';
import { getTeamBySlug } from '../../lib/teams';
import type { Game } from '../../lib/types';
import type { BracketCardView, BracketDivisionView, BracketRoundView, BracketSideView } from '../history/bracket-view';
import { isTbdSide } from '../history/bracket-view';
import { capitalized } from '../words/capitalized';

export interface TournamentBracketView {
  /**
   * The tree's rounds. The third- and fifth-place games hang off no line of it, so they are the last round's
   * `extra` (third place first), drawn under the final and shown with it.
   */
  division: BracketDivisionView;
}

interface Resolved {
  spec: TournamentBracketGame;
  home: string | null;
  away: string | null;
  game: Game | null;
  winner: string | null;
  loser: string | null;
}

const ROUND_NAME: Readonly<Record<TournamentBracketGame['round'], string>> = {
  'first-round': 'First round',
  semifinal: 'Semifinals',
  final: 'Final',
  'third-place': 'Third place',
  'fifth-place': 'Fifth place',
};

/** Who won a listed game: its result, or the side its source marks the winner of a game with no score. */
function winnerSlugOf(game: Game): string | null {
  const side = winningSide(game);
  if (side) return game[side].slug;
  if (game.home.score !== null || game.away.score !== null) return null;
  if (game.home.result === 'W' && game.away.result === 'L') return game.home.slug;
  if (game.away.result === 'W' && game.home.result === 'L') return game.away.slug;
  return null;
}

function resolve(specs: readonly TournamentBracketGame[], games: readonly Game[]): Map<string, Resolved> {
  const out = new Map<string, Resolved>();
  const used = new Set<string>();
  const slugOf = (side: TournamentBracketSide): string | null => {
    if ('team' in side) return side.team;
    const from = out.get('winnerOf' in side ? side.winnerOf : side.loserOf);
    return from ? ('winnerOf' in side ? from.winner : from.loser) : null;
  };
  for (const spec of specs) {
    const home = slugOf(spec.home);
    const away = slugOf(spec.away);
    const game =
      home && away
        ? (games.find(
            (g) => g.dateKey === spec.date && !used.has(g.contestId) && [g.home.slug, g.away.slug].includes(home) && [g.home.slug, g.away.slug].includes(away),
          ) ?? null)
        : null;
    if (game) used.add(game.contestId);
    const winner = game ? winnerSlugOf(game) : null;
    out.set(spec.id, { spec, home, away, game, winner, loser: winner === null ? null : winner === home ? away : home });
  }
  return out;
}

/** 'Chico', or 'the winner of Chico v Corning' while the earlier game has no known winner. */
function sideView(side: TournamentBracketSide, slug: string | null, resolved: ReadonlyMap<string, Resolved>): BracketSideView {
  const team = slug ? getTeamBySlug(slug) : undefined;
  if (team) return { seed: null, slug: team.slug, name: team.name };
  if ('team' in side) return { tbd: side.team };
  const from = resolved.get('winnerOf' in side ? side.winnerOf : side.loserOf);
  const name = (s: string | null) => (s ? (getTeamBySlug(s)?.shortName ?? s) : 'TBD');
  const pair = from ? `${name(from.home)} v ${name(from.away)}` : 'an earlier game';
  return { tbd: `${'winnerOf' in side ? 'Winner' : 'Loser'} of ${pair}` };
}

const sideWords = (side: BracketSideView): string => (isTbdSide(side) ? `the ${side.tbd.charAt(0).toLowerCase()}${side.tbd.slice(1)}` : side.name);

function cardOf(r: Resolved, resolved: ReadonlyMap<string, Resolved>, today: string, words: string, roundDate: string): BracketCardView {
  const top = sideView(r.spec.home, r.home, resolved);
  const bottom = sideView(r.spec.away, r.away, resolved);
  const view = r.game ? renderScore(r.game) : null;
  const score: readonly [number, number] | null =
    r.game && view?.kind === 'final' ? (r.game.home.slug === r.home ? [view.home, view.away] : [view.away, view.home]) : null;
  const winner = r.winner === null ? null : r.winner === r.home ? 'top' : 'bottom';
  const status: BracketCardView['status'] =
    winner !== null || r.game?.status === 'final' ? 'final' : r.game?.status === 'score-pending' || r.spec.date < today ? 'unreported' : 'scheduled';
  const when = `${shortDate(r.spec.date)} · ${leagueClockPT(r.spec.time)}`;
  const at = `At ${r.spec.venue}`;
  const a = capitalized(sideWords(top));
  const b = sideWords(bottom);
  const notes: string[] = [];
  let sentence: string;
  if (status === 'final') {
    const [w, l] = winner === 'bottom' ? [bottom, top] : [top, bottom];
    const W = capitalized(sideWords(w));
    const decider = r.game?.decider ?? null;
    const tally = r.game?.shootout ? `${Math.max(r.game.shootout.home, r.game.shootout.away)}${EN_DASH}${Math.min(r.game.shootout.home, r.game.shootout.away)}` : null;
    const { onPhrase } = shootoutPhrases(words);
    if (score === null && winner === null) {
      // Final with neither a score nor a winner marked: nothing says who won.
      notes.push('No result posted');
      sentence = `${a} played ${b}; no result was posted.`;
    } else if (score === null) {
      notes.push('No score posted');
      sentence = `${W} beat ${sideWords(l)}; no score was posted.`;
    } else if (winner === null) {
      sentence = `${a} and ${b} drew ${score[0]}${EN_DASH}${score[1]}.`;
    } else {
      const [wg, lg] = winner === 'top' ? score : [score[1], score[0]];
      const s = `${wg}${EN_DASH}${lg}`;
      if (decider === 'SO') {
        const ot = r.game && r.game.otPeriods >= 2 ? ' after double overtime' : r.game && r.game.otPeriods === 1 ? ' after overtime' : '';
        notes.push(`${capitalized(onPhrase.replace(/^(on|in) /, ''))}${tally ? ` ${tally}` : ''}${ot ? `, ${ot.trim().replace(/^after /, '')}` : ''}`);
        sentence = `${W} and ${sideWords(l)} drew ${s}${ot}; ${isTbdSide(w) ? W : w.name} won ${onPhrase}${tally ? `, ${tally}` : ''}.`;
      } else if (decider === 'OT' || decider === '2OT') {
        notes.push(decider === '2OT' ? 'Double overtime' : 'Overtime');
        sentence = `${W} beat ${sideWords(l)} ${s} in ${decider === '2OT' ? 'double overtime' : 'overtime'}.`;
      } else {
        sentence = `${W} beat ${sideWords(l)} ${s}.`;
      }
    }
    // The round's heading carries its day; a game played on another says which.
    if (r.spec.date !== roundDate) notes.push(`Played ${shortDate(r.spec.date)}`);
    notes.push(at);
    sentence += ` ${at}.`;
  } else if (status === 'unreported') {
    notes.push(leagueClock(r.spec.time), at, 'No result posted');
    sentence = `${a} and ${b} were to play ${shortDate(r.spec.date)} at ${r.spec.venue}; no result is posted.`;
  } else {
    notes.push(when, at);
    sentence = `${a} plays ${b}, ${shortDate(r.spec.date)}, ${leagueClockPT(r.spec.time)}, at ${r.spec.venue}.`;
  }
  return {
    key: r.spec.id,
    top,
    bottom,
    winner,
    score,
    status,
    time: status === 'scheduled' ? when : null,
    clock: status === 'scheduled' ? leagueClock(r.spec.time) : null,
    site: r.spec.venue,
    href: r.game ? gameHref(r.game.contestId) : null,
    sentence: [sentence],
    note: notes.join(' · '),
  };
}

/**
 * The bracket of `specs` over the league's postseason `games`. `words` is the section's tiebreak ('1 v 1s' for the
 * Northern Section), for a final settled by one; `today` is getToday().
 */
export function tournamentBracketView(
  specs: readonly TournamentBracketGame[],
  games: readonly Game[],
  today: string,
  words: string,
): TournamentBracketView {
  const resolved = resolve(specs, games);
  const all = [...resolved.values()];
  const tree: TournamentBracketGame['round'][] = ['first-round', 'semifinal', 'final'];
  const rounds: BracketRoundView[] = tree.flatMap((round, index): BracketRoundView[] => {
      const here = all.filter((r) => r.spec.round === round);
      if (here.length === 0) return [];
      // The teams that come in a round later: named on the next round's cards and on none of this one's.
      const playing = new Set(here.flatMap((r) => [r.home, r.away]));
      const next = all.filter((r) => r.spec.round === tree[index + 1]);
      const byes = next
        .flatMap((r) => [r.spec.home, r.spec.away])
        .flatMap((s) => ('team' in s && !playing.has(s.team) ? [getTeamBySlug(s.team)?.name ?? s.team] : []));
      // The round's day is the day most of its games are on (the earliest of a tie).
      const dates = here.map((r) => r.spec.date).sort();
      const date = dates.reduce((best, d) => (dates.filter((x) => x === d).length > dates.filter((x) => x === best).length ? d : best), dates[0]);
      return [{
        key: round,
        name: ROUND_NAME[round],
        dateLabel: shortDate(date),
        cards: here.map((r) => cardOf(r, resolved, today, words, date)),
        byes: byes.length > 0 ? byes.join(', ') : null,
      }];
    });
  // The placement games, third place first, under the last round of the tree.
  const order: TournamentBracketGame['round'][] = ['third-place', 'fifth-place'];
  const last = rounds[rounds.length - 1];
  const lastDate = all.filter((r) => r.spec.round === last?.key).map((r) => r.spec.date).sort()[0];
  const extra = order.flatMap((round) => {
    const here = all.filter((r) => r.spec.round === round);
    return here.length > 0 ? [{ name: ROUND_NAME[round], cards: here.map((r) => cardOf(r, resolved, today, words, lastDate ?? r.spec.date)) }] : [];
  });
  if (last && extra.length > 0) last.extra = extra;
  return { division: { rounds } };
}

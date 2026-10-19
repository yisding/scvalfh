/**
 * The /game/[id] season series (components/game/SeasonSeries.tsx): every contest between the two
 * schools this season, and the one sentence that says who leads it (DESIGN §3.5).
 */

import { renderScore } from '@/lib/format/score';
import type { Game, GameSide } from '@/lib/model/game';
import { getGames } from '@/lib/queries/games';
import { byDateLocal, sideOutcome } from '@/lib/shared/game';
import { describeGame } from '@/views/shared/describe-game';

/** A stable key for one side of a contest: our slug, or the opponent's name. */
function sideKey(side: GameSide): string {
  return side.slug ?? `name:${side.name.trim().toLowerCase()}`;
}

/** Every contest between these two schools this season, in date order. */
export function seriesGames(game: Game): Game[] {
  const anchor = game.home.slug ?? game.away.slug;
  if (!anchor) return [game];
  const keyHome = sideKey(game.home);
  const keyAway = sideKey(game.away);
  return getGames({ teamId: anchor })
    .filter((g) => {
      const keys = [sideKey(g.home), sideKey(g.away)];
      return keys.includes(keyHome) && keys.includes(keyAway);
    })
    .sort(byDateLocal);
}

/** A final whose published score MaxPreps' own result flags contradict, with no si.com score over it. */
export function hasResultConflict(g: Game): boolean {
  return !!g.provenance.resultConflict && !g.provenance.backfill;
}

export function seriesSummary(game: Game, games: Game[], homeName: string, awayName: string): string {
  let homeWins = 0;
  let awayWins = 0;
  let ties = 0;
  let played = 0;
  let pending = 0;
  /** Level finals MaxPreps flags with a winner (a shootout, most likely): counted as ties, said so. */
  const flaggedTies: Game[] = [];
  const keyHome = sideKey(game.home);
  for (const g of games) {
    const display = describeGame(g);
    if (display.kind === 'unreported') {
      // Played, but no score published. It is neither a result nor a fixture (DESIGN §5.2).
      pending += 1;
      continue;
    }
    if (display.kind !== 'final') continue;
    played += 1;
    // The legs are home-and-away, so align every row on THIS game's home side. `sideOutcome`
    // is the one W/L/T rule, so a shootout win is a win here, not a tie.
    const outcome = sideOutcome(g, sideKey(g.home) === keyHome ? 'home' : 'away');
    if (outcome === 'T') {
      ties += 1;
      if (hasResultConflict(g)) flaggedTies.push(g);
    } else if (outcome === 'W') {
      homeWins += 1;
    } else {
      awayWins += 1;
    }
  }
  // The contest being viewed is in this list. Its own RESULT belongs in the series record, but it
  // is not news to the reader that it is scheduled, so the "still to play" count excludes it.
  const selfKind = describeGame(game).kind;
  const selfIsUpcoming = selfKind !== 'final' && selfKind !== 'unreported';
  const upcoming = games.length - played - pending - (selfIsUpcoming ? 1 : 0);
  const pendingOthers = pending - (selfKind === 'unreported' ? 1 : 0);

  const sentences: string[] = [];
  if (played === 0) {
    sentences.push(
      pending > 0
        ? `${awayName} and ${homeName} have met ${
            pending === 1 ? 'once' : `${pending} times`
          } this season with no score published.`
        : `${awayName} and ${homeName} have not played yet this season.`,
    );
  } else if (homeWins > awayWins) {
    sentences.push(
      `${homeName} leads the season series ${record(homeWins, awayWins, ties)}.`,
    );
  } else if (awayWins > homeWins) {
    sentences.push(
      `${awayName} leads the season series ${record(awayWins, homeWins, ties)}.`,
    );
  } else if (ties === played && flaggedTies.length > 0) {
    // MaxPreps marks a winner on a level score: "a draw" alone would contradict the recap.
    if (played === 1) {
      const g = flaggedTies[0];
      const flagged = g.home.result === 'W' ? g.home : g.away.result === 'W' ? g.away : null;
      const winner = flagged ? (sideKey(flagged) === keyHome ? homeName : awayName) : null;
      // A flagged tie is a final with both scores (sideOutcome read 'T' off them), so the view is
      // always 'final' here; the fallback only keeps the type honest.
      const meeting = renderScore(g);
      const ended = meeting.kind === 'final' ? `${meeting.home}-${meeting.away}` : 'level';
      sentences.push(
        `Their only meeting this season ended ${ended}, which this site counts as a draw; ${
          winner ? `MaxPreps lists ${winner} as the winner.` : 'MaxPreps’ result flags for it disagree.'
        }`,
      );
    } else {
      sentences.push(
        `All ${played} meetings this season ended level, which this site counts as draws; MaxPreps lists a winner for ${
          flaggedTies.length === 1 ? 'one of them' : `${flaggedTies.length} of them`
        }.`,
      );
    }
  } else if (ties === played) {
    // "level at 0-0-1" is true but unreadable; say what happened instead.
    sentences.push(
      played === 1
        ? 'Their only meeting this season was a draw.'
        : `All ${played} meetings this season were drawn.`,
    );
  } else {
    sentences.push(`The season series is level at ${record(homeWins, awayWins, ties)}.`);
  }

  if (upcoming > 0) {
    sentences.push(
      upcoming === 1
        ? 'One other meeting is still to play.'
        : `${upcoming} other meetings are still to play.`,
    );
  }
  if (pendingOthers > 0 && played > 0) {
    sentences.push(
      pendingOthers === 1
        ? 'One other meeting has no published score.'
        : `${pendingOthers} other meetings have no published score.`,
    );
  }
  return sentences.join(' ');
}

/** 'W-L' or 'W-L-T' — ties are only printed when there are some. */
function record(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

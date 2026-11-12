import Link from 'next/link';
import { Fragment } from 'react';

import { EM_DASH, recordString } from '../../lib/format';
import { winningSide } from '../../lib/postseason/game-winner';
import { playInWinnerPurpose } from '../../lib/postseason/postseason-outcomes';
import type { Game, Standing, Team } from '../../lib/types';
import { GameRow } from '../game-row/GameRow';
import { shootoutNote } from '../game-row/summary';
import { describeGame } from '../ui/describe-game';
import TeamMonogram from '../ui/TeamMonogram';

/**
 * One two-sided postseason pairing as a ROW (spec §5.6: rows, not cards): a SCVAL crossover game, the
 * BVAL play-in. (The name is kept: LeaguePairings and the tests import it.)
 *
 * League-neutral on purpose: every word on it arrives as a prop (seat labels from config, the purpose
 * sentence from the pairing's config label), so the same row serves a CCS page and an NCS page without
 * carrying a CCS concept onto the NCS one.
 *
 * Once the contest exists the row IS the site's game row (components/game-row/GameRow.tsx): its
 * status, the two teams, the two scores, a link to the game page; never a sentence for a result and
 * never a 0-0 for a missing score. Its note says what the game is ('Crossover, #1 v #1. Helps CCS
 * ordering.') and how a shootout went.
 *
 * Before that the row has the same shape, drawn here with the row's own classes: the start time and
 * the day in the status slot, then one line per seat. A seat is EMPTY, or holds more than one
 * contender, when the league table has not settled it; both render honestly: `TBD` for an empty seat,
 * every contender named (`A or B`) when a level place spans it, and the notes under the row say why
 * in words. The hosting seat is marked `(host)` in text, never by position or colour alone.
 *
 * Under a FINAL play-in for an automatic berth the row also names the winner and what it won, one
 * sentence: 'Winner: Los Altos — SCVAL’s 7th automatic qualifier' (plan final-10, 2026-10-30). The
 * berth words come from the purpose prop, which is the pairing's config label
 * (lib/postseason/postseason-outcomes.ts playInWinnerPurpose), so a crossover ('For CCS seeding, not
 * qualification.') prints none. The winner is the higher score, else the side MaxPreps marks 'W'; a
 * level final with no flag names nobody.
 */
export interface PlayInSide {
  /** 'Santa Teresa #1' — from config. */
  label: string;
  contenders: Array<{ team: Team; standing?: Standing }>;
  host: boolean;
}

export interface PlayInCardProps {
  /** 'Play-in' / 'Crossover · #1 v #1'; null when the section header already names the card. */
  title: string | null;
  /** 'Fri Oct 30' and, when the league states one, '11 AM PT'. */
  when?: { dateKey: string; dateLabel: string; timeLabel: string | null } | null;
  /** Reading order: the visitor first when `connector` is 'at'. */
  sides: [PlayInSide, PlayInSide];
  connector: 'vs' | 'at';
  /** The whole card as one screen-reader sentence. */
  sentence: string;
  /** What the game is for, one sentence. */
  purpose?: string | null;
  notes?: readonly string[];
  game?: Game | null;
  /** @deprecated No row is marked by an edge rule. Ignored. */
  emphasis?: boolean;
  className?: string;
}

/** One seat before its game exists: the team (or the teams still level for it, or TBD), then the seat's label. */
function Seat({ side, which }: { side: PlayInSide; which: 'away' | 'home' }) {
  const [first, ...rest] = side.contenders;
  const settled = first !== undefined && rest.length === 0;
  const seat = `${side.label}${side.host ? ' (host)' : ''}`;
  return (
    <span
      className="sx-game-team"
      data-side={which}
      data-team-slug={settled ? first.team.slug : undefined}
      data-undecided={settled ? undefined : ''}
    >
      {settled ? <TeamMonogram team={first.team} size={24} /> : null}
      {/* Each contender taps through to its team page. The seats are aria-hidden (the row's sr-only
          sentence speaks for them), so these are pointer-only links kept out of the tab order. */}
      {/* Two contenders' names wrap on a phone instead of being cut. */}
      <span className={settled ? 'sx-game-name' : 'sx-game-name whitespace-normal'}>
        {first === undefined
          ? 'TBD'
          : side.contenders.map((c, i) => (
              <Fragment key={c.team.slug}>
                {i > 0 ? ' or ' : null}
                <Link href={`/teams/${c.team.slug}`} prefetch={false} tabIndex={-1} className="sx-teamlink relative z-[1]">
                  {c.team.shortName}
                </Link>
              </Fragment>
            ))}
      </span>
      <span className="sx-seed">{seat}</span>
      {settled && first.standing?.hasReportedResults ? (
        <span className="sx-seed sx-num">{recordString(first.standing.computed)}</span>
      ) : null}
    </span>
  );
}

/** 'Winner: Los Altos — SCVAL’s 7th automatic qualifier' for a final play-in, else null. */
function winnerLine(game: Game | null | undefined, sides: [PlayInSide, PlayInSide], purpose: string | null | undefined): string | null {
  if (!game || !purpose) return null;
  const won = playInWinnerPurpose(purpose);
  const at = winningSide(game);
  if (!won || !at) return null;
  const side = game[at];
  const contender = sides.flatMap((s) => s.contenders).find((c) => c.team.id === side.teamId);
  return `Winner: ${contender ? contender.team.shortName : side.name} ${EM_DASH} ${won}`;
}

export function PlayInCard({ title, when, sides, sentence, purpose, notes = [], game, className }: PlayInCardProps) {
  const winner = winnerLine(game, sides, purpose);
  // 'Crossover · #1 v #1' is the view's; the note lists its two parts.
  const what = [title ? `${title.replace(' · ', ', ')}.` : null, purpose ?? null].filter(Boolean).join(' ');
  const decider = game ? shootoutNote(game, describeGame(game)) : null;
  const note = [decider ? `${decider}.` : null, what || null].filter(Boolean).join(' ');
  return (
    <div className={className}>
      {game ? (
        <GameRow game={game} showChips={false} showDate meta={note || undefined} />
      ) : (
        <div className="sx-game" data-state="upcoming">
          <span className="sr-only">{sentence}</span>
          <div className="sx-game-grid" aria-hidden="true">
            <span className="sx-game-status">
              <span className="sx-num sx-game-time">{when?.timeLabel ? when.timeLabel.replace(/ PT$/, '') : 'TBD'}</span>
              {when ? (
                <small>
                  <time dateTime={when.dateKey}>{when.dateLabel}</time>
                </small>
              ) : null}
            </span>
            <Seat side={sides[0]} which="away" />
            <Seat side={sides[1]} which="home" />
            {note ? <span className="sx-game-note">{note}</span> : null}
          </div>
        </div>
      )}
      {notes.map((text) => (
        <p key={text} className="sx-note pl-2">
          {text}
        </p>
      ))}
      {winner ? <p className="sx-note pl-2 font-semibold text-ink">{winner}</p> : null}
    </div>
  );
}

export default PlayInCard;

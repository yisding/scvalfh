import Link from 'next/link';

import { getTeamBySlug } from '../../lib/data';
import { gameHref } from '../../lib/game-id';
import type { TeamSlug } from '../../lib/types';
import { GameRow } from '../ui/GameRow';
import { ScoreGlyph, nameClass } from '../ui/ScoreGlyph';
import StatusLabel from '../ui/StatusLabel';
import TeamMonogram from '../ui/TeamMonogram';
import { describeGame, type SideView } from '../ui/game-view';

import { isNamedSide, type BracketGame, type BracketPath } from './bracket-model';

/**
 * One published bracket (DESIGN §3.8, §7.11).
 *
 * **Phone is a vertical list of rounds, never a tree.** A horizontally scrolling tree on a 390px
 * screen is a usability failure and is not offered; each round is a kicker over the same `GameRow`
 * every other list on this site uses, so scores, status words and the expandable panel behave
 * identically here.
 *
 * **Desktop is a CSS grid of round columns** — one column per round, cards distributed with
 * `justify-around` so each pair points at the game it feeds. Connectors are 1px borders: a rail on
 * the left edge of every round after the first and a short stub into each card. No SVG, no
 * library, no absolute positioning.
 *
 * Both breakpoints render the SAME rounds array. An unfilled slot reads `TBD` — never a blank box —
 * and the winner's line carries 600 weight AND a 2px `--sx-text` left rule, never color alone.
 */
export interface PlayoffBracketProps {
  path: BracketPath;
  /** The pinned team, highlighted with the 2px accent rule wherever it appears. */
  highlightSlug?: TeamSlug | null;
  /**
   * The level of each round's heading. The page owns the h1 and the section heading is an h2; the
   * caller renders a path-name h3 only when there is more than one path, so with a single path the
   * round headings are the h3s themselves and the outline never skips from h2 to h4.
   */
  headingLevel?: 'h3' | 'h4';
  className?: string;
}

function sideLabel(side: SideView): string {
  const name = side.shortName.trim();
  return name || 'TBD';
}

function BracketLine({
  side,
  seed,
  showScore,
}: {
  side: SideView;
  seed: number | null;
  showScore: boolean;
}) {
  const team = side.slug ? getTeamBySlug(side.slug) : undefined;
  return (
    <span
      className="flex items-center gap-2 py-1 pr-2 pl-2"
      style={side.weight === 'winner' ? { boxShadow: 'inset 2px 0 0 var(--sx-text)' } : undefined}
    >
      {/* A seed is information before a score, so the slot is kept — but nothing upstream
          publishes CCS seeds yet, so it renders only when a real number arrives. */}
      {seed !== null ? <span className="sx-num w-4 shrink-0 text-meta text-ink-3">{seed}</span> : null}
      {team ? (
        <TeamMonogram team={team} size={20} />
      ) : (
        <span className="inline-block shrink-0" style={{ width: 20 }} />
      )}
      <span className={`min-w-0 flex-1 truncate text-meta ${nameClass(side)}`}>
        {sideLabel(side)}
      </span>
      {showScore ? <ScoreGlyph side={side} size="meta" /> : null}
    </span>
  );
}

/** The desktop card. Phone uses `GameRow`, so this is the only bracket-specific game markup. */
function BracketCard({
  entry,
  highlightSlug,
}: {
  entry: BracketGame;
  highlightSlug?: TeamSlug | null;
}) {
  const { game, seeds } = entry;
  const display = describeGame(game);
  const pinned =
    !!highlightSlug && (game.home.slug === highlightSlug || game.away.slug === highlightSlug);
  const named = isNamedSide(game.home) || isNamedSide(game.away);
  return (
    <div
      className={['sx-card min-w-0 flex-1', pinned ? 'sx-pinned' : null].filter(Boolean).join(' ')}
    >
      {/* `prefetch={false}` for the reason the nav and the standings rows carry it
          (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route here is
          STATIC, so Next 16's `auto` downloads the whole linked route the moment the link scrolls
          into view, and a full bracket is fourteen game pages. Navigation still fetches on click. */}
      {named ? (
        <Link href={gameHref(game.contestId)} prefetch={false} className="block py-1 no-underline">
          <span className="sr-only">{display.sentence}</span>
          <span className="block" aria-hidden="true">
            <BracketLine side={display.away} seed={seeds.away} showScore={display.showScores} />
            <BracketLine side={display.home} seed={seeds.home} showScore={display.showScores} />
            <span className="block px-2 pb-1">
              <StatusLabel display={display} showChips={false} />
            </span>
          </span>
        </Link>
      ) : (
        <span className="block py-1">
          <span className="block">
            <BracketLine side={display.away} seed={seeds.away} showScore={false} />
            <BracketLine side={display.home} seed={seeds.home} showScore={false} />
            <span className="block px-2 pb-1">
              <StatusLabel display={display} showChips={false} />
            </span>
          </span>
        </span>
      )}
    </div>
  );
}

export function PlayoffBracket({
  path,
  highlightSlug,
  headingLevel: RoundHeading = 'h4',
  className,
}: PlayoffBracketProps) {
  const { rounds } = path;
  if (rounds.length === 0) return null;

  return (
    <div className={className}>
      {/* Phone: rounds stacked, the same GameRow as every other list. */}
      <ol className="m-0 list-none space-y-6 p-0 md:hidden">
        {rounds.map((round) => (
          <li key={round.dateKey}>
            <RoundHeading className="m-0 mb-3 flex flex-wrap items-baseline gap-x-3 text-lead text-ink">
              {round.name}
              <span className="text-meta font-normal text-ink-2">{round.dateLabel}</span>
            </RoundHeading>
            {/* A full-bleed band below md, like every other game list (GameRow pads itself
                with the 16px gutter); the desktop tree below never bleeds. */}
            <ol className="sx-list sx-card sx-flush sx-bleed">
              {round.games.map((entry) => (
                <li key={entry.game.contestId}>
                  {/* Every CCS game is a postseason game, so the NL tag would mark the whole
                      bracket — marking the majority is noise (DESIGN §5.4). */}
                  <GameRow game={entry.game} showRecap={false} showChips={false} />
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>

      {/* Desktop: one column per round. Nested <ol>s, so it reads as rounds in order (§10.4). */}
      <ol
        className="m-0 hidden list-none gap-0 p-0 md:grid"
        style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(0, 1fr))` }}
      >
        {rounds.map((round, roundIndex) => (
          <li key={round.dateKey} className="flex min-w-0 flex-col">
            <RoundHeading className="m-0 mb-3 text-lead text-ink">
              {round.name}{' '}
              <span className="text-meta font-normal text-ink-2">&middot; {round.dateLabel}</span>
            </RoundHeading>
            <ol
              className={[
                'm-0 flex flex-1 list-none flex-col justify-around gap-4 p-0',
                roundIndex > 0 ? 'border-l border-divider' : null,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {round.games.map((entry) => (
                <li key={entry.game.contestId} className="flex min-w-0 items-center">
                  {roundIndex > 0 ? (
                    <span className="w-4 shrink-0 border-t border-divider" aria-hidden="true" />
                  ) : null}
                  <BracketCard entry={entry} highlightSlug={highlightSlug} />
                  {roundIndex < rounds.length - 1 ? (
                    <span className="w-4 shrink-0 border-t border-divider" aria-hidden="true" />
                  ) : null}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default PlayoffBracket;

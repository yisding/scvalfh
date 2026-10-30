import Link from 'next/link';

import { getTeamBySlug } from '../../lib/data';
import { gameHref } from '../../lib/game-id';
import ExternalLink from '../ui/ExternalLink';
import { GameRow } from '../ui/GameRow';
import { ScoreGlyph, nameClass } from '../ui/ScoreGlyph';
import StatusLabel from '../ui/StatusLabel';
import TeamMonogram from '../ui/TeamMonogram';
import { describeGame, type SideView } from '../ui/describe-game';

import {
  isNamedSide,
  isSeedSide,
  isWinnerOf,
  type BracketCard,
  type BracketGame,
  type BracketPairing,
  type BracketPath,
  type BracketRound,
  type PairingSide,
} from './bracket-model';

/**
 * One published bracket (DESIGN §3.8, §7.11).
 *
 * **Phone is a vertical list of rounds, never a tree.** A horizontally scrolling tree on a 390px
 * screen is a usability failure and is not offered; each round is a kicker over the same `GameRow`
 * every other list on this site uses, so scores, status words and the expandable panel behave
 * identically here. A slot no game fills yet is a pairing card in the same list.
 *
 * **Desktop is a CSS grid of round columns** — one column per round, cards distributed with
 * `justify-around` so each pair points at the game it feeds. Connectors are 1px borders: a rail on
 * the left edge of every round after the first and a short stub into each card. No SVG, no
 * library, no absolute positioning.
 *
 * Both breakpoints render the SAME rounds array. Every card carries its seeds once the owner file
 * names them (bracket-model.ts). An unfilled slot reads `TBD` or `Winner of 1 v 8` — never a blank
 * box — and the winner's line carries 600 weight AND a 2px `--sx-text` left rule, never color alone.
 * An unplayed game's card answers the parent's questions before the day (2026-10-30): its date and
 * time (or "time TBA"), where (MaxPreps' location, without its leading "@ "), and how to get in or
 * watch (`Tickets` and `NFHS stream` pills from the game's own urls, outside the card's game link
 * because an anchor cannot hold another anchor). A pairing card has no link: there is no game yet.
 */
export interface PlayoffBracketProps {
  path: BracketPath;
  /**
   * The level of each round's heading. The page owns the h1 and the section heading is an h2; the
   * caller renders a path-name h3 only when there is more than one path, so with a single path the
   * round headings are the h3s themselves and the outline never skips from h2 to h4.
   */
  headingLevel?: 'h3' | 'h4';
  className?: string;
}

/** 'Quarterfinal' from 'Quarterfinals'; a dated round keeps its date. */
function roundWord(round: BracketRound): string {
  return round.key === 'other' ? `${round.name} game` : round.name.replace(/s$/, '');
}

function sideLabel(side: SideView): string {
  const name = side.shortName.trim();
  return name || 'TBD';
}

/** 'Palo Alto', 'Winner of 1 v 8', 'TBD'. */
function pairingSideLabel(side: PairingSide): string {
  if (isSeedSide(side)) return side.name;
  if (isWinnerOf(side)) return `Winner of ${side.winnerOf[0].seed} v ${side.winnerOf[1].seed}`;
  return 'TBD';
}

/** '8 Palo Alto', 'the winner of 1 v 8', 'a team to be decided' — for the card's sentence. */
function pairingSideWords(side: PairingSide): string {
  if (isSeedSide(side)) return `${side.seed} ${side.name}`;
  if (isWinnerOf(side)) return `the winner of ${side.winnerOf[0].seed} v ${side.winnerOf[1].seed}`;
  return 'a team to be decided';
}

function BracketLine({ side, seed, showScore }: { side: SideView; seed: number | null; showScore: boolean }) {
  const team = side.slug ? getTeamBySlug(side.slug) : undefined;
  return (
    <span
      className="flex items-center gap-2 py-1 pr-2 pl-2"
      style={side.weight === 'winner' ? { boxShadow: 'inset 2px 0 0 var(--sx-text)' } : undefined}
    >
      {/* A seed is information before a score (DESIGN §7.11): it prints as soon as the owner file names
          it (lib/ccs-bracket.ts getCcsSeeds), and nothing is printed in its place before that. */}
      {seed !== null ? <span className="sx-num w-4 shrink-0 text-meta text-ink-3">{seed}</span> : null}
      {team ? <TeamMonogram team={team} size={20} /> : <span className="inline-block shrink-0" style={{ width: 20 }} />}
      <span className={`min-w-0 flex-1 truncate text-meta ${nameClass(side)}`}>{sideLabel(side)}</span>
      {showScore ? <ScoreGlyph side={side} size="meta" /> : null}
    </span>
  );
}

function PairingLine({ side }: { side: PairingSide }) {
  const team = isSeedSide(side) && side.slug ? getTeamBySlug(side.slug) : undefined;
  return (
    <span className="flex items-center gap-2 py-1 pr-2 pl-2">
      {isSeedSide(side) ? <span className="sx-num w-4 shrink-0 text-meta text-ink-3">{side.seed}</span> : null}
      {team ? <TeamMonogram team={team} size={20} /> : <span className="inline-block shrink-0" style={{ width: 20 }} />}
      <span className={`min-w-0 flex-1 truncate text-meta ${isSeedSide(side) ? 'font-normal text-ink' : 'font-normal text-ink-2'}`}>
        {pairingSideLabel(side)}
      </span>
    </span>
  );
}

/**
 * A slot no game fills yet: both seeds and names when the CCS pairing is known from the seeds, else the
 * winners-of that feed it. No link — there is no game page — and one sentence for a screen reader.
 */
function PairingCard({ card, round, flush }: { card: BracketPairing; round: BracketRound; flush?: boolean }) {
  const sentence = `${roundWord(round)}: ${pairingSideWords(card.top)} v ${pairingSideWords(card.bottom)}. Not listed on MaxPreps yet.`;
  return (
    <div className={flush ? 'min-w-0 px-2 py-1' : 'sx-card min-w-0 flex-1'}>
      <span className="block py-1">
        <span className="sr-only">{sentence}</span>
        <span className="block" aria-hidden="true">
          <PairingLine side={card.top} />
          <PairingLine side={card.bottom} />
          <span className="block px-2 pb-1 text-meta text-ink-3">{round.dateLabel}</span>
        </span>
      </span>
    </div>
  );
}

/** MaxPreps writes a location as '@ Los Gatos HS'; the card has already said who is home. */
function venueWords(text: string | null): string | null {
  const words = (text ?? '').replace(/^@\s*/, '').trim();
  return words.length > 0 ? words : null;
}

/** The desktop card for a game. Phone uses `GameRow`, so this is the only bracket-specific game markup. */
function BracketGameCard({ entry }: { entry: BracketGame }) {
  const { game, seeds } = entry;
  const display = describeGame(game);
  const named = isNamedSide(game.home) || isNamedSide(game.away);
  const unplayed = game.status === 'scheduled';
  const venue = unplayed ? venueWords(game.venue.text) : null;
  const links: Array<{ href: string; label: string }> = [];
  if (unplayed && game.urls.goFan) links.push({ href: game.urls.goFan, label: 'Tickets' });
  if (unplayed && game.urls.nfhsStream) links.push({ href: game.urls.nfhsStream, label: 'NFHS stream' });
  const body = (
    <span className="block" aria-hidden="true">
      <BracketLine side={display.away} seed={seeds.away} showScore={named && display.showScores} />
      <BracketLine side={display.home} seed={seeds.home} showScore={named && display.showScores} />
      {unplayed ? (
        <span className="block px-2 pb-1 text-meta text-ink-2">
          <span className="block">{entry.when}</span>
          {venue ? <span className="block truncate text-ink-3">{venue}</span> : null}
        </span>
      ) : (
        <span className="block px-2 pb-1">
          <StatusLabel display={display} showChips={false} />
        </span>
      )}
    </span>
  );
  return (
    <div className="sx-card min-w-0 flex-1">
      {/* `prefetch={false}` for the reason the nav and the standings rows carry it
          (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route here is
          STATIC, so Next 16's `auto` downloads the whole linked route the moment the link scrolls
          into view, and a full bracket is fourteen game pages. Navigation still fetches on click. */}
      {named ? (
        <Link href={gameHref(game.contestId)} prefetch={false} className="block py-1 no-underline">
          <span className="sr-only">{display.sentence}</span>
          {body}
        </Link>
      ) : (
        <span className="block py-1">{body}</span>
      )}
      {links.length > 0 ? (
        <span className="flex flex-wrap gap-2 px-2 pb-2">
          {links.map((l) => (
            <ExternalLink key={l.href} href={l.href} className="sx-pill no-underline">
              {l.label}
            </ExternalLink>
          ))}
        </span>
      ) : null}
    </div>
  );
}

function cardKey(card: BracketCard): string {
  return card.kind === 'game' ? card.game.contestId : card.id;
}

export function PlayoffBracket({ path, headingLevel: RoundHeading = 'h4', className }: PlayoffBracketProps) {
  const { rounds } = path;
  if (rounds.length === 0) return null;

  return (
    <div className={className}>
      {/* Phone: rounds stacked, the same GameRow as every other list; a pairing is a plain row. */}
      <ol data-twin className="m-0 list-none space-y-6 p-0 md:hidden">
        {rounds.map((round) => (
          <li key={round.dateKey}>
            <RoundHeading className="m-0 mb-3 flex flex-wrap items-baseline gap-x-3 text-lead text-ink">
              {round.name}
              <span className="text-meta font-normal text-ink-2">{round.dateLabel}</span>
            </RoundHeading>
            {/* A full-bleed band below md, like every other game list (GameRow pads itself
                with the 16px gutter); the desktop tree below never bleeds. */}
            <ol className="sx-list sx-card sx-flush sx-bleed">
              {round.cards.map((card) => (
                <li key={cardKey(card)}>
                  {/* Every CCS game is a postseason game, so the NL tag would mark the whole
                      bracket — marking the majority is noise (DESIGN §5.4). */}
                  {card.kind === 'game' ? (
                    <GameRow game={card.game} showRecap={false} showChips={false} />
                  ) : (
                    <PairingCard card={card} round={round} flush />
                  )}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>

      {/* Desktop: one column per round. Nested <ol>s, so it reads as rounds in order (§10.4).
          Two rows, headings and games, and each round a subgrid of them, so a heading that wraps
          in its column lowers every round's games together instead of its own alone, which put
          the next round's cards 20px off the midpoints of the pairs feeding them (measured with
          a two-line heading at 768px; HistoryBracket.tsx had it live, "Quarterfinals · Nov 8"). */}
      <ol
        data-twin
        className="m-0 hidden list-none grid-rows-[auto_1fr] gap-0 p-0 md:grid"
        style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(0, 1fr))` }}
      >
        {rounds.map((round, roundIndex) => (
          <li key={round.dateKey} className="row-span-2 grid min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-subgrid">
            <RoundHeading className="m-0 mb-3 text-lead text-ink">
              {round.name}{' '}
              <span className="text-meta font-normal text-ink-2">&middot; {round.dateLabel}</span>
            </RoundHeading>
            <ol
              className={['m-0 flex list-none flex-col justify-around gap-4 p-0', roundIndex > 0 ? 'border-l border-divider' : null]
                .filter(Boolean)
                .join(' ')}
            >
              {round.cards.map((card) => (
                <li key={cardKey(card)} className="flex min-w-0 items-center">
                  {roundIndex > 0 ? <span className="w-4 shrink-0 border-t border-divider" aria-hidden="true" /> : null}
                  {card.kind === 'game' ? <BracketGameCard entry={card} /> : <PairingCard card={card} round={round} />}
                  {roundIndex < rounds.length - 1 ? <span className="w-4 shrink-0 border-t border-divider" aria-hidden="true" /> : null}
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

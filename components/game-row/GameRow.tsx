import Link from 'next/link';

import { mapsSearchHref } from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import type { Game } from '../../lib/types';
import { gameAddress } from '../../lib/schools/venue';

import ExternalLink from '../ui/ExternalLink';
import { getBracketLink } from '../playoffs/bracket-link';
import { maxPrepsLabel } from '../words/maxpreps-label';
import { describeGame, resultSentence } from '../ui/describe-game';

import type { GameBaseProps, GameViewOptions } from './props';
import { SummaryLead, SummaryTeams, chipsSentence, recordsApply, recordsSentence } from './summary';

/**
 * GameRow / GameCard / GameLine / GameLogRow (DESIGN §7.4, modernization brief §4.15), one file
 * each in components/game-row/, built from the pieces in summary.tsx.
 *
 * A row is a three-column grid: a lead column (clock · the written status label · the chips, in
 * three fixed slots: SummaryLead), the two team lines — AWAY on top, HOME below, each `[chip]
 * [monogram] [name] [score]` — and a chevron.
 * The score column is mono/tabular so scores align down a list, and the winner's number is 600
 * weight in `--sx-text` against the loser's 400 in `--sx-text-2` (the fourth redundant channel,
 * R-19). Exactly two ScoreGlyphs per row, away then home.
 *
 * The row is a `<details>` / `<summary>` pair, so EXPAND WORKS WITH ZERO JAVASCRIPT. Venue,
 * stream, tickets, the box score and the /game/[id] link live in the panel, which is why 174
 * venue addresses never enter the initial payload of a list page.
 *
 * An opponent that is not one of the registry's teams gets a ghost monogram (GhostMonogram: two
 * mixed-case letters on the inset surface, no school colour), titled NON_MEMBER_NOTE, and no link
 * (DESIGN §8).
 *
 * Every game link is `gameHref(game.contestId)` (SPEC §10.0): a si.com-only game's id is
 * `sblive:<n>`, which the route spells `sblive-<n>`.
 *
 * SERVER-ONLY: `showRecords` reads the standings through lib/data, which does an fs read at module
 * scope, and NON_MEMBER_NOTE counts the registry through lib/teams (summary.tsx). Every consumer is
 * a server component; nothing on the client imports these modules.
 */
export type GameRowProps = GameBaseProps &
  Pick<
    GameViewOptions,
    'showDate' | 'showTime' | 'showRecap' | 'scopeLeague' | 'showRecords' | 'defaultExpanded' | 'seeds' | 'bracket'
  >;

/** The pills in an expanded panel: real links only, never a dead affordance. */
function GameLinks({ game, bracket }: { game: Game; bracket: boolean }) {
  const place = bracket ? getBracketLink(game) : null;
  // lib/schools/venue.ts: the game's own address, else the venue's or host's school (data/schools.json).
  const address = gameAddress(game)?.address;
  const directions = address ? mapsSearchHref(address) : null;
  const links: Array<{ href: string; label: string }> = [];
  if (directions) links.push({ href: directions, label: 'Directions' });
  if (game.urls.nfhsStream) links.push({ href: game.urls.nfhsStream, label: 'NFHS stream' });
  if (game.urls.goFan) links.push({ href: game.urls.goFan, label: 'Tickets' });
  if (game.urls.maxpreps) links.push({ href: game.urls.maxpreps, label: maxPrepsLabel(game.status) });
  return (
    <p className="m-0 flex flex-wrap gap-2">
      {/* The way on to the whole contest comes first, as the one accent pill. */}
      <Link
        href={gameHref(game.contestId)}
        prefetch={false}
        className="sx-pill sx-pill-accent min-h-11"
      >
        Full game page
      </Link>
      {/* Where the game sits in its bracket, an internal page, so a plain Link in the card pill's face. */}
      {place ? (
        <Link href={place.href} prefetch={false} className="sx-pill sx-pill-card">
          {place.label}
        </Link>
      ) : null}
      {/* The open panel is surface-2, the pill's own fill, so these pills take the card
          surface instead or they would read as bare text links. A press steps them to surface-3,
          the same as a hover, so a tap on a phone (no hover) still answers. */}
      {links.map((l) => (
        <ExternalLink
          key={l.href}
          href={l.href}
          className="sx-pill sx-pill-card"
        >
          {l.label}
        </ExternalLink>
      ))}
    </p>
  );
}

function GameDetailBody({ game, showRecap, bracket }: { game: Game; showRecap: boolean; bracket: boolean }) {
  const recap = showRecap ? resultSentence(game) : null;
  return (
    // From 768px (the team page's Last card) the panel is indented to the team column — gutter +
    // the 80px lead column + its 8px gap — so it reads as belonging to the two names above it.
    // On a phone that indent cost 94px of a 358px row and stacked every pill on its own line, so
    // the panel starts at the gutter there.
    // A flex column, not `space-y-3`: v4's space-y is a zero-specificity child rule, so each
    // child's `m-0` cancelled it and the recap sat on the pill row.
    // `.sx-gamedetail` (app/globals.css) is that panel: surface-2 under a divider, 12px between
    // its lines, the md indent.
    <div className="sx-gamedetail">
      {recap ? <p className="m-0 text-ink-2">{recap}</p> : null}
      {game.venue.name ? <p className="m-0 text-ink-2">{game.venue.name}</p> : null}
      {/* `contest.location` is a NOTE field, not a venue field — live values include
          "Senior Night" and a coach's scoring note — so it is never labelled "Venue". */}
      {game.venue.text ? <p className="m-0 text-ink-3">Note: {game.venue.text}</p> : null}
      <GameLinks game={game} bracket={bracket} />
    </div>
  );
}

export function GameRow({
  game,
  perspective,
  showDate = false,
  showTime = true,
  showRecap = true,
  showChips = true,
  scopeLeague = null,
  showRecords = false,
  defaultExpanded = false,
  seeds,
  bracket = true,
  className,
}: GameRowProps) {
  const display = describeGame(game, perspective);
  const withRecords = recordsApply(game, display, showRecords);
  return (
    <details
      open={defaultExpanded || undefined}
      className={[
        display.isNonLeague ? 'sx-nonleague' : null,
        'bg-surface',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Three columns — lead (clock · status · chips, SummaryLead), the two team lines, the
          chevron — so the status word never pushes a team line onto a third row. The lead column
          is 80px at every phone width and its three slots are fixed, so the row is 76px whatever
          its labels say. At 320 a 70px column broke a label into three lines and grew the row to
          90px; the 10px comes back from the score column, which is sized to its glyph. */}
      {/* The ring is inset: the row is an edge-to-edge band, and an outset ring would be clipped
          by the screen edge (or by a /schedule date group's paint containment). */}
      {/* `.sx-gamerow` (app/globals.css) is the grid, the 76px floor, the padding, the inset ring
          and the hidden marker: one class instead of twelve utilities on every row. */}
      <summary className="sx-tap sx-gamerow">
        {/* The chips are aria-hidden in the lead column, so the sentence says them in words — the
            same gate as the chips, so a bracket (showChips false) does not repeat them. */}
        <span className="sr-only">
          {display.sentence}
          {chipsSentence(display, showChips)}
          {withRecords ? recordsSentence(display) : ''}
        </span>
        {/* The lead is 52px and centred on the 52px team block (the grid's `items-center`); a
            name that genuinely wraps grows the block, and the lead stays centred on it. */}
        <SummaryLead
          game={game}
          display={display}
          showDate={showDate}
          showTime={showTime}
          showChips={showChips}
        />
        <SummaryTeams display={display} showRecords={withRecords} scopeLeague={scopeLeague} seeds={seeds} />
        <svg
          className="sx-chevron text-ink-3"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </summary>
      <GameDetailBody game={game} showRecap={showRecap} bracket={bracket} />
    </details>
  );
}

export default GameRow;

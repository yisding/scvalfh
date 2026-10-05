import { shortDate, timeOfDayPT } from '../../lib/format';
import { getTeamBySlug } from '../../lib/teams';
import type { Game } from '../../lib/types';

import { NON_MEMBER_NOTE } from './GameRow';
import GhostMonogram from './GhostMonogram';
import { ScoreGlyph, nameClass } from './ScoreGlyph';
import StatusLabel, { GameChips } from './StatusLabel';
import TeamMonogram from './TeamMonogram';
import { describeGame, statusLabelIsTime, type SideView } from './describe-game';

/**
 * The /game/[id] hero (DESIGN §3.5, §7.4; modernization brief §4.16). A final score is the
 * most-shared object on this site, so this is the shareable scoreboard: a status line, then both
 * sides with the score at display size, the winner at 600 weight and the loser at 400.
 *
 * ONE DOM for every width — away side, separator, home side — so the reading order never changes:
 * - phone: two stacked rows (monogram 40 · name · score) with a divider line between them;
 * - ≥768px: a three-column grid, `away | – | home`, the away side right-aligned and the home side
 *   reversed so both scores sit against the centre dash (monogram 56).
 *
 * Each ScoreGlyph is wrapped in `.sx-board-score`, whose unlayered rule in globals.css sets it at
 * `--text-display`: ScoreGlyph's own class string is frozen (tests/ui/rendered-never-00.test.ts).
 *
 * `sub` is whatever the page wants under each name — normally "4-1-0 De Anza" or "10-1-1 MCAL". A
 * school outside the registry has no record to show (game-model gives it no sub), so its side gets
 * a GhostMonogram tile (the same tile its rows use) and the sub line NON_MEMBER_NOTE ("Not one of
 * the N teams this site follows", from GameRow), written here rather than in game-model so the
 * page title and OG card, which share that model, are untouched.
 *
 * A score published from si.com (owner decision D2, `display.sourceMark === 'si.com'`) carries a
 * `†` with the words `Score via si.com`, never the mark alone (SPEC §10.6): StatusLabel prints the
 * mark in the status line (it reads `sourceMark`), the line ends with its legend `† Score via
 * si.com`, and the board's screen-reader sentence ends with the same words.
 *
 * Names WRAP (two lines at most, balanced) instead of truncating: "St. Ignatius College
 * Preparatory" was cut to "St. Ignatius Colle…" on a phone. Between 768 and 1023px, where the
 * three-column board leaves each name the least room (about 217px at 768), a name longer than 27
 * characters (too long for that band's two-line clamp; today only "St. Ignatius College
 * Preparatory") is swapped for its short name. "Convent of the Sacred Heart" (27) and "San
 * Francisco University" (24) were measured at 768 and fit in two lines. Every other name prints in
 * full at every width.
 */
export interface ScoreBoardSideMeta {
  sub?: string | null;
}

export interface ScoreBoardProps {
  game: Game;
  home?: ScoreBoardSideMeta;
  away?: ScoreBoardSideMeta;
  className?: string;
}

function BoardSide({
  side,
  sub,
  showScore,
  align,
}: {
  side: SideView;
  sub?: string | null;
  showScore: boolean;
  align: 'away' | 'home';
}) {
  const team = side.slug ? getTeamBySlug(side.slug) : undefined;
  const fullName = team ? team.name : side.name;
  // Only a name too long for the 768–1023 band's two-line clamp swaps to its short form there;
  // "Convent of the Sacred Heart" (27 characters, the longest that fits) prints in full. A side
  // outside the registry has its name as its shortName, so it never swaps.
  const swapShort = fullName.length > 27 && side.shortName !== fullName;
  const subLine = sub ?? (team ? null : NON_MEMBER_NOTE);
  return (
    <div
      className={`flex min-w-0 items-center gap-3 py-3 md:gap-4 md:py-0 ${
        align === 'away' ? 'md:justify-end md:text-right' : 'md:flex-row-reverse md:justify-end md:text-left'
      }`}
    >
      {/* Two decorative monograms, one per breakpoint: 40 on a phone row, 56 on the wide board. */}
      <span className="inline-flex shrink-0 md:hidden">
        {team ? (
          <TeamMonogram team={team} size={40} />
        ) : (
          <GhostMonogram name={side.name} size={40} title={NON_MEMBER_NOTE} />
        )}
      </span>
      <span className="hidden shrink-0 md:inline-flex">
        {team ? (
          <TeamMonogram team={team} size={56} />
        ) : (
          <GhostMonogram name={side.name} size={56} title={NON_MEMBER_NOTE} />
        )}
      </span>
      <div className="min-w-0 flex-1 md:flex-initial">
        {/* A long name (swapShort) gets two copies, one per band, both aria-hidden (the
            section's sr-only sentence names the sides): the full name everywhere but 768–1023px,
            the short name there. Any other name is one full copy at every width. Neither ever
            truncates: `break-words` keeps a long single word inside the column and `text-balance`
            evens the lines. From 768px `sx-clamp-2` caps a name at two lines; on a phone the
            sides are stacked full-width rows, so the clamp is lifted (`-webkit-line-clamp:
            none`) — at 320 "St. Ignatius College Preparatory" beside a score needs three 18px
            lines, and a clamp there cut it to "…College…". The short copy needs `-webkit-box`
            back explicitly, because a `block` utility would beat sx-clamp-2's display (a
            base-layer rule) and drop the clamp. */}
        <span
          className={`sx-clamp-2 break-words text-balance text-lead max-md:[-webkit-line-clamp:none] md:text-title ${
            swapShort ? 'md:max-lg:hidden' : ''
          } ${nameClass(side)}`}
          aria-hidden="true"
        >
          {fullName}
        </span>
        {swapShort ? (
          <span
            className={`sx-clamp-2 hidden break-words text-balance text-lead md:text-title md:max-lg:[display:-webkit-box] ${nameClass(
              side,
            )}`}
            aria-hidden="true"
          >
            {side.shortName}
          </span>
        ) : null}
        {/* tabular-nums, not sx-num: the line is mostly words ("De Anza", "No league results
            reported"), and mono set the division name in a code face. The record's digits keep
            fixed widths without it. */}
        {subLine ? (
          <span className="block text-meta tabular-nums text-ink-3">{subLine}</span>
        ) : null}
      </div>
      {showScore ? (
        <span className="sx-board-score shrink-0">
          <ScoreGlyph side={side} size="board" />
        </span>
      ) : null}
    </div>
  );
}

export function ScoreBoard({ game, home, away, className }: ScoreBoardProps) {
  const display = describeGame(game);
  return (
    <section
      // Joined, not glued: Tailwind's scanner skips a candidate that runs straight into `${`, so
      // `md:p-8${…}` was never generated and the board kept 20px of padding on desktop.
      className={['sx-card sx-board p-5 md:p-8', className].filter(Boolean).join(' ')}
      aria-label="Scoreboard"
    >
      <p className="sr-only">
        {display.sentence}
        {display.sourceMark === 'si.com' ? ' Score via si.com.' : ''}
      </p>
      <p
        className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-ink-3 md:justify-center"
        aria-hidden="true"
      >
        {/* A scheduled game's status label IS its time, and the date line beside it prints the
            time again with its zone: the board read "3:30 PM NL Fri Oct 2, 3:30 PM PT". Only the
            chips (league / NL / postseason) are kept from the label then, as GameRow and GameCard
            do. */}
        {statusLabelIsTime(game, display.statusLabel) ? (
          <GameChips display={display} />
        ) : (
          <StatusLabel display={display} />
        )}
        <span>
          {shortDate(game.dateLocal)}
          {game.isTimeTba ? ', time TBA' : `, ${timeOfDayPT(game.dateLocal)}`}
        </span>
        {game.venue.name ? (
          <>
            <span>&middot;</span>
            <span>{game.venue.name}</span>
          </>
        ) : null}
        {display.sourceMark === 'si.com' ? (
          <>
            <span>&middot;</span>
            {/* The legend for StatusLabel's † (a footnote mark is never left unexplained). */}
            <span>&dagger; Score via si.com</span>
          </>
        ) : null}
      </p>
      <div
        className="mt-3 md:mt-6 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-8"
        aria-hidden="true"
      >
        {/* Away before home, the same order as every list on the site. */}
        <BoardSide
          side={display.away}
          sub={away?.sub}
          showScore={display.showScores}
          align="away"
        />
        <div className="h-px bg-divider md:h-auto md:bg-transparent">
          <span className="hidden text-title text-ink-3 md:inline">&ndash;</span>
        </div>
        <BoardSide
          side={display.home}
          sub={home?.sub}
          showScore={display.showScores}
          align="home"
        />
      </div>
      {display.note ? (
        <p className="mt-3 mb-0 text-meta text-ink-3 md:mt-6 md:text-center">{display.note}</p>
      ) : null}
    </section>
  );
}

export default ScoreBoard;

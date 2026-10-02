import Link from 'next/link';

import { EM_DASH, clockTime, monthDay, shortDate, timeOfDay } from '../../lib/format';
import { getTeamBySlug } from '../../lib/teams';
import type { Game, TeamSlug } from '../../lib/types';

import ExternalLink from './ExternalLink';
import ResultChip from './ResultChip';
import { ScoreGlyph } from './ScoreCell';
import StatusLabel from './StatusLabel';
import Tag from './Tag';
import TeamMonogram from './TeamMonogram';
import { describeGame, type SideView } from './game-view';

/**
 * GameRow / GameCard / GameLine / GameLogRow (DESIGN §7.4, modernization brief §4.15).
 *
 * A row is a three-column grid: a lead column (date · time · the written status label), the two
 * team lines — AWAY on top, HOME below, each `[chip] [monogram] [name] [score]` — and a chevron.
 * The score column is mono/tabular so scores align down a list, and the winner's number is 600
 * weight in `--sx-text` against the loser's 400 in `--sx-text-2` (the fourth redundant channel,
 * R-19). Exactly two ScoreGlyphs per row, away then home.
 *
 * The row is a `<details>` / `<summary>` pair, so EXPAND WORKS WITH ZERO JAVASCRIPT. Venue,
 * stream, tickets, the box score and the /game/[id] link live in the panel, which is why 174
 * venue addresses never enter the initial payload of a list page.
 *
 * A non-SCVAL opponent gets a ghost monogram (initials on the inset surface, no school colour)
 * and no link (DESIGN §8).
 */
export interface GameViewProps {
  game: Game;
  /** Orients "vs / at" and the W/L/T from this team's side. */
  perspective?: TeamSlug | null;
  showDate?: boolean;
  showTime?: boolean;
  /** Default true on /schedule and /; false in dense tables. */
  showRecap?: boolean;
  /**
   * Passed through to `StatusLabel`. Set it false in a context where EVERY game is non-league —
   * a CCS bracket, for one — because marking the majority is noise (DESIGN §5.4).
   */
  showNonLeague?: boolean;
  defaultExpanded?: boolean;
  className?: string;
}

/**
 * Initials for a non-SCVAL opponent's ghost monogram. Decorative only (aria-hidden, the name sits
 * beside it): the registry's abbrs are ours and never derived by munging, so a school we do not
 * track gets the first letter of up to two words of its source name, and nothing pretends to be
 * its colours.
 */
function ghostInitials(name: string): string {
  const words = name
    .replace(/['’]/g, '')
    .split(/[\s-]+/)
    .filter((w) => w && !/^(high|school|hs|the|of)$/i.test(w));
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

function TeamLine({ side, showScore }: { side: SideView; showScore: boolean }) {
  const team = side.slug ? getTeamBySlug(side.slug) : undefined;
  return (
    // One line per side: chip 20 · monogram 24 · name · score 32, 8px apart. The status label
    // lives in the row's lead column now, so nothing trails the score and the name keeps
    // everything that is left (≥ 88px at 320, DESIGN brief §4.15) without a floor or a wrap.
    <span className="flex items-center gap-2">
      <ResultChip kind={side.chip} size={20} />
      {team ? (
        <TeamMonogram team={team} size={24} />
      ) : (
        <span
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-[6px] border border-hairline bg-surface-2 text-[0.6875rem] font-semibold text-ink-3"
          aria-hidden="true"
        >
          {ghostInitials(side.name)}
        </span>
      )}
      <span
        className={`min-w-0 flex-1 truncate text-body ${
          side.weight === 'winner' ? 'font-semibold text-ink' : 'text-ink-2'
        }`}
      >
        {/* The dense row renders the SHORT name (DESIGN §3.3's wireframe writes "Mitty", not
            "Archbishop Mitty High School"). `display.sentence` keeps the full name for a screen
            reader. */}
        {side.shortName}
      </span>
      {showScore ? (
        <span className="w-8 shrink-0 text-right">
          <ScoreGlyph side={side} size="score" />
        </span>
      ) : null}
    </span>
  );
}

/** A scheduled game's status label is its own clock time ("4:00 PM", "TIME TBA"). */
function statusLabelIsTime(game: Game, statusLabel: string): boolean {
  return (
    statusLabel === 'TIME TBA' || (!game.isTimeTba && statusLabel === timeOfDay(game.dateLocal))
  );
}

/** The pills in an expanded panel: real links only, never a dead affordance. */
function GameLinks({ game }: { game: Game }) {
  const address = game.venue.address;
  const directions = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${address.street}, ${address.city}, ${address.region} ${address.postalCode}`,
      )}`
    : null;
  const links: Array<{ href: string; label: string }> = [];
  if (directions) links.push({ href: directions, label: 'Directions' });
  if (game.urls.nfhsStream) links.push({ href: game.urls.nfhsStream, label: 'NFHS stream' });
  if (game.urls.goFan) links.push({ href: game.urls.goFan, label: 'Tickets' });
  if (game.urls.maxpreps) links.push({ href: game.urls.maxpreps, label: 'MaxPreps box score' });
  return (
    <p className="m-0 flex flex-wrap gap-2">
      {/* The way on to the whole contest comes first, as the one accent pill. */}
      <Link
        href={`/game/${game.contestId}`}
        prefetch={false}
        className="sx-pill sx-pill-accent min-h-11"
      >
        Full game page
      </Link>
      {/* The open panel is surface-2, the pill's own fill, so these pills take the card
          surface instead or they would read as bare text links. */}
      {links.map((l) => (
        <ExternalLink key={l.href} href={l.href} className="sx-pill bg-surface hover:bg-surface-3">
          {l.label}
        </ExternalLink>
      ))}
    </p>
  );
}

function GameDetailBody({ game, showRecap }: { game: Game; showRecap: boolean }) {
  return (
    // Indented to the team column (gutter + the 70px lead column + its 8px gap), so the panel
    // reads as belonging to the two names above it.
    <div className="space-y-3 border-t border-divider bg-surface-2 pr-gutter pb-4 pt-3 pl-[calc(var(--spacing-gutter)+4.875rem)] text-meta">
      {showRecap && game.recap ? <p className="m-0 text-ink-2">{game.recap}</p> : null}
      {game.venue.name ? <p className="m-0 text-ink-2">{game.venue.name}</p> : null}
      {/* `contest.location` is a NOTE field, not a venue field — live values include
          "Senior Night" and a coach's scoring note — so it is never labelled "Venue". */}
      {game.venue.text ? <p className="m-0 text-ink-3">Note: {game.venue.text}</p> : null}
      <GameLinks game={game} />
    </div>
  );
}

export function GameRow({
  game,
  perspective,
  showDate = false,
  showTime = true,
  showRecap = true,
  showNonLeague = true,
  defaultExpanded = false,
  className,
}: GameViewProps) {
  const display = describeGame(game, perspective);
  // The clock face alone (DESIGN §3.3's wireframe writes `5:30`): the lead column is 64px, and
  // `display.sentence` and the status label below the time both still carry the full `4:00 PM PT`.
  const when = game.isTimeTba ? 'TBA' : clockTime(game.dateLocal);
  // A scheduled game's status label IS its time ("4:00 PM", "TIME TBA"), so the clock line
  // above it would only repeat it.
  const statusIsTime = statusLabelIsTime(game, display.statusLabel);
  return (
    <details
      open={defaultExpanded || undefined}
      className={`${display.isNonLeague ? 'sx-nonleague ' : ''}bg-surface${
        className ? ` ${className}` : ''
      }`}
    >
      {/* Three columns — lead (date · time · status), the two team lines, the chevron — so the
          status word never pushes a team line onto a third row. */}
      <summary className="sx-tap relative grid min-h-gamerow cursor-pointer list-none grid-cols-[4.375rem_minmax(0,1fr)_1rem] items-center gap-x-2 px-gutter py-3 [&::-webkit-details-marker]:hidden">
        <span className="sr-only">{display.sentence}</span>
        <span className="flex min-w-0 flex-col gap-1 self-start pt-0.5" aria-hidden="true">
          {showDate ? (
            <span className="sx-num text-cell text-ink-2">{monthDay(game.dateLocal)}</span>
          ) : null}
          {showTime && !statusIsTime ? (
            <span
              className={`sx-num text-cell text-ink-2${display.strikeTime ? ' line-through' : ''}`}
            >
              {when}
            </span>
          ) : null}
          <StatusLabel display={display} showNonLeague={showNonLeague} />
        </span>
        <span className="min-w-0 space-y-1.5" aria-hidden="true">
          <TeamLine side={display.away} showScore={display.showScores} />
          <TeamLine side={display.home} showScore={display.showScores} />
        </span>
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
      <GameDetailBody game={game} showRecap={showRecap} />
    </details>
  );
}

/**
 * The ≥768px card in an auto-fill grid (home, /schedule, /scores/[date]). Recap and venue are
 * always visible and there is nothing to expand. The date is not printed: every host names the
 * day in its own heading. The whole card is one stretched "Game page" link; the box-score link
 * sits above the stretch so it stays its own target.
 */
export function GameCard({
  game,
  perspective,
  showRecap = true,
  showNonLeague = true,
  className,
}: GameViewProps) {
  const display = describeGame(game, perspective);
  return (
    <div
      className={`sx-card sx-lift relative flex flex-col gap-3 p-4 md:p-5${
        className ? ` ${className}` : ''
      }`}
    >
      <span className="sr-only">{display.sentence}</span>
      <div className="flex items-center justify-between gap-2" aria-hidden="true">
        <span className={`sx-num text-cell text-ink-2${display.strikeTime ? ' line-through' : ''}`}>
          {game.isTimeTba ? 'Time TBA' : timeOfDay(game.dateLocal)}
        </span>
        {/* A scheduled game's status label is this same time; repeating it on the right read
            "3:30 PM … 3:30 PM". Only the NL tag is left to say there. */}
        {statusLabelIsTime(game, display.statusLabel) ? (
          showNonLeague && display.isNonLeague ? (
            <Tag label="non-league">NL</Tag>
          ) : null
        ) : (
          <StatusLabel display={display} showNonLeague={showNonLeague} className="justify-end" />
        )}
      </div>
      <div className="space-y-2" aria-hidden="true">
        <TeamLine side={display.away} showScore={display.showScores} />
        <TeamLine side={display.home} showScore={display.showScores} />
      </div>
      {showRecap && game.recap ? (
        <p className="sx-clamp-2 m-0 text-meta text-ink-2">{game.recap}</p>
      ) : null}
      {display.note ? <p className="m-0 text-meta text-ink-3">{display.note}</p> : null}
      <div className="mt-auto flex items-center gap-4 text-meta">
        <Link
          href={`/game/${game.contestId}`}
          prefetch={false}
          className="sx-action font-medium text-accent no-underline hover:underline after:absolute after:inset-0 after:rounded-[var(--sx-r-card-lg)]"
        >
          Game page
        </Link>
        {game.urls.maxpreps ? (
          <ExternalLink href={game.urls.maxpreps} className="sx-action relative z-10 gap-1">
            box
          </ExternalLink>
        ) : null}
      </div>
    </div>
  );
}

/** The one-line "Next up" form: `5:30 PM  Homestead at Los Altos`. */
export function GameLine({ game, perspective, showNonLeague = true, className }: GameViewProps) {
  const display = describeGame(game, perspective);
  const awayTeam = game.away.slug ? getTeamBySlug(game.away.slug) : undefined;
  const homeTeam = game.home.slug ? getTeamBySlug(game.home.slug) : undefined;
  return (
    <Link
      href={`/game/${game.contestId}`}
      prefetch={false}
      className={`sx-tap relative grid min-h-row-1 grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-x-3 px-gutter py-2 text-body no-underline${
        className ? ` ${className}` : ''
      }`}
    >
      <span className="sx-num text-cell text-ink-2" aria-hidden="true">
        {game.isTimeTba ? 'TBA' : timeOfDay(game.dateLocal)}
      </span>
      <span className="min-w-0 truncate text-ink">
        {awayTeam ? awayTeam.shortName : game.away.name}
        {game.site === 'neutral' ? ' vs ' : ' at '}
        {homeTeam ? homeTeam.shortName : game.home.name}
      </span>
      {display.kind === 'final' ? (
        <StatusLabel display={display} showNonLeague={showNonLeague} className="shrink-0" />
      ) : display.isNonLeague ? (
        <Tag label="non-league">NL</Tag>
      ) : (
        <span className="sr-only">, league game</span>
      )}
    </Link>
  );
}

/**
 * A dense game-log line for a team page: `Sep 24 (L) 0–7 vs Saint Francis FINAL`.
 *
 * ONE `sr-only` sentence and everything visual behind a single `aria-hidden`, exactly as
 * `GameRow`'s summary and `GameCard` already do. Leaving `ResultChip` (role="img") and
 * `StatusLabel` outside made the link's accessible name repeat itself — "…final. Loss FINAL" —
 * while the row's only date was aria-hidden and announced nowhere, so the date leads the
 * sentence here.
 *
 * Four fixed columns (date · chip · score · the rest) so the dates, chips and scores line up
 * down the log. The last column wraps the status under the opponent rather than truncating the
 * opponent: the opponent is the thing the row exists to say.
 */
export function GameLogRow({
  game,
  perspective,
  showNonLeague = true,
  className,
}: GameViewProps) {
  const display = describeGame(game, perspective);
  const mineIsHome = perspective ? game.home.slug === perspective : true;
  const opponent = mineIsHome ? display.away : display.home;
  const mine = mineIsHome ? display.home : display.away;
  const opponentTeam = opponent.slug ? getTeamBySlug(opponent.slug) : undefined;
  const day = shortDate(game.dateLocal).slice(4);
  return (
    <Link
      href={`/game/${game.contestId}`}
      prefetch={false}
      className={`sx-tap relative grid min-h-row-1 grid-cols-[3.5rem_1.25rem_3.25rem_minmax(0,1fr)] items-center gap-x-3 px-gutter py-2 text-meta no-underline${
        display.isNonLeague ? ' sx-nonleague' : ''
      }${className ? ` ${className}` : ''}`}
    >
      <span className="sr-only">
        {day}: {display.sentence}
      </span>
      <span className="sx-num text-cell text-ink-2" aria-hidden="true">
        {day}
      </span>
      <span className="inline-flex" aria-hidden="true">
        <ResultChip
          kind={display.perspectiveOutcome ?? (display.showScores ? 'pending' : 'none')}
          size={20}
        />
      </span>
      <span className="sx-num whitespace-nowrap text-right" aria-hidden="true">
        {display.showScores ? (
          <>
            <ScoreGlyph side={mine} size="meta" />
            <span className="text-ink-3">{'–'}</span>
            <ScoreGlyph side={opponent} size="meta" />
          </>
        ) : (
          <span className="text-ink-3">{EM_DASH}</span>
        )}
      </span>
      <span
        className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-0.5"
        aria-hidden="true"
      >
        <span className="line-clamp-2 min-w-[6.5rem] flex-1 text-ink">
          {display.versus ?? 'vs'} {opponentTeam ? opponentTeam.name : opponent.name}
        </span>
        <StatusLabel display={display} showNonLeague={showNonLeague} className="max-w-full" />
      </span>
    </Link>
  );
}

export default GameRow;

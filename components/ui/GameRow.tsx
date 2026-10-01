import Link from 'next/link';

import { EM_DASH, clockTime, shortDate, timeOfDay } from '../../lib/format';
import { getTeamBySlug } from '../../lib/teams';
import type { Game, TeamSlug } from '../../lib/types';

import ExternalLink from './ExternalLink';
import ResultChip from './ResultChip';
import { ScoreGlyph } from './ScoreCell';
import StatusLabel from './StatusLabel';
import TeamMonogram from './TeamMonogram';
import { describeGame, type SideView } from './game-view';

/**
 * GameRow / GameCard / GameLine (DESIGN §7.4).
 *
 * A row is a two-line stack — AWAY on top, HOME below — each line `[chip] [monogram] [name] …
 * [score]`, with the written status label right of the home score. The score column is
 * mono/tabular so scores align down a list, and the winner's number is 600 weight in `--sx-text`
 * against the loser's 400 in `--sx-text-2` (the fourth redundant channel, R-19).
 *
 * The row is a `<details>` / `<summary>` pair, so EXPAND WORKS WITH ZERO JAVASCRIPT. Venue,
 * stream, tickets, the box score and the /game/[id] link live in the panel, which is why 174
 * venue addresses never enter the initial payload of a list page.
 *
 * A non-SCVAL opponent renders as plain text — no monogram fill, no link (DESIGN §8).
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

function TeamLine({
  side,
  showScore,
  trailing,
}: {
  side: SideView;
  showScore: boolean;
  trailing?: React.ReactNode;
}) {
  const team = side.slug ? getTeamBySlug(side.slug) : undefined;
  return (
    // `flex-wrap` plus a FLOOR under the name, because every other child here is `shrink-0`:
    // chip 20 + monogram 20 + score 28 + the status label and its NL tag. Without the floor the
    // name is the only thing left to give, and at 320px it gave everything — school names
    // rendered as "F…" and "Lyn…", i.e. the row stopped saying who played. At 390px, DESIGN
    // §3.3's reference width, the 6px gaps keep the whole line on ONE row (a 68px GameRow);
    // below that the trailing cluster takes a second line and the name keeps its 5.5rem.
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <ResultChip kind={side.chip} size={20} />
      {team ? (
        <TeamMonogram team={team} size={20} />
      ) : (
        <span className="inline-block shrink-0" style={{ width: 20 }} />
      )}
      <span
        className={`min-w-[5.5rem] flex-1 truncate text-body ${
          side.weight === 'winner' ? 'font-semibold text-ink' : 'text-ink-2'
        }`}
      >
        {/* The dense row renders the SHORT name (DESIGN §3.3's wireframe writes "Mitty", not
            "Archbishop Mitty High School"): once the score, the status word and the NL/OT tag
            have taken their share of a 390px row, the name gets ~120px and the full one
            truncates mid-word. `display.sentence` keeps the full name for a screen reader. */}
        {side.shortName}
      </span>
      {showScore ? (
        <span className="w-7 shrink-0 text-right">
          <ScoreGlyph side={side} size="score" />
        </span>
      ) : null}
      {trailing}
    </span>
  );
}

/** The chips in an expanded panel: real links only, never a dead affordance. */
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
  if (links.length === 0) return null;
  return (
    <p className="m-0 flex flex-wrap gap-2">
      {links.map((l) => (
        <ExternalLink
          key={l.href}
          href={l.href}
          className="inline-flex h-10 items-center rounded-chip border border-hairline bg-surface px-3 text-meta no-underline"
        >
          {l.label}
        </ExternalLink>
      ))}
    </p>
  );
}

function GameDetailBody({ game, showRecap }: { game: Game; showRecap: boolean }) {
  return (
    <div className="space-y-2 border-t border-hairline bg-surface-2 px-gutter py-3 text-meta">
      {showRecap && game.recap ? <p className="m-0 text-ink-2">{game.recap}</p> : null}
      {game.venue.name ? <p className="m-0 text-ink-2">{game.venue.name}</p> : null}
      {/* `contest.location` is a NOTE field, not a venue field — live values include
          "Senior Night" and a coach's scoring note — so it is never labelled "Venue". */}
      {game.venue.text ? <p className="m-0 text-ink-3">Note: {game.venue.text}</p> : null}
      <GameLinks game={game} />
      <p className="m-0">
        {/* A standalone action, so it carries its own 24px box (WCAG 2.5.8) rather than
            inheriting the 17px height of the text around it. */}
        <Link
          href={`/game/${game.contestId}`}
          prefetch={false}
          className="inline-flex min-h-6 items-center text-accent hover:underline"
        >
          Full game page <span aria-hidden="true">&rarr;</span>
        </Link>
      </p>
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
  // The clock face alone (DESIGN §3.3's wireframe writes `5:30`): at 390px a 56px `4:00 PM`
  // column cost the school names the 16px they needed to fit beside the status word, which is
  // what the wireframe's 68px row assumes. `display.sentence` and the status label beside the
  // score both still carry the full `4:00 PM PT`.
  const when = game.isTimeTba ? 'TBA' : clockTime(game.dateLocal);
  return (
    <details
      open={defaultExpanded || undefined}
      className={`${display.isNonLeague ? 'sx-nonleague ' : ''}bg-surface${
        className ? ` ${className}` : ''
      }`}
    >
      <summary className="sx-tap flex min-h-gamerow cursor-pointer list-none items-center gap-2 px-gutter py-2 [&::-webkit-details-marker]:hidden">
        <span className="sr-only">{display.sentence}</span>
        {showDate ? (
          <span className="sx-num w-14 shrink-0 text-meta text-ink-2" aria-hidden="true">
            {shortDate(game.dateLocal)}
          </span>
        ) : null}
        {showTime ? (
          <span
            className={`sx-num w-10 shrink-0 text-meta text-ink-2 ${
              display.strikeTime ? 'line-through' : ''
            }`}
            aria-hidden="true"
          >
            {when}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 space-y-0.5" aria-hidden="true">
          <TeamLine side={display.away} showScore={display.showScores} />
          <TeamLine
            side={display.home}
            showScore={display.showScores}
            trailing={
              <StatusLabel
                display={display}
                showNonLeague={showNonLeague}
                className="ml-auto shrink-0"
              />
            }
          />
        </span>
        <span className="shrink-0 text-ink-3" aria-hidden="true">
          &#8964;
        </span>
      </summary>
      <GameDetailBody game={game} showRecap={showRecap} />
    </details>
  );
}

/**
 * The desktop 3-up card (2-up at 768px, GameRow below). Recap and venue are always visible and
 * there is nothing to expand.
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
      className={`${
        display.isNonLeague ? 'sx-nonleague ' : ''
      }rounded-card border border-hairline bg-surface p-3${className ? ` ${className}` : ''}`}
    >
      <span className="sr-only">{display.sentence}</span>
      <div className="space-y-1" aria-hidden="true">
        <span className="sx-num block text-meta text-ink-2">
          {shortDate(game.dateLocal)} &middot; {game.isTimeTba ? 'TIME TBA' : timeOfDay(game.dateLocal)}
        </span>
        <TeamLine side={display.away} showScore={display.showScores} />
        <TeamLine side={display.home} showScore={display.showScores} />
        <StatusLabel display={display} showNonLeague={showNonLeague} />
      </div>
      {showRecap && game.recap ? (
        <p className="sx-clamp-2 mt-2 mb-0 text-meta text-ink-2">{game.recap}</p>
      ) : null}
      {display.note ? <p className="mt-2 mb-0 text-meta text-ink-3">{display.note}</p> : null}
      <p className="mt-2 mb-0 text-meta">
        <Link
          href={`/game/${game.contestId}`}
          prefetch={false}
          className="text-accent hover:underline"
        >
          Game page <span aria-hidden="true">&rarr;</span>
        </Link>
        {game.urls.maxpreps ? (
          <>
            {' · '}
            <ExternalLink href={game.urls.maxpreps}>box</ExternalLink>
          </>
        ) : null}
      </p>
    </div>
  );
}

/** The one-line "NEXT UP" form: `5:30 PM  Homestead at Los Altos`. */
export function GameLine({ game, perspective, showNonLeague = true, className }: GameViewProps) {
  const display = describeGame(game, perspective);
  const awayTeam = game.away.slug ? getTeamBySlug(game.away.slug) : undefined;
  const homeTeam = game.home.slug ? getTeamBySlug(game.home.slug) : undefined;
  return (
    <Link
      href={`/game/${game.contestId}`}
      prefetch={false}
      className={`sx-tap flex min-h-11 items-center gap-3 px-gutter text-body no-underline${
        className ? ` ${className}` : ''
      }`}
    >
      <span className="sx-num w-16 shrink-0 text-meta text-ink-2" aria-hidden="true">
        {game.isTimeTba ? 'TBA' : timeOfDay(game.dateLocal)}
      </span>
      <span className="min-w-0 flex-1 truncate text-ink">
        {awayTeam ? awayTeam.shortName : game.away.name}
        {game.site === 'neutral' ? ' vs ' : ' at '}
        {homeTeam ? homeTeam.shortName : game.home.name}
      </span>
      {display.kind === 'final' ? (
        <StatusLabel display={display} showNonLeague={showNonLeague} className="shrink-0" />
      ) : (
        <span className="shrink-0 text-meta text-ink-3">
          {display.isNonLeague ? 'non-league' : 'league'}
        </span>
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
      className={`sx-tap flex min-h-[3.25rem] items-center px-gutter text-meta no-underline${
        display.isNonLeague ? ' sx-nonleague' : ''
      }${className ? ` ${className}` : ''}`}
    >
      <span className="sr-only">
        {day}: {display.sentence}
      </span>
      {/* `flex-wrap`, for the same reason `TeamLine` above has it: every child here is `shrink-0`
          except the opponent name, and the name has a 5.5rem FLOOR — so with `nowrap` the floor
          guaranteed overflow instead of preventing truncation. At 320px /teams/homestead pushed the
          document to 359px and /teams/st-ignatius to 367px, against DESIGN §10.8 / R-8's "no
          horizontal page scroll at 400px or at 320px" (WCAG 1.4.10 Reflow), and on any row reading
          SCORE NOT REPORTED the label ran off the right edge. Wrapping costs nothing where the line
          already fits — flex only breaks a line it cannot lay out — and the two lines still sit
          inside the row's 3.25rem floor, so no row changes height. */}
      <span
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5"
        aria-hidden="true"
      >
        <span className="sx-num w-14 shrink-0 text-ink-2">{day}</span>
        <ResultChip
          kind={display.perspectiveOutcome ?? (display.showScores ? 'pending' : 'none')}
          size={16}
        />
        <span className="sx-num w-12 shrink-0 text-right">
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
        <span className="min-w-[5.5rem] flex-1 truncate text-ink">
          {display.versus ?? 'vs'} {opponentTeam ? opponentTeam.name : opponent.name}
        </span>
        {/* `ml-auto` so the status stays right-aligned on whichever line it lands on, exactly as
            SeasonSeries' trailing cluster does. */}
        <StatusLabel display={display} showNonLeague={showNonLeague} className="ml-auto shrink-0" />
      </span>
    </Link>
  );
}

export default GameRow;

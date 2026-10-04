import Tag from './Tag';
import type { GameDisplay, StatusTone } from './game-view';

/**
 * The written label beside every score: FINAL · LIVE · SCORE NOT REPORTED · POSTPONED ·
 * CANCELLED · the time · TIME TBA (DESIGN §5.2, §6.5 channel 2), plus the game's chips
 * (SPEC §10.4): the league chip (`SCVAL`, `BVAL`, …) of a counted game or `NL` for a non-league
 * game (both from `countsFor`), the postseason chip (`SCVAL crossover`, `BVAL play-in`,
 * `MCAL tournament`, `EAL Super Regional`, `CCS`), and the `†` marker of a score published from
 * si.com. The decider tag ('OT', '2 OT', 'SO', 'F') carries its meaning in words for a screen
 * reader: 'by forfeit', 'decided on 1 v 1s' (an EAL 1 v 1 win), else 'after overtime'.
 *
 * Channel 2 is never abbreviated to a dot, and LIVE always carries the word as well as the
 * accent dot, so the pulse is never load-bearing. Set in 12px sans semibold caps; the strings are
 * already uppercase, so `uppercase` changes nothing a reader hears.
 *
 * Client-safe: it imports only TYPES from game-view (the home My-team card renders it).
 */
export interface StatusLabelProps {
  display: GameDisplay;
  /**
   * The game's chips (league / NL, postseason, †). Set it false in a context that prints them
   * elsewhere, or where every game is the same kind and marking each one is noise (DESIGN §5.4).
   */
  showNonLeague?: boolean;
  className?: string;
}

const TONE: Record<StatusTone, string> = {
  ink: 'text-ink',
  'ink-2': 'text-ink-2',
  'ink-3': 'text-ink-3',
  accent: 'text-accent-ink',
};

/** The accessible words of a decider tag other than 'OT' / '2 OT' (both 'after overtime'). */
const DECIDER_LABEL: Readonly<Record<string, string>> = { F: 'by forfeit', SO: 'decided on 1 v 1s' };

/** The † beside a score published from si.com: a title for a pointer, words for a screen reader. */
export function SourceMark({ display }: { display: Pick<GameDisplay, 'sourceMark'> }) {
  if (display.sourceMark !== 'si.com') return null;
  return (
    <span className="font-sans text-micro font-semibold text-ink-3" title="Score via si.com">
      <span aria-hidden="true">&dagger;</span>
      <span className="sr-only">Score via si.com</span>
    </span>
  );
}

/**
 * The league / NL and postseason chips alone, for a row that prints them apart from its status
 * label (GameRow's lead column, a scheduled GameCard whose label is its own clock time). Renders
 * nothing when the game has none. The † travels with the score, in StatusLabel.
 */
export function GameChips({
  display,
  className,
}: {
  display: Pick<GameDisplay, 'leagueTag' | 'postseasonTag' | 'isNonLeague'>;
  className?: string;
}) {
  const { leagueTag, postseasonTag, isNonLeague } = display;
  if (!leagueTag && !postseasonTag && !isNonLeague) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1${className ? ` ${className}` : ''}`}>
      {leagueTag ? <Tag label={`${leagueTag} league game`}>{leagueTag}</Tag> : null}
      {isNonLeague ? <Tag label="non-league">NL</Tag> : null}
      {postseasonTag ? <Tag label={postseasonTag}>{postseasonTag}</Tag> : null}
    </span>
  );
}

export function StatusLabel({ display, showNonLeague = true, className }: StatusLabelProps) {
  return (
    <span
      className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-sans text-micro font-semibold uppercase tracking-[0.04em] ${
        TONE[display.statusTone]
      }${className ? ` ${className}` : ''}`}
    >
      {display.liveDot ? <span className="sx-live-dot" aria-hidden="true" /> : null}
      <span className={display.strikeTime ? 'line-through' : undefined}>{display.statusLabel}</span>
      {display.deciderTag ? (
        <Tag label={DECIDER_LABEL[display.deciderTag] ?? 'after overtime'}>{display.deciderTag}</Tag>
      ) : null}
      {display.shootoutText ? (
        <span className="sx-num normal-case tracking-normal text-ink-3">
          {display.shootoutText}
        </span>
      ) : null}
      {/* The source of the score is never optional: it travels with the score. */}
      <SourceMark display={display} />
      {showNonLeague ? <GameChips display={display} className="normal-case tracking-normal" /> : null}
    </span>
  );
}

export default StatusLabel;

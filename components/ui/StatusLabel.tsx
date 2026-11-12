import type { GameDisplay } from './describe-game';
import { sourceMarkWords } from './source-mark';

/**
 * The written status of a game, in full words, where there is room for them (the game page's
 * header, a team's next game, a bracket cell): `Final`, `Final, overtime`, `Final, shootout 3-2`,
 * `Score not reported`, `Postponed`, the start time, `Time TBA`; then the † of a score published
 * from another source, and (unless `showChips` is false) the game's kind: the league code of a
 * counted game (`SCVAL`), `Non-league`, or the postseason round. Plain text in the `.sx-status`
 * face (DESIGN §33): no chip, no fill, no caps. In a game ROW the status is the two-line status
 * slot instead (components/game-row/summary.tsx `GameStatus`).
 *
 * Client-safe: it imports only TYPES from describe-game (the home My-team card renders it).
 */
export interface StatusLabelProps {
  display: GameDisplay;
  /**
   * The game's chips (league / NL, postseason). Never the †: the source of a score travels with
   * the score (SourceMark), with or without the chips. Set it false in a context that prints them
   * elsewhere, or where every game is the same kind and marking each one is noise (DESIGN §5.4).
   */
  showChips?: boolean;
  className?: string;
}

const STATUS_CASE: Readonly<Record<string, string>> = {
  FINAL: 'Final',
  'SCORE NOT REPORTED': 'Score not reported',
  POSTPONED: 'Postponed',
  CANCELLED: 'Cancelled',
  'TIME TBA': 'Time TBA',
};

/** describeGame's status label in sentence case: 'FINAL' is 'Final'; a time ('3:00 PM') is itself. */
export function statusCase(label: string): string {
  return STATUS_CASE[label] ?? label;
}

/**
 * The decider in words, after the status word: `overtime`, `2 overtimes`, `forfeit`, a shootout in
 * the words of the section whose rule decided the game (`decided on 1 v 1s`; the display carries
 * them, this module is client-safe and cannot read the registry), or `shootout 3-2` with a tally.
 */
function deciderWords(display: Pick<GameDisplay, 'deciderTag' | 'shootoutLabel' | 'shootoutText'>): string | null {
  if (display.shootoutText) {
    return `shootout ${display.shootoutText.replace(/[()]/g, '').replace(/\s*SO$/, '').replace('\u2013', '-')}`;
  }
  const tag = display.deciderTag;
  if (!tag) return null;
  if (tag === 'F') return 'forfeit';
  if (tag === 'SO') return display.shootoutLabel ?? 'shootout';
  if (tag === 'OT') return 'overtime';
  const periods = /^(\d+) OT$/.exec(tag)?.[1];
  return periods ? `${periods} overtimes` : 'overtime';
}

/**
 * The † beside a score published from si.com, from the San Diego Section's bracket sheet, or (JV only) from a
 * school's own athletics site: a title
 * for a pointer, words for a screen reader.
 */
export function SourceMark({ display }: { display: Pick<GameDisplay, 'sourceMark'> }) {
  if (display.sourceMark === null) return null;
  const words = sourceMarkWords(display.sourceMark);
  return (
    <span className="text-micro font-semibold text-ink-3" title={words}>
      <span aria-hidden="true">&dagger;</span>
      <span className="sr-only">{words}</span>
    </span>
  );
}

/**
 * The round's PRINTED word: `tournament` is the shorter word the sports pages use, so the phrase
 * stays short in a narrow column. The full name is still what a screen reader hears, and every
 * sentence and title keeps it (`postseasonTag`).
 */
const CHIP_WORD: Readonly<Record<string, string>> = { tournament: 'tourney' };

/** The chip's printed words: `MCAL tournament` is `MCAL tourney`; every other tag is itself. */
export function postseasonChipText(tag: string): string {
  return tag
    .split(' ')
    .map((word) => CHIP_WORD[word.toLowerCase()] ?? word)
    .join(' ');
}

/**
 * The game's kind alone, as plain text (`SCVAL`, `Non-league`, `CCS`), for a host that prints it
 * apart from the status. Renders nothing when the game has none.
 *
 * `part`: `'codes'` is the league / non-league word alone, `'phrase'` the postseason round alone.
 */
export function GameChips({
  display,
  className,
  part = 'all',
}: {
  display: Pick<GameDisplay, 'leagueTag' | 'postseasonTag' | 'isNonLeague'>;
  className?: string;
  part?: 'all' | 'codes' | 'phrase';
}) {
  const leagueTag = part === 'phrase' ? null : display.leagueTag;
  const isNonLeague = part === 'phrase' ? false : display.isNonLeague;
  const postseasonTag = part === 'codes' ? null : display.postseasonTag;
  if (!leagueTag && !postseasonTag && !isNonLeague) return null;
  return (
    <span className={['sx-tag whitespace-normal', className].filter(Boolean).join(' ')}>
      {leagueTag ? (
        <>
          <span aria-hidden="true">{leagueTag}</span>
          <span className="sr-only">{leagueTag} league game</span>
        </>
      ) : null}
      {isNonLeague ? 'Non-league' : null}
      {postseasonTag ? (
        <>
          {leagueTag || isNonLeague ? ', ' : null}
          <span aria-hidden="true">{postseasonChipText(postseasonTag)}</span>
          <span className="sr-only">{postseasonTag}</span>
        </>
      ) : null}
    </span>
  );
}

export function StatusLabel({ display, showChips = true, className }: StatusLabelProps) {
  const decider = deciderWords(display);
  return (
    <span className={['sx-status', className].filter(Boolean).join(' ')}>
      <span className={display.strikeTime ? 'line-through' : undefined}>
        {statusCase(display.statusLabel)}
        {decider ? `, ${decider}` : ''}
      </span>
      {/* The source of the score is never optional: it travels with the score. */}
      <SourceMark display={display} />
      {showChips ? <GameChips display={display} className="ml-2" /> : null}
    </span>
  );
}

export default StatusLabel;

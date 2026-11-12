import Tag from './Tag';
import type { GameDisplay } from './describe-game';
import { sourceMarkWords } from './source-mark';

/**
 * The written label beside a score (DESIGN §5.2, §6.5 channel 2; §33 for the face): the status word
 * as plain 13px/600 text in sentence case (`Final`, `Score not reported`, `Postponed`, `Cancelled`,
 * the time, `Time TBA`), then, as text-only caps tags (`.sx-tag`), the decider (`OT`, `2 OT`, `SO`,
 * `F`) and the game's kind (SPEC §10.4): the league code of a counted game (`SCVAL`), `Non-league`,
 * or the postseason round (`SCVAL crossover`, `MCAL tourney`, `CCS`), and the `†` of a score
 * published from another source. The decider carries its meaning in words for a screen reader: 'by
 * forfeit'; for 'SO', the words of the section whose rule decided the game, resolved by describeGame
 * (GameDisplay.shootoutLabel); else 'after overtime'.
 *
 * Channel 2 is never abbreviated to a dot, and nothing here is a filled chip: the one filled label
 * on the site is `.sx-flag`.
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
 * The accessible words of a decider tag. 'OT' / '2 OT' are both 'after overtime'; 'SO' reads the
 * section's own words from the display (this module is client-safe and cannot read the registry),
 * and a display with none — a hand-built one — falls back to 'decided by a shootout', true of every
 * shootout.
 */
function deciderLabel(display: Pick<GameDisplay, 'deciderTag' | 'shootoutLabel'>): string {
  if (display.deciderTag === 'F') return 'by forfeit';
  if (display.deciderTag === 'SO') return display.shootoutLabel ?? 'decided by a shootout';
  return 'after overtime';
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

/** The postseason round: a text tag that may wrap between its words (a round is a phrase, not a code). */
function PostseasonChip({ tag }: { tag: string }) {
  return (
    <span className="sx-tag rounded-tag whitespace-normal">
      <span aria-hidden="true">{postseasonChipText(tag)}</span>
      <span className="sr-only">{tag}</span>
    </span>
  );
}

/**
 * The league / NL and postseason chips alone, for a row that prints them apart from its status
 * label (GameRow's lead column, a scheduled GameCard whose label is its own clock time). Renders
 * nothing when the game has none. The † travels with the score, in StatusLabel.
 *
 * `part` splits them for a host with a fixed-width tag track (GameLine): `'codes'` is the league /
 * NL code alone, `'phrase'` the postseason chip alone, which that host prints on its own line.
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
    // `.sx-chips` (app/globals.css): a wrapping row of tags, 4px apart, never wider than its host.
    <span className={['sx-chips', className].filter(Boolean).join(' ')}>
      {leagueTag ? <Tag label={`${leagueTag} league game`}>{leagueTag}</Tag> : null}
      {isNonLeague ? <Tag>Non-league</Tag> : null}
      {postseasonTag ? <PostseasonChip tag={postseasonTag} /> : null}
    </span>
  );
}

export function StatusLabel({ display, showChips = true, className }: StatusLabelProps) {
  return (
    // `.sx-status` (app/globals.css) is the plain 13px/600 status face and its wrapping row.
    <span className={['sx-status', className].filter(Boolean).join(' ')}>
      <span className={display.strikeTime ? 'line-through' : undefined}>{statusCase(display.statusLabel)}</span>
      {display.deciderTag ? (
        <Tag label={deciderLabel(display)}>{display.deciderTag}</Tag>
      ) : null}
      {display.shootoutText ? <span className="sx-num font-normal text-ink-2">{display.shootoutText}</span> : null}
      {/* The source of the score is never optional: it travels with the score. */}
      <SourceMark display={display} />
      {showChips ? <GameChips display={display} /> : null}
    </span>
  );
}

export default StatusLabel;

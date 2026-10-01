import Tag from './Tag';
import type { GameDisplay, StatusTone } from './game-view';

/**
 * The written label beside every score: FINAL · LIVE · SCORE NOT REPORTED · POSTPONED ·
 * CANCELLED · the time · TIME TBA (DESIGN §5.2, §6.5 channel 2).
 *
 * Channel 2 is never abbreviated to a dot, and LIVE always carries the word as well as the
 * accent dot, so the pulse is never load-bearing.
 */
export interface StatusLabelProps {
  display: GameDisplay;
  /** Non-league adds the `NL` tag here rather than in the row body. */
  showNonLeague?: boolean;
  className?: string;
}

const TONE: Record<StatusTone, string> = {
  ink: 'text-ink',
  'ink-2': 'text-ink-2',
  'ink-3': 'text-ink-3',
  accent: 'text-accent-ink',
};

export function StatusLabel({ display, showNonLeague = true, className }: StatusLabelProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-kicker font-semibold tracking-[0.10em] uppercase ${
        TONE[display.statusTone]
      }${className ? ` ${className}` : ''}`}
    >
      {display.liveDot ? <span className="sx-live-dot" aria-hidden="true" /> : null}
      <span className={display.strikeTime ? 'line-through' : undefined}>{display.statusLabel}</span>
      {display.deciderTag ? (
        <Tag label={display.deciderTag === 'F' ? 'by forfeit' : 'after overtime'}>
          {display.deciderTag}
        </Tag>
      ) : null}
      {display.shootoutText ? (
        <span className="sx-num normal-case tracking-normal text-ink-3">
          {display.shootoutText}
        </span>
      ) : null}
      {showNonLeague && display.isNonLeague ? <Tag label="non-league">NL</Tag> : null}
    </span>
  );
}

export default StatusLabel;

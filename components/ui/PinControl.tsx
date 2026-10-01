'use client';

import { usePinnedTeam } from './use-pinned-team';

/**
 * Pin / unpin a team (DESIGN §7.12). One of the app's nine client modules: five interactive
 * components (this, ThemeToggle, MyTeamCard, ScheduleFilters and NavLink), two storage modules they
 * share (local-store, use-pinned-team), the pinned-row marker (PinnedTeamMarks) and app/error.tsx,
 * which React requires to be one. DESIGN §7's "four" predates NavLink and the marker.
 *
 * The button reserves its footprint server-side, so swapping in the stored state after hydration
 * costs no layout shift. When `localStorage` is unavailable the control is replaced by one sentence
 * saying so — the page stays fully correct without storage — and a pin pointing at a team that has
 * left the snapshot is cleared and reported in words rather than silently ignored.
 */
export interface PinControlProps {
  slug: string;
  name: string;
  /** Every slug in the snapshot, so a stale pin can be detected and cleared. */
  knownSlugs?: readonly string[];
  variant?: 'button' | 'compact';
  className?: string;
}

export function PinControl({
  slug,
  name,
  knownSlugs,
  variant = 'button',
  className,
}: PinControlProps) {
  const { pinned, ready, available, stalePin, toggle } = usePinnedTeam(knownSlugs);
  const isPinned = ready && pinned === slug;

  if (ready && !available) {
    return (
      <span
        className={`inline-flex h-11 items-center text-meta text-ink-3${
          className ? ` ${className}` : ''
        }`}
      >
        This browser is not storing a pinned team.
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => toggle(slug)}
        aria-pressed={isPinned}
        className={`sx-tap inline-flex h-11 items-center gap-2 rounded-chip border border-hairline bg-surface px-3 text-meta font-semibold text-ink${
          className ? ` ${className}` : ''
        }`}
      >
        <span aria-hidden="true">{isPinned ? '★' : '☆'}</span>
        {variant === 'compact' ? (
          <span className="sr-only">{isPinned ? `Unpin ${name}` : `Pin ${name}`}</span>
        ) : (
          <span>{isPinned ? 'Pinned' : 'Pin this team'}</span>
        )}
        {variant === 'button' ? (
          <span className="sr-only"> &mdash; {name}, saved in this browser only</span>
        ) : null}
      </button>
      {stalePin ? (
        <span className="text-meta text-ink-3">
          Your pinned team is no longer in the data, so the pin was cleared.
        </span>
      ) : null}
    </span>
  );
}

export default PinControl;

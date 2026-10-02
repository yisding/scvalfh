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
    <span
      className={`inline-flex flex-wrap items-center gap-2${className ? ` ${className}` : ''}`}
    >
      <button
        type="button"
        onClick={() => toggle(slug)}
        aria-pressed={isPinned}
        // Pressed reads as pressed: accent-ink on the accent wash (6.5 / 7.55), the
        // `.sx-pill-accent` pairing, held on hover too (a utility outranks the base hover rule).
        // Unpressed stays the neutral grey pill. The words change as well ("Pinned").
        //
        // The press itself darkens the unpressed pill to surface-3: `.sx-tap:active` paints
        // surface-2, which IS the pill's resting colour, so a tap gave no feedback at all. It is
        // scoped to `aria-pressed="false"` so it can never paint over the pressed wash, whatever
        // order Tailwind emits the two variants in.
        //
        // `md:min-w-36` (144px, wider than either label): from 768px the button is `w-auto` at the
        // card's right edge, so "Pin this team" → "Pinned" shrank it and moved its LEFT edge under
        // the pointer. On a phone it is full width already.
        className={`sx-pill sx-tap min-h-11 justify-center font-semibold aria-[pressed=false]:active:bg-surface-3 aria-pressed:bg-accent-wash aria-pressed:text-accent-ink${
          variant === 'button' ? ' w-full md:w-auto md:min-w-36' : ''
        }`}
      >
        {/* 16px star: filled when pinned, an outline when not. aria-pressed carries the state;
            the shape is the visual twin of it, never the only channel (the label changes too). */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden="true"
          className={isPinned ? 'text-accent-ink' : 'text-ink-2'}
          fill={isPinned ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        >
          <path d="M8 1.6l1.95 4.02 4.43.6-3.23 3.08.8 4.4L8 11.6l-3.95 2.1.8-4.4L1.62 6.22l4.43-.6z" />
        </svg>
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

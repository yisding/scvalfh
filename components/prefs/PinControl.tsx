'use client';

import { usePinnedTeam } from './use-pinned-team';

/**
 * Pin / unpin a team (DESIGN §7.12; SPEC §8.2, §10.2). Pinning also remembers the team's league
 * (`leagueId`), which is one of the three writes of `scvalfh.league` the spec allows.
 *
 * `label` is the team's pin label, built by the caller with `pinLabel()` from lib/pin-label.ts
 * (`Pin Leigh, Mt. Hamilton · BVAL`, `Pin Tamalpais, MCAL`), so this module never reaches the
 * registry or the league config (the client boundary, SPEC §0.4). It names the team in the
 * button's accessible name: the visible words come first ("Pin this team" / "Unpin this team",
 * WCAG 2.5.3, the same verb as Home's "Unpin"), followed by the team in an sr-only suffix.
 *
 * The button is an ACTION, not a toggle: there is no `aria-pressed`. The label already says what a
 * tap will do, and "Pinned … pressed" announced the state twice. The filled star and the wash are
 * the visual twin of the words, keyed on `data-pinned`.
 *
 * The button reserves its footprint server-side and stays `invisible` until the stored pin has been
 * read, so it never shows the wrong state and the swap costs no layout shift. Without JS the whole
 * control is `sx-js-only`: no dead button, and no empty band where it would sit. When `localStorage` is unavailable the control is replaced by one sentence saying
 * so — the page stays fully correct without storage — and a pin pointing at a team that has left
 * the snapshot is cleared and reported in words rather than silently ignored.
 *
 * When ANOTHER team is pinned, a one-line note says that pinning this one replaces it (there is one
 * pin). It never names that team: this module has no registry, and a longer label would break the
 * button's width reservation. The note ships `hidden`; before hydration globals.css reveals it from
 * `html[data-pin]` on a hero the head script did not mark as pinned (`.sx-pin-other[data-pending]`),
 * so it is already in place at first paint and costs no layout shift; after hydration React decides.
 * From 768px the note is positioned under the button's right edge, out of the row's flow (the
 * hero's bottom padding holds it): in flow it widened the right-aligned group, so pinning (which
 * hides it) moved the button's left edge out from under the pointer and reflowed the title.
 */
export interface PinControlProps {
  slug: string;
  /** The team's league: pinning remembers it (SPEC §8.2). */
  leagueId: string;
  /** `pinLabel(…)` from lib/pin-label.ts: 'Pin Leigh, Mt. Hamilton · BVAL'. */
  label: string;
  /** Every slug in the snapshot, so a stale pin can be detected and cleared. */
  knownSlugs?: readonly string[];
  className?: string;
}

/** 'Pin Leigh, Mt. Hamilton · BVAL' → 'Leigh, Mt. Hamilton · BVAL'. */
function teamPart(label: string): string {
  return label.replace(/^Pin\s+/, '');
}

export function PinControl({
  slug,
  leagueId,
  label,
  knownSlugs,
  className,
}: PinControlProps) {
  const { pinned, ready, available, stalePin, toggle } = usePinnedTeam(knownSlugs);
  const isPinned = ready && pinned === slug;
  const otherPinned = ready && pinned !== null && pinned !== slug;
  const team = teamPart(label);

  if (ready && !available) {
    return (
      <span
        className={['inline-flex h-11 items-center text-meta text-ink-3', className].filter(Boolean).join(' ')}
      >
        This browser is not storing a pinned team.
      </span>
    );
  }

  return (
    <span
      className={['sx-js-only relative inline-flex flex-wrap items-center gap-2', className]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        onClick={() => toggle(slug, leagueId)}
        data-pinned={isPinned}
        // Pinned reads as pinned: accent-ink on the accent wash (6.5 / 7.55), the
        // `.sx-pill-accent` pairing, held on hover too (a utility outranks the base hover rule).
        // Unpinned stays the neutral grey pill. The words change as well ("Unpin this team").
        //
        // The press itself darkens the unpinned pill to surface-3: `.sx-tap:active` paints
        // surface-2, which IS the pill's resting colour, so a tap gave no feedback at all. It is
        // scoped to `data-pinned="false"` so it can never paint over the pinned wash, whatever
        // order Tailwind emits the two variants in.
        //
        // `md:min-w-40` (160px, wider than either label: "Unpin this team" measures 159.5px): from
        // 768px the button is `w-auto` at the card's right edge, so a label swap that changed its
        // width moved its LEFT edge under the pointer. On a phone it is full width already.
        //
        // `invisible` until the stored pin has been read: the footprint stays and the state is
        // never guessed. (Without JS the wrapper's `sx-js-only` drops the whole control.)
        className={[
          'sx-pill sx-tap min-h-11 justify-center font-semibold data-[pinned=false]:active:bg-surface-3 data-[pinned=true]:bg-accent-wash data-[pinned=true]:text-accent-ink w-full md:w-auto md:min-w-40',
          ready ? null : 'invisible',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* 16px star: filled when pinned, an outline when not. The label carries the state; the
            shape is the visual twin of it, never the only channel. */}
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
        <span>{isPinned ? 'Unpin this team' : 'Pin this team'}</span>
        <span className="sr-only">
          {' '}
          &mdash; {team}, {isPinned ? 'pinned' : 'saved'} in this browser only
        </span>
      </button>
      {stalePin ? (
        <span className="text-meta text-ink-3">
          Your pinned team is no longer in the data, so the pin was cleared.
        </span>
      ) : (
        <span
          className="sx-pin-other text-meta text-ink-3 md:absolute md:top-full md:right-0 md:mt-1 md:whitespace-nowrap"
          hidden={!otherPinned}
          data-pending={ready ? undefined : ''}
        >
          This replaces your pinned team.
        </span>
      )}
    </span>
  );
}

export default PinControl;

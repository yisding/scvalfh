'use client';

import { usePinnedTeam } from './use-pinned-team';

/**
 * "Your team" on a team page's header (DESIGN §33; SPEC §8.2, §10.2). Choosing a team also remembers
 * its league (`leagueId`), one of the three writes of `scvalfh.league` the spec allows.
 *
 * The control says the STATE and offers the ACTION as two different things, so it can never read as
 * a pressed or a disabled button:
 *  - not chosen: one bordered button, "Make this my team";
 *  - chosen: the accent star, the words "Your team", then a text button "Remove" (its accessible
 *    name is "Remove as your team"). No `aria-pressed`, no filled state.
 *
 * `label` is the team's pin label, built by the caller with `pinLabel()` from components/words/pin-label.ts
 * (`Pin Leigh, Mt. Hamilton · BVAL`), so this module never reaches the registry or the league config
 * (the client boundary, SPEC §0.4). It names the team in the button's accessible name after the
 * visible words (WCAG 2.5.3).
 *
 * The control stays `invisible` until the stored choice has been read, so it never shows the wrong
 * state. Without JS the whole control is `sx-js-only`. When `localStorage` is unavailable the
 * control is replaced by one sentence saying so, and a stored team that has left the snapshot is
 * cleared and reported in words.
 *
 * When ANOTHER team is chosen, a one-line note says that this one would replace it. It ships
 * `hidden`; before hydration globals.css reveals it from `html[data-pin]` on a header the head
 * script did not mark (`.sx-pin-other[data-pending]`), so it is in place at first paint.
 */
export interface PinControlProps {
  slug: string;
  /** The team's league: pinning remembers it (SPEC §8.2). */
  leagueId: string;
  /** `pinLabel(…)` from components/words/pin-label.ts: 'Pin Leigh, Mt. Hamilton · BVAL'. */
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
        className={['inline-flex h-11 items-center text-meta text-ink-2', className].filter(Boolean).join(' ')}
      >
        This browser is not storing your team.
      </span>
    );
  }

  return (
    <span className={['sx-js-only inline-flex flex-wrap items-center gap-x-3', className].filter(Boolean).join(' ')}>
      {isPinned ? (
        <span className="sx-pinstate" data-pinned="true">
          <span className="sx-pin-note" aria-hidden="true" />
          Your team
          <button type="button" onClick={() => toggle(slug, leagueId)} className="sx-link">
            Remove
            <span className="sr-only"> as your team &mdash; {team}</span>
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => toggle(slug, leagueId)}
          data-pinned="false"
          // `invisible` until the stored choice has been read: the footprint stays and the state
          // is never guessed. (Without JS the wrapper's `sx-js-only` drops the whole control.)
          className={ready ? 'sx-btn' : 'sx-btn invisible'}
        >
          Make this my team
          <span className="sr-only"> &mdash; {team}, saved in this browser only</span>
        </button>
      )}
      {stalePin ? (
        <span className="text-meta text-ink-2">Your team is no longer in the data, so it was removed.</span>
      ) : (
        <span className="sx-pin-other text-meta text-ink-2" hidden={!otherPinned} data-pending={ready ? undefined : ''}>
          This replaces your team.
        </span>
      )}
    </span>
  );
}

export default PinControl;

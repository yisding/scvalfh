'use client';

import { useState } from 'react';

import { FEST_FOLLOW_MAX } from './follow-script';
import { useFestivalFollows } from './use-festival-follows';

/**
 * Follow one festival team (DESIGN §35), in PinControl's conventions (DESIGN §7.12): the control says the STATE
 * and offers the ACTION as two different things, so it never reads as a pressed or a disabled button, and it
 * has no `aria-pressed`:
 *  - not followed: one bordered button, "Follow" (its name goes on: "— <team>, saved in this browser only");
 *  - followed: the star, the word "Following", then a text button "Unfollow".
 * Every target is at least 44px tall. Invisible until the stored list has been read, so it never shows the
 * wrong state; without JS the whole control is `sx-js-only`. With storage unavailable it is one sentence
 * saying so. Plain props only (tests/ui/client-boundary.test.ts).
 */
export interface FollowButtonProps {
  slug: string;
  /** 'San Francisco Hawks U16 (U16)': the team, as the button's accessible name ends. */
  name: string;
  className?: string;
}

export function FollowButton({ slug, name, className }: FollowButtonProps) {
  const { follows, ready, available, full, set } = useFestivalFollows();
  // A write the browser refused (storage that reads but will not save): said beside the control, which keeps its state.
  const [failed, setFailed] = useState(false);
  const save = (on: boolean) => setFailed(!set([slug], on));
  if (ready && !available) {
    return (
      <span className={['inline-flex min-h-11 items-center text-meta text-ink-2', className].filter(Boolean).join(' ')}>
        This browser is not saving followed teams.
      </span>
    );
  }
  const on = ready && follows.includes(slug);
  return (
    <span className={['sx-js-only inline-flex flex-wrap items-center gap-x-3', className].filter(Boolean).join(' ')}>
      {on ? (
        <span className="sx-pinstate">
          <span className="sx-pin-note" aria-hidden="true" />
          Following
          <button type="button" onClick={() => save(false)} className="sx-link min-h-11">
            Unfollow
            <span className="sr-only"> &mdash; {name}</span>
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => save(true)}
          disabled={ready && full}
          className={ready ? 'sx-btn min-h-11' : 'sx-btn invisible min-h-11'}
        >
          Follow
          <span className="sr-only"> &mdash; {name}, saved in this browser only</span>
        </button>
      )}
      {failed ? (
        <span role="status" className="text-meta text-ink-2">
          This browser did not save that. Try again, or check that it allows this site to store data.
        </span>
      ) : null}
      {ready && full && !on ? (
        <span className="text-meta text-ink-2">You follow {FEST_FOLLOW_MAX} teams, the most this browser keeps.</span>
      ) : null}
    </span>
  );
}

export default FollowButton;

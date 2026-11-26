'use client';

import { useState } from 'react';

import { plural } from '../../lib/format';
import { FEST_FOLLOW_MAX } from './follow-script';
import { useFestivalFollows } from './use-festival-follows';

/**
 * Follow every team of one festival club at once (DESIGN §35), in FollowButton's conventions: the state in words
 * ("Following all 7 teams") and the action as a separate text button. A club whose teams would take the list past
 * FEST_FOLLOW_MAX says so instead of following some of them.
 */
export interface FollowClubButtonProps {
  slugs: readonly string[];
  /** 'Windy City'. */
  name: string;
  className?: string;
}

export function FollowClubButton({ slugs, name, className }: FollowClubButtonProps) {
  const { follows, ready, available, set } = useFestivalFollows();
  // A write the browser refused (storage that reads but will not save): said beside the control, which keeps its state.
  const [failed, setFailed] = useState(false);
  const save = (on: boolean) => setFailed(!set(slugs, on));
  if (ready && !available) {
    return (
      <span className={['inline-flex min-h-11 items-center text-meta text-ink-2', className].filter(Boolean).join(' ')}>
        This browser is not saving followed teams.
      </span>
    );
  }
  const all = ready && slugs.every((s) => follows.includes(s));
  const missing = slugs.filter((s) => !follows.includes(s)).length;
  const tooMany = ready && !all && follows.length + missing > FEST_FOLLOW_MAX;
  const teams = slugs.length === 1 ? 'its team' : `all ${plural(slugs.length, 'team')}`;
  return (
    <span className={['sx-js-only inline-flex flex-wrap items-center gap-x-3', className].filter(Boolean).join(' ')}>
      {all ? (
        <span className="sx-pinstate">
          <span className="sx-pin-note" aria-hidden="true" />
          Following {teams}
          <button type="button" onClick={() => save(false)} className="sx-link min-h-11">
            Unfollow all
            <span className="sr-only"> &mdash; {name}</span>
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => save(true)}
          disabled={tooMany}
          className={ready ? 'sx-btn min-h-11' : 'sx-btn invisible min-h-11'}
        >
          Follow {teams}
          <span className="sr-only"> &mdash; {name}, saved in this browser only</span>
        </button>
      )}
      {failed ? (
        <span role="status" className="text-meta text-ink-2">
          This browser did not save that. Try again, or check that it allows this site to store data.
        </span>
      ) : null}
      {tooMany ? (
        <span className="text-meta text-ink-2">That would pass {FEST_FOLLOW_MAX} teams, the most this browser keeps.</span>
      ) : null}
    </span>
  );
}

export default FollowClubButton;

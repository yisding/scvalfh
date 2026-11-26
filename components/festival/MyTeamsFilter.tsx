'use client';

import { useEffect, useRef, useState } from 'react';

import { plural } from '../../lib/format';
import { useFestivalFollows } from './use-festival-follows';

/**
 * "Only my teams" on /festival/schedule (DESIGN §35 §7), in ScheduleFilters' pattern: the server writes every game
 * (`[data-fest-game="<slug> <slug>"]`) inside its slot (`[data-fest-slot]`) and day (`[data-fest-day]`), and this
 * only toggles `hidden` on them; with JS off every game shows. Two option buttons with `aria-pressed` (the site's
 * option-row face, `.sx-seg`), a polite live count, and nothing in the URL (DESIGN decision 7: pages stay
 * static). Followed teams come from the same list the Follow buttons write.
 */
export function MyTeamsFilter() {
  const { follows, ready, available } = useFestivalFollows();
  const [mine, setMine] = useState(false);
  const countRef = useRef<HTMLParagraphElement>(null);
  const active = mine && ready && follows.length > 0;
  const key = follows.join(' ');

  // Toggling `hidden` on server-rendered rows is DOM work outside React's tree: an effect's job. The count goes
  // straight into its live region, which React renders empty and never writes.
  useEffect(() => {
    const followed = new Set(key ? key.split(' ') : []);
    let count = 0;
    for (const row of document.querySelectorAll<HTMLElement>('[data-fest-game]')) {
      const show = !active || (row.dataset.festGame ?? '').split(' ').some((s) => followed.has(s));
      row.hidden = !show;
      if (show) count += 1;
    }
    for (const group of document.querySelectorAll<HTMLElement>('[data-fest-slot], [data-fest-day]')) {
      group.hidden = active && group.querySelector('[data-fest-game]:not([hidden])') === null;
    }
    if (countRef.current) {
      countRef.current.textContent = active ? `${plural(count, 'game')} of the ${plural(followed.size, 'team')} you follow` : '';
    }
  }, [active, key]);

  if (ready && !available) return null;
  const none = ready && follows.length === 0;
  return (
    <div className="sx-js-only mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="sx-seg" role="group" aria-label="Games to show">
        <button type="button" className="sx-opt min-h-11" aria-pressed={!active} onClick={() => setMine(false)}>
          All games
        </button>
        <button type="button" className="sx-opt min-h-11" aria-pressed={active} disabled={none} onClick={() => setMine(true)}>
          Only my teams
        </button>
      </div>
      {none ? <p className="m-0 text-cell text-ink-2">Follow a team to use “Only my teams”.</p> : null}
      <p ref={countRef} aria-live="polite" className="m-0 text-cell text-ink-2" />
    </div>
  );
}

export default MyTeamsFilter;

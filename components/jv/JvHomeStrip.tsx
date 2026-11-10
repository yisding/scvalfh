import Link from 'next/link';

import { getJvGames } from '../../lib/jv/jv';
import { plural } from '../../lib/format';
import Arrow from '../ui/Arrow';

/**
 * The home page's way into the JV pages: one row under the latest varsity results, the only route to `/jv`
 * on a phone, whose bottom bar has five tabs and no room for a sixth (the desktop nav has "JV"). It says
 * what is there in numbers a JV parent can check: the JV games listed this season and how many have a
 * final score. Renders nothing when no JV game is listed at all.
 */
export function JvHomeStrip({ className }: { className?: string }) {
  const games = getJvGames();
  if (games.length === 0) return null;
  const finals = games.filter((g) => g.status === 'final').length;
  return (
    <aside aria-label="Junior varsity" className={className}>
      <Link
        href="/jv"
        prefetch={false}
        className="sx-card sx-tap flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-ink no-underline hover:underline md:max-w-3xl"
      >
        <span className="text-body font-semibold">JV standings, scores and schedules</span>
        <span className="text-meta text-ink-2">
          {plural(games.length, 'JV game')} listed &middot; {finals} final
        </span>
        <span className="ml-auto text-meta font-medium text-accent">
          Open the JV page <Arrow />
        </span>
      </Link>
    </aside>
  );
}

export default JvHomeStrip;

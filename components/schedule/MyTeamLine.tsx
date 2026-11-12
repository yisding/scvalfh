'use client';

import Link from 'next/link';

import { usePinnedTeam } from '../prefs/use-pinned-team';
import TeamMonogram from '../ui/TeamMonogram';

/**
 * The two places the Scores page speaks to the reader's own team beyond the star in a row
 * (DESIGN §33). The pin lives in `localStorage`, so the server cannot know it: both ship hidden and
 * empty and are filled after hydration, like the More sheet's team row (CLS is one 44px line at the
 * top of the list for a reader who pinned a team that does not play on the selected day).
 *
 * A client module, so it takes plain data and reaches nothing server-only
 * (tests/ui/client-boundary.test.ts).
 */

/** slug → [short name, the words at the line's right end]. Only teams with NO game on the selected day. */
export type MyTeamLines = Readonly<Record<string, readonly [name: string, words: string]>>;

/**
 * The team line: one 44px link to the reader's team when it has no game on the selected day, its
 * logo, name and star at the left and its next game (or last result) at the right. A team that plays
 * that day is not in `lines`: its game is first in the list and carries the star.
 */
export function MyTeamLine({ lines }: { lines: MyTeamLines }) {
  const { pinned, ready } = usePinnedTeam();
  const line = ready && pinned ? lines[pinned] : undefined;
  if (!line || !pinned) return <div hidden data-my-team-line />;
  const [name, words] = line;
  return (
    <Link href={`/teams/${pinned}`} prefetch={false} className="sx-myline" data-my-team-line>
      <TeamMonogram team={{ slug: pinned, name }} size={24} decorative />
      <b>{name}</b>
      <span className="sx-pin-note">Your team</span>
      <span>{words}</span>
    </Link>
  );
}

/**
 * "Saint Francis’s league" beside the rail's "SCVAL standings": shown only when the reader's pinned
 * team is in the league whose block this is, so the block never reads as a broken filter beside an
 * "All" tab. `names` is that league's teams alone.
 */
export function LeagueFact({ names }: { names: Readonly<Record<string, string>> }) {
  const { pinned, ready } = usePinnedTeam();
  const name = ready && pinned ? names[pinned] : undefined;
  if (!name) return null;
  return <span>{`${name}’s league`}</span>;
}

import Link from 'next/link';

import { plural } from '../../lib/format';
import ResultChip from '../ui/ResultChip';
import FollowButton from './FollowButton';
import type { SideModel, TeamCardModel } from './festival-model';

/**
 * One team at a glance (DESIGN §35 §6), for the hub's "Your teams" and "California teams": its name (the team
 * page), division and pool, record and pool place, its last result and its next game with time and field, and
 * its Follow control. A list item on hairlines, not a boxed card (DESIGN §33: no ring cards).
 *
 * `hiddenUntilFollowed` (the "Your teams" copy): the item ships `hidden` and carries `data-fest-card`; the hub's
 * generated stylesheet shows it for a followed team (follow-css.ts), before first paint.
 */
export function TeamCard({
  card,
  hiddenUntilFollowed = false,
  as: Heading = 'h3',
}: {
  card: TeamCardModel;
  hiddenUntilFollowed?: boolean;
  /** The name's heading level: h3 under a section, h4 under a group heading. */
  as?: 'h3' | 'h4';
}) {
  const { team } = card;
  return (
    <li
      className="min-w-0 border-t border-hairline py-3"
      data-fest-card={hiddenUntilFollowed ? team.slug : undefined}
      hidden={hiddenUntilFollowed || undefined}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <Heading className="m-0 min-w-0 text-lead text-ink">
          <span data-fest-team={team.slug}>
            <Link href={team.href} prefetch={false} className="sx-link">
              {team.name}
            </Link>
            {/* The star still shows; its word is hidden from screen readers here because the FollowButton beside
                it already says "Following", which would otherwise be heard twice. */}
            <span className="sx-pin-note" aria-hidden="true" hidden>
              Following
            </span>
          </span>
        </Heading>
        <FollowButton slug={team.slug} name={`${team.name} (${team.divisionShort})`} />
      </div>
      <p className="m-0 text-cell text-ink-2">
        <Link href={`/festival/${team.divisionSlug}`} prefetch={false} className="sx-link">
          {team.divisionShort}
        </Link>{' '}
        · {team.poolName}
        {card.record ? ` · ${card.record}, ${plural(card.pts, 'pt')}` : null}
        {card.place ? ` · ${card.place.words}${card.place.final ? ', final' : ''}` : null}
      </p>
      {card.note ? <p className="m-0 text-cell text-ink-2">{card.note}</p> : null}
      <dl className="mt-1 mb-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 text-cell">
        {card.last ? (
          <>
            <dt className="text-ink-2">Last</dt>
            <dd className="m-0 flex min-w-0 items-center gap-2 text-ink">
              {card.last.chip ? <ResultChip kind={card.last.chip} size={16} /> : null}
              <span className="sx-num">{card.last.score}</span>
              <span className="min-w-0">
                v <Opponent side={card.last.opponent} />
                {card.last.note ? <span className="text-ink-2"> · {card.last.note}</span> : null}
              </span>
            </dd>
          </>
        ) : null}
        {card.next ? (
          <>
            <dt className="text-ink-2">{card.next.status === 'live' ? 'Now' : 'Next'}</dt>
            <dd className="m-0 min-w-0 text-ink">
              {card.next.when}, {card.next.field} · v <Opponent side={card.next.opponent} />
            </dd>
          </>
        ) : (
          <>
            <dt className="text-ink-2">Next</dt>
            <dd className="m-0 min-w-0 text-ink-2">
              {card.placementAhead ? 'A placement game, set by the final pool table' : 'No more games on the schedule'}
            </dd>
          </>
        )}
      </dl>
    </li>
  );
}

function Opponent({ side }: { side: SideModel }) {
  if (side.state === 'team' || side.state === 'pool-complete') {
    return (
      <Link href={side.team!.href} prefetch={false} className="sx-link">
        {side.team!.name}
      </Link>
    );
  }
  if (side.state !== 'provisional') return <>{side.slot}</>;
  return (
    <>
      {side.slot}
      {' (now '}
      <Link href={side.team!.href} prefetch={false} className="sx-link">
        {side.team!.name}
      </Link>
      {')'}
    </>
  );
}

export default TeamCard;

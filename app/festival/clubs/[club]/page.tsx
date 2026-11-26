import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import FestivalChrome from '../../../../components/festival/FestivalChrome';
import FestivalPoolTable from '../../../../components/festival/FestivalPoolTable';
import FollowButton from '../../../../components/festival/FollowButton';
import FollowClubButton from '../../../../components/festival/FollowClubButton';
import PlacementPath from '../../../../components/festival/PlacementPath';
import TeamGameList from '../../../../components/festival/TeamGameList';
import { buildClubView } from '../../../../components/festival/club-view';
import { OG_BASE, ROOT_OG_IMAGE } from '../../../../components/layout/site';
import SectionHeader from '../../../../components/ui/SectionHeader';
import { plural } from '../../../../components/words/plural';
import { festivalClubSlugs, getFestival } from '../../../../lib/festival/festival';
import { HAS_FESTIVAL } from '../../../../lib/sports/current';

/**
 * /festival/clubs/[club] — one club at the National Hockey Festival (DESIGN §35): what a parent juggling several
 * teams on twelve fields needs. A Follow-all control, a summary of every team (pool, record, place, next game or
 * last result), every game of every team merged by day and time, then one section per team: its games, its pool
 * table with the club's teams marked, and where its final pool place sends it on Saturday.
 *
 * One static page per club (lib/festival/festival.ts festivalClubSlugs). A club that is also a club page on this
 * site (data/field-hockey/clubs.json) links to it. Heading outline: h1 → h2 Teams → h2 Club schedule (→ h3 per
 * day → slot strips) → h2 per team (→ h3 Games, Pool, Placement). Field hockey's alone; takes the root OG card.
 */

export const dynamicParams = false;

export function generateStaticParams(): { club: string }[] {
  return HAS_FESTIVAL ? festivalClubSlugs().map((club) => ({ club })) : [];
}

export async function generateMetadata({ params }: PageProps<'/festival/clubs/[club]'>): Promise<Metadata> {
  const { club } = await params;
  const view = HAS_FESTIVAL ? buildClubView(club) : null;
  // No notFound() here: the page itself 404s.
  if (!view) return { title: 'Club not found' };
  const title = `${view.name} at the National Hockey Festival`;
  const description = `${view.name} at the ${getFestival().tournament.name}: ${plural(view.teams.length, 'team')} (${view.meta[1]}), every game by day and time, pool tables and placement games, ${view.finals} of ${plural(view.games, 'game')} final. Unofficial.`;
  return {
    title,
    description,
    alternates: { canonical: `/festival/clubs/${club}` },
    openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title, description, url: `/festival/clubs/${club}` },
  };
}

export default async function FestivalClubPage({ params }: PageProps<'/festival/clubs/[club]'>) {
  const { club } = await params;
  const view = HAS_FESTIVAL ? buildClubView(club) : null;
  if (!view) notFound();

  return (
    <div className="pb-section-lg">
      <FestivalChrome
        title={view.name}
        current="clubs"
        exact={false}
        meta={
          <>
            {view.meta.map((m) => (
              <span key={m}>{m}</span>
            ))}
            {view.region ? <span>{view.region}</span> : null}
          </>
        }
      />
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1">
        <FollowClubButton slugs={view.slugs} name={view.name} />
        {view.site ? (
          <Link href={view.site.href} prefetch={false} className="sx-action">
            Club page on this site
          </Link>
        ) : null}
      </div>
      {view.site && view.siblings.length > 0 ? (
        <p className="sx-note">
          Also from {view.site.name}:{' '}
          {view.siblings.map((s, i) => (
            <span key={s.slug}>
              {i > 0 ? ', ' : null}
              <Link href={s.href} prefetch={false} className="sx-link">
                {s.name}
              </Link>{' '}
              ({s.divisions})
            </span>
          ))}
        </p>
      ) : null}

      <section aria-labelledby="teams" className="sx-section">
        <SectionHeader id="teams" kicker="Teams" meta={plural(view.teams.length, 'team')} />
        <div className="sx-tablewrap">
          <table className="sx-table">
            <caption className="sr-only">The teams of {view.name}: pool, record, place and next game</caption>
            <thead>
              <tr>
                <th scope="col" className="sx-col-team">
                  Team
                </th>
                <th scope="col" className="sx-col-wide">
                  Pool
                </th>
                <th scope="col">W-L-T</th>
                <th scope="col">Place</th>
                <th scope="col" className="sx-col-full text-left">
                  Next or last
                </th>
              </tr>
            </thead>
            <tbody>
              {view.teams.map(({ card, anchor }) => (
                <tr key={card.team.id}>
                  <th scope="row" className="sx-col-team">
                    <span className="block min-w-0 overflow-hidden text-ellipsis">
                      <span data-fest-team={card.team.slug}>
                        <a href={`#${anchor}`} className="sx-link">
                          {card.team.name}
                        </a>
                        <span className="sx-pin-note" hidden>
                          Following
                        </span>
                      </span>
                    </span>
                    <span className="block text-micro font-normal text-ink-2">{card.team.divisionShort}</span>
                  </th>
                  <td className="sx-col-wide">{card.team.poolName}</td>
                  <td className="sx-num">{card.record ?? '—'}</td>
                  <td>{card.place ? card.place.words : '—'}</td>
                  <td className="sx-col-full text-left text-cell">
                    {card.next
                      ? `${card.next.status === 'live' ? 'Now' : 'Next'}: ${card.next.when}, ${card.next.field}`
                      : card.last
                        ? `Last: ${card.last.chip ?? ''} ${card.last.score ?? ''}`.trim()
                        : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="club-schedule" className="sx-section">
        <SectionHeader id="club-schedule" kicker="Club schedule" meta={`${plural(view.games, 'game')} · times ET`} />
        {view.schedule.map((day) => (
          <div key={day.key} className="mt-4">
            <h3 className="m-0 mb-2 text-lead text-ink">{day.label}</h3>
            {day.slots.map((slot) => (
              <div key={slot.id} className="mt-2">
                <SectionHeader strip as="h4" kicker={slot.clocks} meta={plural(slot.rows.length, 'game')} />
                <TeamGameList games={slot.rows} showTeam slotted />
              </div>
            ))}
          </div>
        ))}
      </section>

      {view.teams.map(({ card, anchor, games, pool, path }) => (
        <section key={card.team.id} aria-labelledby={anchor} className="sx-section">
          <SectionHeader id={anchor} kicker={`${card.team.name} · ${card.team.divisionShort}`} action={{ href: card.team.href, label: 'Team page' }} />
          <div className="flex flex-wrap items-center gap-x-4">
            <p className="m-0 text-cell text-ink-2">
              {[card.team.poolName, card.record ? `${card.record}, ${plural(card.pts, 'pt')}` : null, card.place?.words].filter(Boolean).join(' · ')}
            </p>
            <FollowButton slug={card.team.slug} name={`${card.team.name} (${card.team.divisionShort})`} />
          </div>
          {card.note ? <p className="sx-note">{card.note}</p> : null}
          <h3 className="mt-4 mb-1 text-lead text-ink">Games</h3>
          <TeamGameList games={games} />
          <h3 className="mt-4 mb-1 text-lead text-ink">{pool.name}</h3>
          <p className="m-0 mb-1 text-cell text-ink-2">{pool.status}</p>
          <FestivalPoolTable pool={pool} showClub={false} />
          <h3 className="mt-4 mb-1 text-lead text-ink">Placement</h3>
          <PlacementPath path={path} teamName={card.team.name} />
        </section>
      ))}
    </div>
  );
}

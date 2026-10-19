import SectionPlayoffsLeagueCard from '@/components/playoffs/SectionPlayoffsLeagueCard';
import ExternalLink from '@/components/ui/ExternalLink';
import SectionHeader from '@/components/ui/SectionHeader';
import { dateSpan, shortDate } from '@/lib/format/dates';
import type { SectionPlayoffsData } from '@/views/playoffs/playoffs-view';

/**
 * The San Diego Section's playoffs (DESIGN-socal §2.4): the Section's rule from config, where its
 * dates come from, its power rankings and when its brackets come, then one card per conference. No
 * bracket, no seed and no projection: the Section places teams from its power rankings, and the one
 * place a league table decides (a designated champion's play-in) is the league's to designate.
 */
export default function SectionPlayoffsBlock({ ps, source, seeding, leagues }: SectionPlayoffsData) {
  return (
    <section aria-labelledby="sds-playoffs" className="mt-section md:mt-section-lg">
      <SectionHeader
        id="sds-playoffs"
        kicker={ps.name}
        meta={`${dateSpan(ps.dates.first, ps.dates.last)} · ${ps.divisions.map((d) => `${d.name} ${d.teams}`).join(', ')}`}
      />
      <div className="max-w-prose text-body text-ink-2">
        <p className="m-0">{ps.qualificationLine}</p>
        <p className="mb-0">
          {seeding
            ? `The Section publishes its brackets after its ${shortDate(seeding)} seeding meeting; until then this site draws no bracket and projects no places.`
            : 'The Section publishes its brackets after its seeding meeting; until then this site draws no bracket and projects no places.'}{' '}
          {ps.citations.roundDates}
        </p>
        <p className="mb-0 flex flex-wrap gap-x-4 gap-y-1 text-meta">
          <ExternalLink href={source.href} className="sx-action gap-1">
            {source.text}
          </ExternalLink>
          <ExternalLink href={ps.powerRankingsUrl} className="sx-action gap-1">
            CIF-SDS power rankings
          </ExternalLink>
        </p>
      </div>
      {leagues.map((league) => (
        <SectionPlayoffsLeagueCard key={league.summary.id} card={league} />
      ))}
    </section>
  );
}

import LeaguePairings from '@/components/playoffs/LeaguePairings';
import PlayoffProjection, { ProjectionKey } from '@/components/playoffs/PlayoffProjection';
import LeagueHealthNote from '@/components/ui/LeagueHealthNote';
import SectionHeader from '@/components/ui/SectionHeader';
import { shortDate } from '@/lib/format/dates';
import type { LeagueBlock, PlayoffsPageView } from '@/views/playoffs/playoffs-view';

/** One CCS league's section, config order: its divisions' projections, its pairings, its qualification line. */
export default function CcsLeagueSection({
  block,
  field,
  keyDates,
}: Pick<PlayoffsPageView, 'field'> & {
  block: LeagueBlock;
  keyDates: PlayoffsPageView['playoffs']['keyDates'];
}) {
  const { summary, config, divisions, meterNote, pairings, pairingDate } = block;
  const citation = config.postseason.kind === 'ccs-ladder' ? config.postseason.citation : '';
  const qualification = `How ${summary.shortName} qualifies — ${citation}.`;
  return (
    <section id={summary.id} className="mt-section md:mt-section-lg" aria-labelledby={`${summary.id}-heading`}>
      <SectionHeader kicker={`${summary.shortName} — ${summary.name}`} id={`${summary.id}-heading`} />
      <p className="m-0 max-w-prose text-meta text-ink-2">
        {summary.shortName} holds {field.byLeague.find((l) => l.leagueId === summary.id)?.auto ?? 0} of the{' '}
        {field.total} CCS berths. Ordered by league points; every status below is a written word, and
        nothing here is official until {shortDate(keyDates.seedingMeeting)}.
      </p>
      <LeagueHealthNote leagueId={summary.id} className="mt-stack" />
      {/* Side by side from md, not lg: at 768 each half is ~350px, which holds the tile, the
          longest short name and the status column without truncating, so the tables no
          longer stack into a long phone-style scroll on a tablet. `items-start` keeps the
          shorter division from stretching to the longer one's height. */}
      <div className="mt-stack space-y-section md:grid md:grid-cols-2 md:items-start md:gap-6 md:space-y-0 lg:gap-8">
        {divisions.map((d) => (
          <PlayoffProjection
            key={d.id}
            id={d.anchor}
            heading={d.heading}
            meterNote={meterNote}
            projection={d.projection}
            asOfLabel={d.asOf}
            standingsHref={`/standings/${summary.id}#${d.id}`}
          />
        ))}
      </div>
      {pairings.length > 0 ? (
        <div className="mt-section">
          <SectionHeader
            as="h3"
            kicker={pairings.some((p) => !p.isPlayIn) ? 'Crossover and play-in' : 'Play-in'}
            meta={pairingDate ? shortDate(pairingDate) : undefined}
          />
          <LeaguePairings pairings={pairings} />
          {/* An unsettled card already says it moves with the table; say it once. */}
          {pairings.some((p) => p.unsettled) ? null : (
            <p className="mt-4 mb-0 max-w-prose text-meta text-ink-2">
              Pairings follow the current league tables, so they move with every result.
            </p>
          )}
        </div>
      ) : null}
      <ProjectionKey
        className="mt-stack"
        qualification={qualification}
        showLine={divisions.some((d) => d.projection.lineAfter > 0)}
        rulesHref={`/about#rules-${summary.id}`}
      />
    </section>
  );
}

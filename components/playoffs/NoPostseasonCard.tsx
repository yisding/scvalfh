import ExternalLink from '@/components/ui/ExternalLink';
import SectionHeader from '@/components/ui/SectionHeader';
import type { NoPostseasonCardData } from '@/views/playoffs/playoffs-view';

/**
 * A league with no postseason (the Sunset, `id=<league>`): the config's note and its source, nothing to
 * project. The LA independents' card (`#independents`) is headed by the group's name and
 * opens with the group's own note (schools in no league, whose table is their games against each other),
 * then the Section's.
 */
export default function NoPostseasonCard({ card }: { card: NoPostseasonCardData }) {
  const { id, kicker, groupNote, note, citation, source } = card;
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="mt-section md:mt-section-lg">
      <SectionHeader id={`${id}-heading`} kicker={kicker} />
      <div className="sx-inset max-w-3xl text-body text-ink-2">
        {groupNote ? <p className="m-0 mb-2">{groupNote}</p> : null}
        <p className="m-0">{note}</p>
        <p className="mb-0 text-meta">
          {citation}{' '}
          <ExternalLink href={source.href}>{source.text}</ExternalLink>
        </p>
      </div>
    </section>
  );
}

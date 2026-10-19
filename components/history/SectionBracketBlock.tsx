import HistoryBracket from '@/components/history/HistoryBracket';
import ExternalLink from '@/components/ui/ExternalLink';
import SectionHeader from '@/components/ui/SectionHeader';
import TeamMonogram from '@/components/ui/TeamMonogram';
import { getSection } from '@/lib/config/leagues';
import { dateWithYear } from '@/lib/format/dates';
import type { SectionBracketView } from '@/views/history/bracket';

/** The source line of a section's bracket block, in that section's words. */
function BracketSources({ id, bracket }: Pick<SectionBracketView, 'id' | 'bracket'>) {
  const links = bracket.sources.map((doc, i) => (
    <span key={doc.url}>
      {i > 0 ? ' · ' : ''}
      <ExternalLink href={doc.url}>{doc.label}</ExternalLink>
    </span>
  ));
  const read = `Read on ${dateWithYear(bracket.retrievedOn)}.`;
  return id === 'ccs' ? (
    <p className="m-0">
      Source: the CCS&rsquo;s own pages &mdash; {links}. {read} The bracket pages draw their scores from
      MaxPreps; both finals match the CCS&rsquo;s field hockey history, which names each final&rsquo;s site.
      The Willow Glen&ndash;Stevenson shootout score is the game&rsquo;s box score, which the bracket links.
    </p>
  ) : (
    <p className="m-0">
      Source: the San Diego Section&rsquo;s own documents &mdash; {links}. {read} The bracket sheet names
      each champion but leaves the finals&rsquo; scores blank; the Open and Division I final scores are the
      Record Book&rsquo;s, which does not list the 2025 Division II final yet, so that score is not shown.
    </p>
  );
}

/** A section's 2025 bracket block (views/history/bracket.ts `sectionBracketView`): champions, brackets, sources. */
export default function SectionBracketBlock({
  view,
  season,
}: {
  view: SectionBracketView;
  /** '2025-26'. */
  season: string;
}) {
  const { id, name, bracket, divisions } = view;
  const section = getSection(id);
  return (
    <section id={id} data-region-scope={section.region} aria-label={`${name} playoffs`} className="min-w-0">
      <SectionHeader
        size="lg"
        kicker={`${section.shortName} playoffs · ${name}`}
        meta={<span className="whitespace-nowrap">{season}</span>}
      />
      <div className={`mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4 ${divisions.length > 2 ? 'lg:grid-cols-3' : ''}`}>
        {divisions.map((d) => {
          const { team, school, finalLine } = d.champion;
          return (
            <div key={d.id} className="sx-card grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 p-4 sm:p-5">
              {team ? <TeamMonogram team={team} size={40} /> : null}
              <div className="col-start-2 min-w-0">
                <p className="m-0 text-micro font-medium text-ink-3">{d.label} champion</p>
                <p className="m-0 mt-0.5 text-lead text-ink sm:text-title">{school}</p>
                <p className="m-0 mt-0.5 text-meta text-ink-2">{finalLine}</p>
              </div>
            </div>
          );
        })}
      </div>

      {divisions.map((d) => (
        <section key={d.id} id={`${id}-${d.id}`} aria-label={`${section.shortName} ${d.label}`} className="mt-section min-w-0 md:mt-section-lg">
          <SectionHeader
            as="h3"
            size="section"
            kicker={`${d.label} · bracket`}
            meta={<span className="whitespace-nowrap">{season}</span>}
            className="mb-4"
          />
          <HistoryBracket division={d.bracket} label={`${name} ${d.label} bracket, ${season}`} />
        </section>
      ))}

      <div className="mt-section max-w-prose space-y-3 text-meta text-ink-3 md:mt-section-lg">
        <BracketSources id={id} bracket={bracket} />
      </div>
    </section>
  );
}

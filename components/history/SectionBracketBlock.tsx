import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import { getTeamBySlug } from '../../lib/data';
import { dateWithYear } from '../../lib/format';
import { bracketSectionName, type BracketSectionId, type SectionBracket } from '../../lib/history/history';
import { getSection } from '../../lib/leagues';

import ChampionCard from './ChampionCard';
import HistoryBracket from './HistoryBracket';
import { divisionChampion, finalLine, sideName } from './bracket-view';
import { SEASON } from './history-page-view';

/** The source line of a section's bracket block, in that section's words. */
function BracketSources({ id, bracket }: { id: BracketSectionId; bracket: SectionBracket }) {
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

export default function SectionBracketBlock({ id, bracket }: { id: BracketSectionId; bracket: SectionBracket }) {
  const section = getSection(id);
  const name = bracketSectionName(id);
  return (
    <section id={id} data-region-scope={section.region} aria-label={`${name} playoffs`} className="min-w-0">
      <SectionHeader
        size="lg"
        kicker={`${section.shortName} playoffs · ${name}`}
        meta={<span className="whitespace-nowrap">{SEASON}</span>}
      />
      <div className={`mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4 ${bracket.divisions.length > 2 ? 'lg:grid-cols-3' : ''}`}>
        {bracket.divisions.map((d) => {
          const { champion, final } = divisionChampion(d);
          const team = getTeamBySlug(champion.slug);
          return (
            <ChampionCard key={d.id} team={team}>
              <p className="m-0 text-micro font-medium text-ink-3">{d.label} champion</p>
              <p className="m-0 mt-0.5 text-lead text-ink sm:text-title">{sideName(champion)}</p>
              <p className="m-0 mt-0.5 text-meta text-ink-2">{finalLine(final)}</p>
            </ChampionCard>
          );
        })}
      </div>

      {bracket.divisions.map((d) => (
        <section key={d.id} id={`${id}-${d.id}`} aria-label={`${section.shortName} ${d.label}`} className="mt-section min-w-0 md:mt-section-lg">
          <SectionHeader
            as="h3"
            size="section"
            kicker={`${d.label} · bracket`}
            meta={<span className="whitespace-nowrap">{SEASON}</span>}
            className="mb-4"
          />
          <HistoryBracket division={d} label={`${name} ${d.label} bracket, ${SEASON}`} />
        </section>
      ))}

      <div className="mt-section max-w-prose space-y-3 text-meta text-ink-3 md:mt-section-lg">
        <BracketSources id={id} bracket={bracket} />
      </div>
    </section>
  );
}

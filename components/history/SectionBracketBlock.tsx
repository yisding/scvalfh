import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import { getTeamBySlug } from '../../lib/data';
import { dateWithYear } from '../../lib/format';
import { bracketSectionName, type BracketSectionId, type SectionBracket } from '../../lib/history/history';
import { getSection } from '../../lib/leagues';

import ChampionRow from './ChampionRow';
import HistoryBracket from './HistoryBracket';
import { divisionChampion, finalLine, sideName } from './bracket-view';

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
    <p className="sx-note">
      Source: the CCS&rsquo;s own pages &mdash; {links}. {read} The bracket pages draw their scores from
      MaxPreps; both finals match the CCS&rsquo;s field hockey history, which names each final&rsquo;s site.
      The Willow Glen&ndash;Stevenson shootout score is the game&rsquo;s box score, which the bracket links.
    </p>
  ) : (
    <p className="sx-note">
      Source: the San Diego Section&rsquo;s own documents &mdash; {links}. {read} The bracket sheet names
      each champion but leaves the finals&rsquo; scores blank; the Open and Division I final scores are the
      Record Book&rsquo;s, which does not list the 2025 Division II final yet, so that score is not shown.
    </p>
  );
}

export default function SectionBracketBlock({
  id,
  bracket,
  season,
}: {
  id: BracketSectionId;
  bracket: SectionBracket;
  /** The archive's season ('2025-26'). */
  season: string;
}) {
  const section = getSection(id);
  const name = bracketSectionName(id);
  return (
    <section id={id} data-region-scope={section.region} aria-label={`${name} playoffs`} className="sx-section sx-target min-w-0">
      <SectionHeader kicker={`${section.shortName} playoffs`} meta={name} />
      <ul className="sx-list max-w-188">
        {bracket.divisions.map((d) => {
          const { champion, final } = divisionChampion(d);
          return (
            <ChampionRow
              key={d.id}
              team={getTeamBySlug(champion.slug)}
              name={sideName(champion)}
              label={`${d.label} champion`}
              detail={finalLine(final)}
            />
          );
        })}
      </ul>

      {bracket.divisions.map((d) => (
        <section key={d.id} id={`${id}-${d.id}`} aria-label={`${section.shortName} ${d.label}`} className="sx-section sx-target min-w-0">
          <SectionHeader kicker={`${section.shortName} ${d.label}`} />
          <HistoryBracket division={d} label={`${name} ${d.label} bracket, ${season}`} />
        </section>
      ))}

      <div className="mt-4">
        <BracketSources id={id} bracket={bracket} />
      </div>
    </section>
  );
}

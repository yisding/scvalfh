import SectionHeader from '@/components/ui/SectionHeader';
import { listWords } from '@/lib/format/words';
import type { AboutView } from '@/views/about/about-view';

/**
 * /about#not-affiliated: the disclaimer, naming every league and section, and what decides anything
 * competitive for the leagues that publish no standings.
 */
export type AboutNotAffiliatedProps = Pick<
  AboutView,
  'tabled' | 'sections' | 'noDocumentLeagues' | 'noDocumentWho' | 'noDocumentGuidelines' | 'socalNoDocument'
  | 'socalCompetitive'
>;

export function AboutNotAffiliated({
  tabled,
  sections,
  noDocumentLeagues,
  noDocumentWho,
  noDocumentGuidelines,
  socalNoDocument,
  socalCompetitive,
}: AboutNotAffiliatedProps) {
  return (
    <section id="not-affiliated" className="mt-16 mb-2">
      <SectionHeader size="lg" kicker="Not affiliated" />
      <div className="sx-prose">
        <p>
          This is an unofficial fan site. It is not affiliated with, endorsed by, or operated by{' '}
          {listWords(tabled.map((l) => `the ${l.name} (${l.shortName})`))}, the CIF{' '}
          {listWords(sections.map((s) => `${s.name} (${s.shortName})`))}, MaxPreps or Sports
          Illustrated. All team names, colors and marks belong to their respective schools. Records
          here are computed from published game results and, while we cross-check them and publish
          every disagreement we find, they may differ from an official ruling &mdash; each
          league&rsquo;s own standings
          {noDocumentLeagues.length > 0 &&
            ` (or, for ${noDocumentWho}, which ${noDocumentLeagues.length === 1 ? 'publishes' : 'publish'} none, the scores ${noDocumentLeagues.length === 1 ? 'its' : 'their'} schools report for seeding under ${noDocumentGuidelines})`}{' '}
          are always the
          source of truth for anything that matters competitively, such as playoff seeding.
          {socalNoDocument.length > 0 ? ` ${socalCompetitive}` : null}
        </p>
      </div>
    </section>
  );
}

export default AboutNotAffiliated;

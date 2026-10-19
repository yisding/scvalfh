import ExternalLink from '@/components/ui/ExternalLink';
import SectionHeader from '@/components/ui/SectionHeader';
import type { AboutView } from '@/views/about/about-view';
import { DATA_CORRECTIONS_URL } from '@/views/site/site';

/**
 * /about#contact (anchor `#corrections` too): where to post a correction, and what to compare first.
 */
export type AboutContactProps = Pick<
  AboutView,
  'noDocumentLeagues' | 'noDocumentWho' | 'noDocumentGuidelines' | 'socalNoDocument' | 'socalNoDocumentWho'
  | 'socalRulesDocuments'
>;

export function AboutContact({
  noDocumentLeagues,
  noDocumentWho,
  noDocumentGuidelines,
  socalNoDocument,
  socalNoDocumentWho,
  socalRulesDocuments,
}: AboutContactProps) {
  return (
    <section id="contact" className="mt-16">
      <span id="corrections" className="block" />
      <SectionHeader size="lg" kicker="Corrections &amp; contact" />
      <div className="sx-prose">
        <p>
          Spot a wrong score, a missing game, a misspelled name or a record that does not add up?
          Post it in the{' '}
          <ExternalLink href={DATA_CORRECTIONS_URL}>Data errors thread on our forum</ExternalLink>.
          Say which page it is on, what it shows and what it should be, and, if you can, link where
          you saw the right number. This is an independent hobby project with no staffed inbox, so
          that thread is the place to send a correction.
        </p>
        <p>
          Before posting, it is worth comparing against the primary source &mdash; every team,
          standings table and game on this site links back to its MaxPreps page, and the league
          documents above link straight to each league&rsquo;s own files
          {noDocumentLeagues.length > 0 && `, or, for ${noDocumentWho}, to ${noDocumentGuidelines}`}
          {socalNoDocument.length > 0 &&
            `; for ${socalNoDocumentWho}, which publish no schedule or standings, they link ${socalRulesDocuments}`}
          . Most
          scores here come from MaxPreps, so if MaxPreps has it wrong too, the school can correct it
          there and the next update picks it up. If a number here disagrees with one of those
          sources, check{' '}
          <a href="#cross-check" className="text-accent hover:underline">
            the cross-check log
          </a>{' '}
          first: a real disagreement between sources is published, not hidden.
        </p>
      </div>
    </section>
  );
}

export default AboutContact;

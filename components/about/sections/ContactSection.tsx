import { DATA_CORRECTIONS_URL } from '../../layout/site';
import ExternalLink from '../../ui/ExternalLink';
import SectionHeader from '../../ui/SectionHeader';
import type { AboutNoDocument } from '../about-view';

/**
 * /about#contact (and `#corrections`): where to send a correction, and what to check first.
 */
export function ContactSection({ noDocument }: { noDocument: AboutNoDocument }) {
  const { norcal, socal } = noDocument;
  return (
    <section id="contact" className="sx-section">
      <span id="corrections" className="block" />
      <SectionHeader kicker="Corrections &amp; contact" />
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
          {norcal.leagues.length > 0 && `, or, for ${norcal.who}, to ${norcal.guidelines}`}
          {socal.leagues.length > 0 &&
            `; for ${socal.who}, which publish no schedule or standings, they link ${socal.rulesDocuments}`}
          . Most
          scores here come from MaxPreps, so if MaxPreps has it wrong too, the school can correct it
          there and the next update picks it up. If a number here disagrees with one of those
          sources, check{' '}
          <a href="#cross-check">
            the cross-check log
          </a>{' '}
          first: a real disagreement between sources is published, not hidden.
        </p>
      </div>
    </section>
  );
}

export default ContactSection;

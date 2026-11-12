import { DisclaimerProse } from '../../layout/site-prose';
import SectionHeader from '../../ui/SectionHeader';
import { listWords } from '../../../lib/format';
import type { AboutDisclaimer, AboutNoDocument } from '../about-view';

/**
 * /about#not-affiliated: foundation's short disclaimer (`DisclaimerProse`, the footer's old line), then
 * every league and section by its full name, and what is the source of truth for anything that
 * matters competitively.
 */
export function NotAffiliatedSection({ disclaimer, noDocument }: { disclaimer: AboutDisclaimer; noDocument: AboutNoDocument }) {
  const { tabled, sections } = disclaimer;
  const { norcal, socal } = noDocument;
  return (
    <section id="not-affiliated" className="sx-section">
      <SectionHeader kicker="Not affiliated" />
      <div className="sx-prose">
        <DisclaimerProse />
        <p>
          In full, that is {listWords(tabled.map((l) => `the ${l.name} (${l.shortName})`))}, the CIF{' '}
          {listWords(sections.map((s) => `${s.name} (${s.shortName})`))}, MaxPreps and Sports
          Illustrated; none of them endorses or operates this site. All team names, colors and marks belong
          to their respective schools. We cross-check the records here and publish every disagreement we
          find, but each
          league&rsquo;s own standings
          {norcal.leagues.length > 0 &&
            ` (or, for ${norcal.who}, which ${norcal.leagues.length === 1 ? 'publishes' : 'publish'} none, the scores ${norcal.leagues.length === 1 ? 'its' : 'their'} schools report for seeding under ${norcal.guidelines})`}{' '}
          are always the
          source of truth for anything that matters competitively, such as playoff seeding.
          {socal.leagues.length > 0 ? ` ${socal.competitive}` : null}
        </p>
      </div>
    </section>
  );
}

export default NotAffiliatedSection;

import SectionHeader from '../../ui/SectionHeader';
import { IS_FIELD_HOCKEY, SPORT } from '../../../lib/sports/current';
import { RECORD_SLASH_WORDS } from '../../words/score-words';

/**
 * /about#a11y (and `#privacy`): what the site stores, and its accessibility floor. Static.
 */
export function PrivacySection() {
  return (
    <section id="a11y" className="sx-section">
      <span id="privacy" className="block" />
      <SectionHeader kicker="Privacy &amp; accessibility" />
      <div className="sx-prose">
        <p>
          This site stores exactly four things, all only in your browser: a theme choice, a pinned
          team, the league you chose to see on the home page, and the region you chose (Northern or
          Southern California{IS_FIELD_HOCKEY ? '' : `; this ${SPORT.noun} site covers Northern California only`}). None of it is ever sent anywhere &mdash; there are no accounts, no
          analytics, no tracking cookies and no requests to other sites from any page. School
          colors come from MaxPreps&rsquo; data, never an image copied from another site, and the
          fonts ship with the site.
        </p>
        <p>
          {`Accessibility is a floor, not an aspiration: every ${RECORD_SLASH_WORDS} is a letter and a written word, never color alone; every score and result has a full sentence for screen readers; the site’s own text and background colors meet the WCAG AA contrast standard, and a change to them that would fall below it is caught before it is published. Team badges are the exception: they use school colors from MaxPreps, with the letters in whichever of black or white stands out more, and are not part of that check.`}
        </p>
      </div>
    </section>
  );
}

export default PrivacySection;

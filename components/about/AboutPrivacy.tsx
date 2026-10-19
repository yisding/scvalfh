import SectionHeader from '@/components/ui/SectionHeader';

/**
 * /about#a11y (anchor `#privacy` too): the four things the site stores, all in the browser, and the
 * accessibility floor.
 */
export function AboutPrivacy() {
  return (
    <section id="a11y" className="mt-16">
      <span id="privacy" className="block" />
      <SectionHeader size="lg" kicker="Privacy &amp; accessibility" />
      <div className="sx-prose">
        <p>
          This site stores exactly four things, all only in your browser: a theme choice, a pinned
          team, the league you chose to see on the home page, and the region you chose (Northern or
          Southern California). None of it is ever sent anywhere &mdash; there are no accounts, no
          analytics, no tracking cookies and no requests to other sites from any page. School
          colors come from MaxPreps&rsquo; data, never an image copied from another site, and the
          fonts ship with the site.
        </p>
        <p>
          Accessibility is a floor, not an aspiration: every win/loss/tie is a letter and a written
          word, never color alone; every score and result has a full sentence for screen readers;
          the site&rsquo;s own text and background colors meet the WCAG AA contrast standard, and a
          change to them that would fall below it is caught before it is published. Team badges are
          the exception: they use school colors from MaxPreps, with the letters in whichever of black
          or white stands out more, and are not part of that check.
        </p>
      </div>
    </section>
  );
}

export default AboutPrivacy;

import SectionHeader from '@/components/ui/SectionHeader';
import type { AboutView } from '@/views/about/about-view';

/**
 * /about#conventions: how a score is shown — the one rule (an undecided game never shows 0–0), then one
 * item per status, with one item per section whose level games end in a shootout.
 */
export function AboutConventions({ shootoutSections }: Pick<AboutView, 'shootoutSections'>) {
  return (
    <section id="conventions" className="mt-16">
      <SectionHeader size="lg" kicker="How a score is shown" />
      <div className="sx-prose">
        <p>
          One rule governs every score on this site: a game that has not been decided never shows
          as <span className="sx-num">0&ndash;0</span>. A real final score of 0 prints as{' '}
          <span className="sx-num">0</span>; a game with nothing reported yet shows a dash in lighter
          gray, and screen readers say &ldquo;not reported&rdquo;. The two are never confused.
        </p>
        <ul className="list-disc">
          <li>A completed game shows <b className="font-semibold text-ink">FINAL</b> and the score; an overtime win adds an OT tag.</li>
          {/* One item per section with a shootout rule (SectionConfig.shootout): the Northern Section's
              1 v 1s (the EAL's sentence, unchanged), the San Diego Section's shootouts. */}
          {/* An 'unverified' section (San Diego) never says a shootout decided a level W/L final: no box
              score carries a tally, and si.com and the Section's power rankings record Mt. Carmel–Poway
              (Sep 11) as 2-0 where MaxPreps has 0-0 (SectionConfig.shootout.inference). */}
          {shootoutSections.map((g) => (
            <li key={g.section.id}>
              {g.leagues.length === 1
                ? `A level ${g.leagues[0].shortName} league game`
                : `A level game between two ${g.section.name} teams`}{' '}
              {g.section.shootout!.inference === 'verified' ? (
                <>
                  that MaxPreps marks as won was decided on {g.section.shootout!.words}: it shows the level score
                  with an SO tag and counts as the winner&rsquo;s win. The{' '}
                  {/* '1 v 1s' → '1 v 1', 'a shootout' → 'shootout'. */}
                  {g.section.shootout!.words.replace(/^a /, '').replace(/s$/, '')} tally is not shown.
                </>
              ) : (
                <>
                  that MaxPreps marks as won is counted as the flagged team&rsquo;s win (under the
                  Section&rsquo;s procedures a level game outside a tournament is settled in overtime or
                  by a shootout; si.com and the Section&rsquo;s power rankings record some such games
                  with the shootout goal added): it shows MaxPreps&rsquo; score with no decider tag.
                </>
              )}
            </li>
          ))}
          <li>
            A forfeit counts in win-loss-tie but not in goals for/against/differential &mdash; marked
            with a dagger everywhere a total would otherwise be misleading.
          </li>
          <li>A game with no score posted yet shows <b className="font-semibold text-ink">SCORE NOT REPORTED</b> with an empty outline chip, never a blank or a zero.</li>
          <li>A postponed game shows <b className="font-semibold text-ink">POSTPONED</b> with the new date when one is known, or &ldquo;TBD&rdquo; when it is not.</li>
          <li>A non-league game carries a small NL tag everywhere; it counts in a team&rsquo;s overall record and nowhere in the league standings.</li>
          <li>A score published from si.com carries a marker and a &ldquo;score via si.com&rdquo; line on its game page.</li>
        </ul>
      </div>
    </section>
  );
}

export default AboutConventions;

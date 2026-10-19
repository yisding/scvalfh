import SectionHeader from '@/components/ui/SectionHeader';
import { plural } from '@/lib/format/words';
import type { AboutView } from '@/views/about/about-view';

import BackfillTable from './BackfillTable';

/**
 * /about#backfills: the fixed rules under which a si.com score is published (owner decision D2), and
 * every score published under them.
 */
export function AboutBackfills({ backfilled, shootoutSections }: Pick<AboutView, 'backfilled' | 'shootoutSections'>) {
  return (
    <section id="backfills" className="mt-16">
      <SectionHeader
        size="lg"
        kicker="Scores taken from si.com"
        meta={plural(backfilled.length, 'score', 'scores')}
      />
      <div className="sx-prose">
        <p>
          MaxPreps is our primary source. We publish a score from High School on SI (si.com) only
          when one of these holds, and only when si.com has the game as final with both teams
          matched by si.com&rsquo;s own team ids (never by name), on the official date or a day
          either side of it:
        </p>
        <ul className="list-disc">
          <li>MaxPreps has no contest at all for a game on the league&rsquo;s official schedule;</li>
          <li>MaxPreps lists the game, its date has passed, and it has no score;</li>
          <li>
            MaxPreps&rsquo; row is clearly wrong in a way we can check mechanically: its own win/loss
            flags contradict its score, the official schedule shows the game was not played on
            MaxPreps&rsquo; date, or it shows a scoreless tie that si.com reports as decided in a
            league that plays no overtime.
          </li>
        </ul>
        <p>
          {shootoutSections.map((g) => (
            <span key={g.section.id}>
              A level si.com score between two {g.teamsWho}{' '}
              teams is never used: a varsity game there
              {/* The San Diego procedures do not cover invitational tournaments (coversTournaments false),
                  where level finals stand: seven San Diego pairs' tournament games are 0-0. */}
              {g.section.shootout!.coversTournaments ? '' : ' outside a tournament'} is decided on{' '}
              {g.section.shootout!.words}, and si.com does not say
              who won {g.section.shootout!.words.endsWith('s') ? 'them' : 'it'}.{' '}
            </span>
          ))}
          Any other disagreement keeps MaxPreps&rsquo; score and is listed in the cross-check log.
          A score taken from si.com counts in the standings like any other final score. si.com never decides
          league membership, league records or the standings order.
        </p>
      </div>
      <div className="mt-stack">
        <BackfillTable rows={backfilled} />
      </div>
    </section>
  );
}

export default AboutBackfills;

import Link from 'next/link';

import SectionHeader from '@/components/ui/SectionHeader';
import { JV_STANDINGS_MIN_REPORTED_SHARE } from '@/lib/engine/jv/standings';
import { listWords, plural } from '@/lib/format/words';
import type { AboutView } from '@/views/about/about-view';
import { jvTableTitle } from '@/views/standings/jv';

/**
 * /about#jv: where the JV games come from, how a JV game counts for a JV table, when a table is shown,
 * and how si.com supplements MaxPreps, each with today's count.
 */
export function AboutJv({ jv }: Pick<AboutView, 'jv'>) {
  return (
    <section id="jv" className="mt-16">
      <SectionHeader size="lg" kicker="JV games" meta={plural(jv.games, 'game', 'games')} />
      <div className="sx-prose">
        <p>
          Each team page and each day&rsquo;s scores also list the school&rsquo;s junior varsity
          games, in a section of their own. They come from MaxPreps&rsquo; JV schedules (the same
          feed as varsity, for the JV season), read with the rest of the update: today{' '}
          {plural(jv.counts.games, 'game', 'games')} for {jv.counts.teamsWithGames} of the{' '}
          {jv.counts.teams} schools, {jv.counts.finals} with a score. A school with no JV
          games on MaxPreps may not field a JV team, or may not have entered its schedule.
        </p>
        <p>
          JV games are kept apart from varsity: no varsity standings table, record, leader board,
          rating or postseason picture on this site reads them. They have tables of their own, on
          the{' '}
          <Link href="/jv" prefetch={false} className="text-accent hover:underline">
            JV standings
          </Link>{' '}
          page. MaxPreps&rsquo; JV league flags are unreliable and no
          league publishes a JV schedule or JV standings during the season, but every league plays its
          JV games alongside its varsity fixtures, so a JV game counts for a JV table when its varsity
          counterpart (the same two schools within three days) counts for that division&rsquo;s varsity
          table, or when it matches a fixture on the league&rsquo;s official schedule that no varsity
          contest matched. A JV game between two schools of one division with no varsity counterpart
          is not counted and is named under its table (today{' '}
          {plural(jv.uncounted, 'game', 'games')}).
        </p>
        <p>
          A JV table is ordered on points (3 a win, 1 a tie, as SCVAL orders its own JV tables); no
          league publishes a JV tiebreak, so teams level on points share a place. Coaches enter far
          fewer JV scores than varsity ones, so a table is shown only once{' '}
          {Math.round(JV_STANDINGS_MIN_REPORTED_SHARE * 100)}% of its division&rsquo;s JV league games
          played so far have a score; today that is{' '}
          {jv.shown.length > 0 ? listWords(jv.shown.map((t) => jvTableTitle(t.division))) : 'none'}.
          The others say how many of their games have a score.
        </p>
        <p>
          MaxPreps comes first, as for varsity. Each school&rsquo;s JV page on High School on SI
          (si.com) supplements it, matched only by si.com&rsquo;s own JV team ids and only for a game
          between two of these schools on the same date or a day either side: si.com&rsquo;s final score
          fills a score MaxPreps has not reported (marked &dagger;; today{' '}
          {plural(jv.filled, 'game', 'games')}) and adds a game MaxPreps does not list at
          all, when MaxPreps has no JV game between the two schools within two weeks of it (also
          &dagger;; today {plural(jv.added, 'game', 'games')}). When the two disagree on
          a score, MaxPreps&rsquo; is shown and si.com&rsquo;s is noted under the game (today{' '}
          {plural(jv.differs, 'game', 'games')}). A game si.com lists twice with two
          different scores is not used.
        </p>
      </div>
    </section>
  );
}

export default AboutJv;

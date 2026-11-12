import Link from 'next/link';

import { jvTableTitle } from '../../jv/jv-standings-view';
import ExternalLink from '../../ui/ExternalLink';
import SectionHeader from '../../ui/SectionHeader';
import { getTeamBySlug } from '../../../lib/data';
import { listWords, plural } from '../../../lib/format';
import { getJvOfficialMerge } from '../../../lib/jv/jv';
import { JV_SCHOOL_SITES } from '../../../lib/jv/jv-school-sites';
import { JV_STANDINGS_MIN_REPORTED_SHARE } from '../../../lib/jv/jv-standings';
import { LEAGUES } from '../../../lib/leagues';
import { IS_FIELD_HOCKEY } from '../../../lib/sports/current';
import { ordersByRecord } from '../../../lib/standings/order';
import type { AboutJv } from '../about-view';

/**
 * /about#jv: where the JV games come from (MaxPreps, then si.com, then two schools' own sites), how a JV
 * game counts for a JV table, when a table is shown, the PCAL's York / Santa Catalina pairing, and
 * the JV rosters on the team pages.
 */
export function JvSection({ jv }: { jv: AboutJv }) {
  const { school, file, uncounted, shown, merge, corrections, rosters } = jv;
  // The league's own JV schedule, where its document sets the JV round (lib/jv/jv-official.ts): SCVAL basketball.
  const official = getJvOfficialMerge();
  const byRecord = LEAGUES.every((l) => ordersByRecord(l.rules));
  return (
    <section id="jv" className="sx-section">
      <SectionHeader kicker="JV games" meta={plural(school.games.length, 'game', 'games')} />
      <div className="sx-prose">
        <p>
          Each team page and each day&rsquo;s scores also list the school&rsquo;s junior varsity
          games, in a section of their own. They come from MaxPreps&rsquo; JV schedules (the same
          feed as varsity, for the JV season), read with the rest of the update: today{' '}
          {plural(file.counts.games, 'game', 'games')} for {file.counts.teamsWithGames} of the{' '}
          {file.counts.teams} schools, {file.counts.finals} with a score. A school with no JV
          games on MaxPreps may not field a JV team, or may not have entered its schedule.
        </p>
        <p>
          JV games are kept apart from varsity: no varsity standings table, record, leader board,
          rating or postseason picture on this site reads them. They have tables of their own, on
          the{' '}
          <Link href="/jv" prefetch={false}>
            JV page
          </Link>
          , which also lists each league&rsquo;s latest JV results, its next JV games and every school&rsquo;s
          JV team, and links each league&rsquo;s whole JV season by date. MaxPreps&rsquo; JV league flags are unreliable and no
          league publishes a JV schedule or JV standings during the season, but every league plays its
          JV games alongside its varsity fixtures, so a JV game counts for a JV table when its varsity
          counterpart (the same two schools within three days) counts for that division&rsquo;s varsity
          table, or when it matches a fixture on the league&rsquo;s official schedule that no varsity
          contest matched. A JV game between two schools of one division with no varsity counterpart
          is not counted and is named under its table (today{' '}
          {plural(uncounted, 'game', 'games')}).
        </p>
        {official.slots > 0 ? (
          <p>
            Where a league&rsquo;s own schedule sets the JV games too, this site lists them from it. SCVAL&rsquo;s
            schedules give every league fixture&rsquo;s JV starting time (5:30 before a 7:00 varsity game; 3:00 or
            4:30 on a quad day, when four games are played at one site) and put the last JV
            round on the Monday before the last varsity night, and its by-laws make the JV round a double round
            robin like the varsity one. So each of the {official.slots} league fixtures has a JV game here: MaxPreps&rsquo;
            own row where a coach has entered it ({official.matched + official.moved} today), and otherwise a game
            listed from the schedule, noted &ldquo;League schedule&rdquo;, with the schedule&rsquo;s date, time and host and no score
            ({plural(official.added.length, 'game', 'games')} today). Such a game is replaced by MaxPreps&rsquo; row,
            and its score, as soon as MaxPreps lists it.
          </p>
        ) : null}
        <p>
          {byRecord
            ? 'A JV table is ordered as the league’s varsity tables are, on the league record; no league publishes a JV tiebreak, so teams level on it share a place.'
            : 'A JV table is ordered on points (3 a win, 1 a tie, as SCVAL orders its own JV tables); no league publishes a JV tiebreak, so teams level on points share a place.'}{' '}
          Coaches enter far
          fewer JV scores than varsity ones, so a table ranks its teams only once{' '}
          {Math.round(JV_STANDINGS_MIN_REPORTED_SHARE * 100)}% of its division&rsquo;s JV league games
          played so far have a score; today that is{' '}
          {shown.length > 0 ? listWords(shown.map((t) => jvTableTitle(t.division))) : 'none'}.
          The others say how many of their games have a score, and list their teams unranked until a game is played.
        </p>
        {/* si.com, the two school sites, the hand corrections and the PCAL pairing are field hockey's sources and
            facts: the soccer build reads MaxPreps alone (lib/sports/current.ts). */}
        {IS_FIELD_HOCKEY ? (<>
        <p>
          MaxPreps comes first, as for varsity. Each school&rsquo;s JV page on High School on SI
          (si.com) supplements it, matched only by si.com&rsquo;s own JV team ids and only for a game
          between two of these schools on the same date or a day either side: si.com&rsquo;s final score
          fills a score MaxPreps has not reported (marked &dagger;; today{' '}
          {plural(merge.filled.length, 'game', 'games')}) and adds a game MaxPreps does not list at
          all, when MaxPreps has no JV game between the two schools within two weeks of it (also
          &dagger;; today {plural(merge.added.length, 'game', 'games')}). When the two disagree on
          a score, MaxPreps&rsquo; is shown and si.com&rsquo;s is noted under the game (today{' '}
          {plural(merge.differs.length, 'game', 'games')}). A game si.com lists twice with two
          different scores is not used.
        </p>
        <p>
          Two schools publish their JV results on their own athletics sites,{' '}
          {JV_SCHOOL_SITES.map((s, i) => (
            <span key={s.school}>
              {i === 0 ? '' : i === JV_SCHOOL_SITES.length - 1 ? ' and ' : ', '}
              <ExternalLink href={s.url}>
                {getTeamBySlug(s.school)?.name ?? s.school}
              </ExternalLink>
            </span>
          ))}
          , read by hand once JV league play ended. They are used on the same terms as si.com, after it: today
          they fill {plural(school.filled.length, 'score', 'scores')}, add{' '}
          {plural(school.added.length, 'game', 'games')} and disagree with MaxPreps on{' '}
          {plural(school.differs.length, 'score', 'scores')} (also &dagger;, and noted under the game).
          Some MaxPreps JV rows are not taken as they stand: {plural(corrections.excluded.length, 'row is', 'rows are')}{' '}
          left out, most of them a second copy of a game entered against the wrong school of the same name
          (the boys&rsquo; Stuart Hall for Convent &amp; Stuart Hall, another Stevenson or St. Francis) or a
          game si.com shows was cancelled, and {plural(corrections.moved.length, 'game is', 'games are')} moved
          to the day a school&rsquo;s schedule says it was played.
        </p>
        <p>
          PCAL pairs two schools in one schedule slot: Santa Catalina fields varsity only and York fields JV
          only, so the JV game of every Santa Catalina fixture is York&rsquo;s. York stands in the PCAL JV table
          in Santa Catalina&rsquo;s place, a JV game MaxPreps files under Santa Catalina is shown as
          York&rsquo;s, and a York game counts when Santa Catalina&rsquo;s varsity game of the day does. York
          has no page of its own here: its JV games and its JV table line are in{' '}
          <Link href="/teams/santa-catalina#jv" prefetch={false}>
            Santa Catalina&rsquo;s JV section
          </Link>
          , each result from York&rsquo;s side, and its row in the PCAL JV table links there. York is
          matched on si.com by its own JV team id.
        </p>
        <p>
          A team page also lists the school&rsquo;s JV roster, after its varsity roster, where we found
          one: today {plural(rosters.schools, 'school', 'schools')}. The lists come from MaxPreps&rsquo; JV
          roster pages and from the schools&rsquo; own athletics sites, which were read by hand; where both
          have a list, the page shows the one with more JV players and names the other ({rosters.siteSchools}{' '}
          of the lists shown are a school&rsquo;s own). A player on the school&rsquo;s varsity roster is not
          repeated on its JV list, which says how many it leaves out: several MaxPreps JV pages list the
          whole program.
        </p>
        </>) : null}
      </div>
    </section>
  );
}

export default JvSection;

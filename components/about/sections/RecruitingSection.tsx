import Link from 'next/link';

import { buildClubsIndexView } from '../../clubs/club-view';
import { buildCommitsView } from '../../commits/commit-view';
import { buildRecruitingView } from '../../recruiting/recruiting-view';
import SectionHeader from '../../ui/SectionHeader';
import { getClubs } from '../../../lib/players/clubs';
import { HAS_RECRUITING, IS_VOLLEYBALL, SPORT } from '../../../lib/sports/current';

/**
 * The words that differ by sport: where the research looked and how a place backs a match. Field hockey's
 * were written with its 2026-10 sweeps (README, "Clubs"); volleyball's with the 2026-11-13 round
 * (data/volleyball/clubs.json's notes).
 */
const WORDS = IS_VOLLEYBALL
  ? {
      clubSources:
        'the club’s own site or rosters, a SportsRecruits, NCSA, Hudl or FieldLevel profile, a MaxPreps career page, or local news',
      place: 'a hometown in the school’s own area',
      otherClubs: 'Social-media posts, and clubs in other sports, do not count.',
      restOn:
        'Most ties rest on one page that names the player, the club and the school. Some rest on a club roster’s class year plus a hometown in the school’s own area.',
      nickname: 'A nickname or a given name',
      profilePlace: 'a hometown in the school’s own area',
    }
  : {
      clubSources:
        'the club’s own site, a SportsRecruits, NCSA, Hudl or FieldLevel profile, a MaxPreps career page, the NFHCA’s high school watchlists, MAX Field Hockey’s club and school pages, or local news such as the Gilroy Dispatch and Stick Together',
      place: 'a location in the school’s half of the state, Northern or Southern California',
      otherClubs: 'Social-media posts, and lacrosse, soccer and ice hockey clubs, do not count.',
      restOn:
        'Most ties rest on one page that names the player, the club and the school. Some rest on a club roster’s class-year heading plus the club’s location, or on a school nickname in a news story.',
      nickname: 'A nickname or a given name (Samantha for Sami)',
      profilePlace: 'a California hometown',
    };

/**
 * /about#recruiting: the hand-researched pages (/clubs, /commits, /recruiting; field hockey's and volleyball's,
 * lib/sports/current.ts HAS_RECRUITING). What they cover (`#clubs-coverage`, `#commits-coverage`,
 * DESIGN §17.1, §21.4), and how a player is matched to a club (`#clubs-matched`), a commitment is
 * matched (`#commits-matched`) and the by-school lists are gathered (`#recruiting-built`). This is
 * the one place the method is written (DESIGN §33): each of the three pages links here and says
 * nothing of it itself.
 *
 * The dates and counts come from the views those pages are built from, so the two cannot disagree.
 */
export function RecruitingSection({ commitCount }: { commitCount: number }) {
  if (!HAS_RECRUITING) return null;
  const clubs = buildClubsIndexView();
  const commits = buildCommitsView();
  const recruiting = buildRecruitingView();
  return (
    <section id="recruiting" className="sx-section">
      <SectionHeader kicker="Clubs, commitments and recruiting" />
      <div className="sx-prose">
        <p id="clubs-coverage">
          Club {SPORT.noun}: the{' '}
          <Link href="/clubs" prefetch={false}>
            club teams
          </Link>{' '}
          pages list {getClubs().length} youth clubs (the clubs found around these schools, plus any other club
          a player here is tied to) and, for each, the players on these varsity rosters that a public
          page ties to it: {WORDS.clubSources}. It was
          researched by hand, each tie checked twice when it was added, and is not part of the
          twice-daily update. Only players already on these rosters are
          named, social media is never used, and recall is partial.
        </p>
        <p id="commits-coverage">
          College commitments: the{' '}
          <Link href="/commits" prefetch={false}>
            college commitments
          </Link>{' '}
          page lists the players on these varsity rosters that a public page says have committed to
          play a sport in college, {SPORT.noun} or any other
          {commitCount > 0 ? ` (${commitCount} found)` : ''}, from
          players&rsquo; recruiting profiles, commitment lists, club and school sites, and local
          news. It was researched by hand with the club pages&rsquo; matching rule, each commitment
          checked twice when it was added, and is not part of the twice-daily update. A social-media post
          counts only from an official college, school or club account, so a commitment announced
          only on a player&rsquo;s own account is not listed, and recall is partial.
        </p>

        <section aria-labelledby="clubs-matched">
          <h3 id="clubs-matched">How players are matched to clubs</h3>
          <p>
            Only players on the {clubs.trackedTeams} varsity rosters this site tracks are listed; rows
            a school marks JV are left out. A club&rsquo;s own roster names many more players. They
            are not named here: a club&rsquo;s page links its own roster where one is public.
          </p>
          <p>
            A player is tied to a club only when a public page names the player and a {SPORT.noun}{' '}
            club, and also either names the player&rsquo;s high school, or gives a class year that
            matches the player&rsquo;s grade along with {WORDS.place}. A name alone
            never counts, and a class year that disagrees with the roster rules a match out. A
            nickname {IS_VOLLEYBALL ? '' : '(Abby for Abigail) '}counts when the page otherwise meets that rule and a second
            page, or the player&rsquo;s own, backs the match.{' '}
            {WORDS.otherClubs}
          </p>
          <p>
            {WORDS.restOn} Every tie links the pages it rests on, and each was checked
            twice, in two separate passes, when it was added.
          </p>
          <p>
            &ldquo;Current&rdquo; means a source from the {clubs.currentSeasons} club season: a page
            dated in one of them, a club&rsquo;s current-players page, or a live recruiting profile
            that lists the club. &ldquo;Earlier&rdquo; means an older date, an alumni list, or a club
            the player&rsquo;s own page lists for earlier years. &ldquo;Listed by&rdquo; means a
            source names the club without saying whether the player is still with it, such as a
            profile not updated since an earlier season, or one a newer page contradicts. The date
            shown is the date or season the sources give for that listing, and such a tie is never
            shown as current.
          </p>
          <p>
            Recall is partial. A player with no public page that meets the rule is not listed,
            whatever club they play for, so a school with no one here may still have plenty of club
            players.{clubs.regionsWithoutClubsSentence ? ` ${clubs.regionsWithoutClubsSentence}` : ''}
            {clubs.regionsNotSearchedSentence ? ` ${clubs.regionsNotSearchedSentence}` : ''}
          </p>
        </section>

        <section aria-labelledby="commits-matched">
          <h3 id="commits-matched">How commitments are matched</h3>
          <p>
            Only players on the {commits.trackedTeams} varsity rosters this site tracks are listed; rows
            a school marks JV are left out, and so are graduates. Each is listed under the
            roster&rsquo;s own spelling, and their team&rsquo;s page shows the commitment beside
            their name.
          </p>
          <p>
            A commitment is listed only when a public page says the player has committed to, or
            signed with, a college to play a sport on one of its teams, and the page also either
            names the player&rsquo;s high school, or gives a class year that matches the
            player&rsquo;s grade along with {WORDS.place}. {SPORT.name} is this
            site&rsquo;s sport, but many players here also play another, and a commitment in any
            sport counts: each row names the sport. A name alone never counts, and a class year that
            disagrees with the roster rules a match out. {WORDS.nickname} counts when the page otherwise meets that rule and a second page, or the
            player&rsquo;s own, backs the match. A college a player is only interested in,
            has an offer from or has visited is not a commitment, and neither is a place on a
            college&rsquo;s club team.
          </p>
          <p>
            Commitments are often announced only on social media. A social-media post is used only
            when an official account posted it: a college&rsquo;s athletics or team account, the
            player&rsquo;s high school&rsquo;s, or a club&rsquo;s. A player&rsquo;s own post, or any
            other person&rsquo;s, is never used, so a commitment announced only there is not
            listed. The other pages used are players&rsquo; own recruiting profiles (SportsRecruits,
            NCSA and the like), commitment lists, club and school sites, and local news. Each commitment links the pages it rests
            on, and each was checked twice when it was found: once by re-opening every source, then
            by a separate pass that tried to break it. Every source was last re-opened on{' '}
            {commits.capturedOn}.
          </p>
          <p>
            &ldquo;Committed&rdquo; means a page says the player has committed, and no page we used
            says the player has signed. &ldquo;Signed&rdquo; appears only where a page says so. The
            date shown is the earliest date a source gives for the commitment, which may be the
            date of the page rather than the day the player decided. A commitment can change after
            that date; this list is not updated automatically.
          </p>
          <p>
            Recall is partial. A player with no public page that meets the rule is not listed, so a
            school with no one here may still have players headed to a college team.
          </p>
        </section>

        <section aria-labelledby="recruiting-built">
          <h3 id="recruiting-built">How the by-school lists are gathered</h3>
          <p>
            The{' '}
            <Link href="/recruiting" prefetch={false}>
              recruiting
            </Link>{' '}
            lists gather every school&rsquo;s recruiting profiles, clubs and commitments in one place.
            Players on the {recruiting.trackedTeams} varsity rosters this site tracks are listed under the
            roster&rsquo;s own spelling; rows a school marks JV are left out of them. A player is
            listed when a public page shows at least one of three things for them, and each
            school&rsquo;s roster shows the same lines, beside the rest of the
            player&rsquo;s facts and the sources they came from.
            {(recruiting.counts.jvWithProfile ?? 0) > 0 ? (
              <>
                {' '}
                After them come the JV players with a recruiting profile, marked &ldquo;JV&rdquo;, from
                the JV lists the team rosters show; commitments and clubs are looked for on the varsity
                rosters only.
              </>
            ) : null}
          </p>
          <p>
            <strong>Recruiting profiles</strong> are
            players&rsquo; own pages on NCSA, SportsRecruits, Hudl, FieldLevel and the like, in {SPORT.noun}{' '}
            or any other sport (a profile in another sport says which). A profile is linked
            only when it names the player and a sport, and either names the school or shows the class
            year the roster shows along with {WORDS.profilePlace}. A MaxPreps profile is the
            player&rsquo;s own page on MaxPreps, where the rosters come from, linked only where the
            player or a parent has claimed it. They were last gathered on{' '}
            {recruiting.profilesCheckedOn}.
          </p>
          <p>
            <strong>Club lines</strong> link the club&rsquo;s own entry
            on this site, which cites a source for each player it lists. A &ldquo;listed club&rdquo; is one a source names without saying whether the player is
            still with it. The first club sweep was on {recruiting.clubsCheckedOn}.
          </p>
          <p>
            <strong>Commitment lines</strong> link the
            player&rsquo;s entry among the college commitments, which cites a source for each one.
            &ldquo;Signed&rdquo; appears only where a source says so, and a commitment in a sport
            other than {SPORT.noun} names it. They were checked on {recruiting.commitsCheckedOn}.
          </p>
          <p>
            None of this is part of the twice-daily update: it is research done by hand, and social
            media is never used, apart from commitment posts by official college, school and club
            accounts. Recall is partial, so a player who is not listed here may still have
            a profile, play for a club or have committed.
          </p>
        </section>
      </div>
    </section>
  );
}

export default RecruitingSection;

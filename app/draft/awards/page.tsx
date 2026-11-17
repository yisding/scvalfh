import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { collegeAnchor, commitRegion } from '../../../components/commits/commit-view';
import PageHeader from '../../../components/layout/PageHeader';
import ExternalLink from '../../../components/ui/ExternalLink';
import { getCommitments } from '../../../lib/players/commits';
import { getRosters } from '../../../lib/players/rosters';
import { IS_FIELD_HOCKEY } from '../../../lib/sports/current';
import { getTeamBySlug } from '../../../lib/teams';

/** The page's title, and its og:title too. */
const PAGE_TITLE = 'NCFH.net Inaugural High School Field Hockey Awards';

/** USA Field Hockey's 2026 U-18 women's national team list, which names both Lola Conway and Margaux Schlumberger. */
const USAFH_U18_ROSTER = 'https://usafieldhockey.com/junior-uswnt#_2026_U_S__U_18_Women_s_National_Team_cs60';

/**
 * /draft/awards — a DRAFT post: the owner's end-of-season awards for 2026, written by hand.
 *
 * Not linked from anywhere, not in the sitemap and marked `noindex`, so it is read only by whoever is
 * given the URL until it is published. Field hockey's alone: another sport's build renders it as a 404.
 *
 * Every team name (nicknames too) links to its team page and every player name to her team page's roster
 * (`#roster`), so the links stay on this site (the one exception: "Team USA U-18" links to USA Field Hockey's U-18
 * roster); the two colleges link to their rows on /commits, and the
 * Tournament of Champions wins to their brackets (2025 on /history/2025-26, 2026 on /playoffs). The leaders
 * lists it names link to their NorCal boards on /leaders, its Elo figures to the Elo boards (Bishop's to
 * SoCal's, St. Ignatius to NorCal's: there is no statewide board) and De Anza to its standings. Each link
 * to a team, player or college is checked at build time: a team slug not in the registry, a player not on
 * that team's varsity roster or a commitment not in data/commits.json throws, so a roster refresh that drops a name fails the build
 * rather than shipping a link to the wrong place. Every link carries `prefetch={false}`: the post has
 * about fifty of them, and the default would download every team page it names.
 */
export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: 'The first NCFH.net awards for the 2026 California high school field hockey season. Draft.',
  robots: { index: false, follow: false },
};

function teamHref(slug: string): string {
  if (!getTeamBySlug(slug)) throw new Error(`app/draft/awards: no team ${slug}`);
  return `/teams/${slug}`;
}

/** A team name, linked to its team page. */
function T({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <Link href={teamHref(slug)} prefetch={false}>
      {children}
    </Link>
  );
}

/** A player's name (full or first), linked to her team page's roster. `name` is her roster name. */
function P({ team, name, children }: { team: string; name: string; children?: React.ReactNode }) {
  const roster = getRosters().teams.find((t) => t.slug === team);
  if (!roster?.players.some((p) => p.fullName === name)) {
    throw new Error(`app/draft/awards: ${name} is not on ${team}'s roster`);
  }
  return (
    <Link href={`${teamHref(team)}#roster`} prefetch={false}>
      {children ?? name}
    </Link>
  );
}

/** A college, linked to its row on /commits (in the region block of the player who committed there). */
function C({ college, player, children }: { college: string; player: string; children: React.ReactNode }) {
  const commit = getCommitments().find((c) => c.college === college && c.fullName === player);
  if (!commit) throw new Error(`app/draft/awards: no commitment of ${player} to ${college}`);
  return (
    <Link href={`/commits#${collegeAnchor(commitRegion(commit), college)}`} prefetch={false}>
      {children}
    </Link>
  );
}

/** "De Anza", linked to the division's standings table. */
function DeAnza() {
  return (
    <Link href="/standings/scval#de-anza" prefetch={false}>
      De Anza
    </Link>
  );
}

export default function AwardsDraftPage() {
  if (!IS_FIELD_HOCKEY) notFound();

  return (
    <div className="pb-section-lg">
      <PageHeader title={PAGE_TITLE} meta={<span>Draft · not published</span>} />

      <article className="sx-prose mt-4">
        <p>
          With Saturday&rsquo;s final tournaments played and won, it&rsquo;s the end of a great season of field hockey
          in California. Congratulations to{' '}
          {/* This sentence alone links each winner to the bracket it won: the CCS divisions' sections, and
              the San Diego Section finals' own ties (a tie's id opens its round). */}
          <Link href="/playoffs#ccs-division-1" prefetch={false}>
            St. Ignatius
          </Link>
          ,{' '}
          <Link href="/playoffs#ccs-division-2" prefetch={false}>
            Los Altos
          </Link>
          ,{' '}
          <Link href="/playoffs#sds-division-2-4-0" prefetch={false}>
            Point Loma
          </Link>
          ,{' '}
          <Link href="/playoffs#sds-division-1-3-0" prefetch={false}>
            San Marcos
          </Link>
          , and{' '}
          <Link href="/playoffs#sds-open-2-0" prefetch={false}>
            Bishop&rsquo;s
          </Link>{' '}
          on their victories.
        </p>
        <p>With all games played, it&rsquo;s time for the first ever NCFH.net awards for 2026:</p>

        <h2 className="mt-8 text-ink">NorCal&rsquo;s Most Impressive Newcomers</h2>
        <p>
          Longtime fans of field hockey in northern California might see two unfamiliar names on the{' '}
          <Link href="/leaders#most-points" prefetch={false}>
            top 5 points lists
          </Link>
          :
          Freshman <P team="stevenson" name="Lotti Schulte" /> (92 points) and Junior{' '}
          <P team="stevenson" name="Greta Jungjohann" /> (85 points) leading <T slug="stevenson">Stevenson</T> to a
          perfect 12-0 in league play. &ldquo;Do they play club? Which one? How come we&rsquo;ve never heard of
          them?&rdquo; Turns out the answer is yes, before joining the <T slug="stevenson">Pirates</T>, they played field hockey at hundred year
          old clubs in Germany. A very warm welcome to the duo from Deutschland!
        </p>

        <h2 className="mt-8 text-ink">Closest to the Postseason</h2>
        <p>
          Of all of the teams that didn&rsquo;t make the CCS playoffs this year, one stands out. <T slug="fremont">Fremont</T>{' '}
          ended the season with 1706 Elo points, hundreds of Elo points higher than many others that did make postseason
          tournaments. Led by the twins <P team="fremont" name="Sophie Dhillon">Sophie</P> and{' '}
          <P team="fremont" name="Emma Dhillon">Emma Dhillon</P>, <T slug="fremont">Fremont</T> was also most improved
          in NorCal, increasing their Elo by 369 points over the fall. Even a 10-9-3 overall record wasn&rsquo;t enough
          to make it out of the very competitive <DeAnza /> division this year, home to both{' '}
          CCS champion <T slug="st-ignatius">St. Ignatius</T> and CCS runner-up <T slug="saint-francis">Saint Francis</T>.
          But not to worry,{' '}
          <P team="fremont" name="Sophie Dhillon">Sophie</P> and <P team="fremont" name="Emma Dhillon">Emma</P> are only
          freshmen, so I have a feeling we&rsquo;ll see them in the CCS very soon.
        </p>

        <h2 className="mt-8 text-ink">NorCal&rsquo;s Freshmen to Watch</h2>
        <p>
          I&rsquo;ve already mentioned <P team="stevenson" name="Lotti Schulte">Lotti</P> and the{' '}
          <P team="fremont" name="Sophie Dhillon">Dhillon sisters</P>, but there were some other awesome performances put together by the
          class of 2030. On offense, you might notice that the only person not from <T slug="st-ignatius">SI</T> in the{' '}
          <Link href="/leaders#adjusted-points" prefetch={false}>
            &ldquo;Elo-Adjusted Points&rdquo; list
          </Link>{' '}
          is <T slug="university-sf">University High</T>&rsquo;s{' '}
          <P team="university-sf" name="Vivienne Wong" />. 64 points in a single season is an impressive start to her
          high school career! On the other side of the pitch was <T slug="saint-francis">Saint Francis</T>&rsquo;s{' '}
          <P team="saint-francis" name="Nora Lagenfeld" />. 66 saves and a save rate of 91.7%! Simply putting a shot on
          goal won&rsquo;t be enough against this freshman over the next 4 years.
        </p>

        <h2 className="mt-8 text-ink">NorCal&rsquo;s Best Goalkeeper</h2>
        <p>
          As impressive as <P team="saint-francis" name="Nora Lagenfeld">Nora</P>&rsquo;s stats were, there was another
          goalie who caught our attention on the stats sheets even more. <P team="valley-christian" name="Shyla Paredes" />{' '}
          recorded 242 saves this season, boosting <T slug="valley-christian">Valley Christian</T> to third place in the
          very tough <DeAnza /> division. That is an impressive number of saves and stamina! This is after last year where
          she already won <DeAnza />&rsquo;s goalie of the year as a sophomore.{' '}
          <P team="valley-christian" name="Shyla Paredes">Shyla</P> also committed to playing softball at{' '}
          <C college="cal-baptist" player="Shyla Paredes">
            Cal Baptist
          </C>
          ! Luckily for us, we&rsquo;ll still get to see her for another year in the goalie box.
        </p>

        <h2 className="mt-8 text-ink">NorCal&rsquo;s Best High School Field Hockey Team and MVP</h2>
        <p>
          20 and 1. 17 Clean Sheets, 135 goals goal difference. From start to finish, NorCal&rsquo;s best team has never
          been in doubt this season. Yes, I&rsquo;m talking about the one and only <T slug="st-ignatius">St. Ignatius</T>.
          The <T slug="st-ignatius">Wildcats</T> had an unstoppable run in the postseason not conceding a single goal in all 4 postseason matches
          they played! Jersey #1 <P team="st-ignatius" name="Storey Lewis" /> had 99 points this season, which would be
          enough for first place in NorCal, if not for her teammate, and NorCal High School MVP{' '}
          <P team="st-ignatius" name="Olivia Van de Braak" />{' '}
          with 126. 42 goals and 42 assists. Truly the meaning of life!
        </p>

        <h2 className="mt-8 text-ink">California&rsquo;s Best High School Field Hockey Team and MVP</h2>
        <p>
          <T slug="st-ignatius">SI</T> only lost to one team this season: <T slug="bishops">The Bishop&rsquo;s School</T>{' '}
          in La Jolla (outside San Diego). Yes, this site is called NorCal Field Hockey, but it&rsquo;s impossible to
          ignore the absolutely superlative performance they&rsquo;ve put together all season long. Playing the second
          toughest schedule in the state (only behind <T slug="scripps-ranch">Scripps Ranch</T>){' '}
          <T slug="bishops">Bishop&rsquo;s</T> outscored their opponents 171 to 5 achieving{' '}
          <Link href="/leaders#elo-rating-socal" prefetch={false}>
            an Elo of 2725
          </Link>
          , 107 points higher than the{' '}
          <Link href="/leaders#elo-rating" prefetch={false}>
            second highest Elo in the state
          </Link>{' '}
          (<T slug="st-ignatius">SI</T>). But, you might say that those
          Elo points are just imaginary internet chess rankings. Fair enough, so let me show you another points number:
          177. The{' '}
          <ExternalLink href={USAFH_U18_ROSTER} arrow={false}>
            Team USA U-18
          </ExternalLink>{' '}
          player <P team="bishops" name="Lola Conway" /> led <T slug="bishops">Bishop&rsquo;s</T> attack
          with 177 points in a single season. That&rsquo;s 69 goals and 39 assists over a single season against some of
          the best teams in the state! For that reason, I&rsquo;m forced to crown <T slug="bishops">Bishop&rsquo;s</T> as
          California&rsquo;s best high school team of 2026 and <P team="bishops" name="Lola Conway" /> as 2026 California
          High School MVP.
        </p>

        <h2 className="mt-8 text-ink">Honorable Mention</h2>
        <p>
          It&rsquo;s hard to finish this post without mentioning one more player.{' '}
          <ExternalLink href={USAFH_U18_ROSTER} arrow={false}>
            Team USA U-18
          </ExternalLink>{' '}
          player{' '}
          <P team="harvard-westlake" name="Margaux Schlumberger" /> led <T slug="harvard-westlake">Harvard-Westlake</T> to{' '}
          {/* The 2025 final is on the history page, the 2026 final on /playoffs. */}
          <Link href="/history/2025-26#toc-bracket" prefetch={false}>
            two consecutive
          </Link>{' '}
          <Link href="/playoffs#toc-final" prefetch={false}>
            Tournament of Champions
          </Link>{' '}
          (Los Angeles Field Hockey Association) wins. After this year,
          she&rsquo;s moving across the country to play for the other{' '}
          <C college="harvard" player="Margaux Schlumberger">
            Harvard
          </C>
          . Best of luck to her! See you all in the club season!
        </p>
        <p>-NCFH.net</p>
      </article>
    </div>
  );
}

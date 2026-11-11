import Link from 'next/link';

import { independentsWords, SITE_SCOPE_NOTE } from '../../layout/site';
import ExternalLink from '../../ui/ExternalLink';
import SectionHeader from '../../ui/SectionHeader';
import { capitalized } from '../../words/capitalized';
import { getClubs } from '../../../lib/players/clubs';
import { listWords, numberWord, plural } from '../../../lib/format';
import { getLeague, getSection, isIndependentLeague } from '../../../lib/leagues';
import { SDS_BRACKET_SHEET_URL } from '../../../lib/league-config/sections';
import { SOURCE_LINKS } from '../../../lib/season';
import { HAS_RECRUITING, SPORT } from '../../../lib/sports/current';
import { isQuotedLeague, leagueRef, rulesDocument, type AboutSources } from '../about-view';
import { officialSourceLabel } from '../LeagueHealthCard';

/**
 * /about#sources: where the data comes from. The three feeds (MaxPreps, si.com, cifsshome.org), one card
 * per league (a group of independents, a league with no schedule document and a league with its own
 * documents each say so their own way), the CCS card, a card per section whose league runs an unbracketed
 * tournament and per Southern California section, then the paragraphs on official fixtures, last season's
 * archive (`#history-coverage`), the club data (`#clubs-coverage`) and the college commitments
 * (`#commits-coverage`).
 */
export function SourcesSection({ sources }: { sources: AboutSources }) {
  const {
    counts,
    tabled,
    independentGroups,
    perLeague,
    officialStandingsPdfUrl,
    field,
    ncs,
    unbracketedSections,
    unbracketed,
    socalSections,
    leagues,
    officialFixtures,
    archive,
    commitCount,
  } = sources;
  return (
    <section id="sources">
      <SectionHeader size="lg" kicker="Data sources" />
      <p className="sx-prose">
        {SITE_SCOPE_NOTE} The latest update covers all {counts.teams} teams and {counts.games} games (
        {counts.leagueGames} of them league games): {plural(counts.finals, 'final score')}, {counts.pending} not yet
        reported.
      </p>
      <dl className="m-0 mt-stack grid gap-4 md:grid-cols-2">
        <div className="sx-card flex flex-col p-5">
          <dt>
            <span className="block text-lead text-ink">MaxPreps</span>
            <span className="mt-0.5 block text-meta text-ink-3">Primary source</span>
          </dt>
          <dd className="m-0 mt-2 flex flex-1 flex-col text-body text-ink-2">
            <span className="block">
              Team schedules, scores, league standings tables and school colors come from
              MaxPreps&rsquo; own public data feed, the same one that powers its team and league
              pages. We read it and never write to it. Each school&rsquo;s mascot comes from MaxPreps too
              (or, where that image is too small to show well, from SBLive/SI or the school&rsquo;s own website),
              copied to this site rather than hotlinked, so pages never load images from elsewhere. Each team page&rsquo;s roster and season player stats come from MaxPreps
              too, for all {counts.teams} teams in {tabled.length === 1 ? tabled[0].shortName : `all ${numberWord(tabled.length)} leagues`}{independentGroups.length > 0
                ? ` and the ${listWords(independentGroups.map((g) => independentsWords(getLeague(g.id))))}`
                : ''}: whatever the coach entered,
              with anything nobody published left blank. Other public sources, such as a school&rsquo;s
              own athletics site, only fill a blank MaxPreps leaves: the team page marks every roster
              value that came from one, and its Sources row links each page behind those values and
              behind the coaches it names.
            </span>
            <span className="mt-auto flex flex-wrap gap-2 pt-3">
              <ExternalLink href={SOURCE_LINKS.maxpreps} className="sx-pill">
                MaxPreps {SPORT.noun}
              </ExternalLink>
            </span>
          </dd>
        </div>
        <div className="sx-card flex flex-col p-5">
          <dt>
            <span className="block text-lead text-ink">High School on SI (si.com)</span>
            <span className="mt-0.5 block text-meta text-ink-3">Secondary &middot; checks scores and fills some gaps</span>
          </dt>
          <dd className="m-0 mt-2 flex flex-1 flex-col text-body text-ink-2">
            <span className="block">
              Sports Illustrated&rsquo;s high-school stats site (formerly SBLive) publishes its own
              scoreboard. We compare every final score with it, and publish its score only under
              the fixed rules listed under{' '}
              <a href="#backfills" className="text-accent hover:underline">
                Scores taken from si.com
              </a>
              . It is never used for league membership, records or the standings order.
            </span>
            <span className="mt-auto flex flex-wrap gap-2 pt-3">
              <ExternalLink href={SOURCE_LINKS.sblive} className="sx-pill">
                si.com {SPORT.noun}
              </ExternalLink>
            </span>
          </dd>
        </div>
        <div className="sx-card flex flex-col p-5">
          <dt>
            <span className="block text-lead text-ink">cifsshome.org</span>
            <span className="mt-0.5 block text-meta text-ink-3">Cross-check only</span>
          </dt>
          <dd className="m-0 mt-2 flex flex-1 flex-col text-body text-ink-2">
            <span className="block">
              The CIF Southern Section&rsquo;s schedule-and-score site, where schools from several
              Sections, ours among them, enter their own schedules and scores. We compare its scores with
              MaxPreps&rsquo; and list every difference in the{' '}
              <a href="#cross-check" className="text-accent hover:underline">
                cross-check log
              </a>
              . Nothing from it is published as a score, record or standing.
            </span>
            <span className="mt-auto flex flex-wrap gap-2 pt-3">
              <ExternalLink href={SOURCE_LINKS.cifss} className="sx-pill">
                cifsshome.org scores
              </ExternalLink>
            </span>
          </dd>
        </div>
        {perLeague.map(({ summary, config, noDocument, officialNotes }) => (
          <div key={summary.id} data-region-scope={summary.region} className="sx-card flex flex-col p-5">
            <dt>
              <span className="block text-lead text-ink">
                {isIndependentLeague(summary.id) ? summary.name : summary.shortName}
              </span>
              <span className="mt-0.5 block text-meta text-ink-3">
                {isIndependentLeague(summary.id) ? 'No league' : summary.name} &middot; {summary.section.shortName}
              </span>
            </dt>
            <dd className="m-0 mt-2 flex flex-1 flex-col text-body text-ink-2">
              {isIndependentLeague(summary.id) ? (
                // A group of independents: no league rules and no league documents to quote. Its note says
                // what its table counts; the Section's rules govern their games (overtime, the season's last date).
                <span className="block">
                  {officialNotes.join(' ')} The Southern Section rules that apply to their games, and how the
                  table is ordered, are under{' '}
                  <a href={`#rules-${summary.id}`} className="text-accent hover:underline">
                    {summary.name}
                  </a>
                  , from {rulesDocument(getSection(summary.section.id))}.
                </span>
              ) : noDocument ? (
                <span className="block">
                  The rules quoted under{' '}
                  <a href={`#rules-${summary.id}`} className="text-accent hover:underline">
                    {summary.shortName} rules
                  </a>{' '}
                  come from {rulesDocument(getSection(summary.section.id))}.{' '}
                  {officialNotes.join(' ')}
                  {config.membershipNote ? ` ${config.membershipNote}` : ''}
                </span>
              ) : (
                <span className="block">
                  League membership, the rules quoted under{' '}
                  <a href={`#rules-${summary.id}`} className="text-accent hover:underline">
                    {summary.shortName} rules
                  </a>{' '}
                  and every scheduled league game come from {summary.shortName}&rsquo;s own documents,
                  not from MaxPreps.
                  {isQuotedLeague(config) ? (
                    officialStandingsPdfUrl === null ? (
                      <> {summary.shortName} has not yet posted an official 2026-27 standings PDF; we check for one every run.</>
                    ) : officialStandingsPdfUrl ? (
                      <>
                        {' '}
                        {summary.shortName} has posted a 2026-27 standings PDF:{' '}
                        <ExternalLink href={officialStandingsPdfUrl}>view it</ExternalLink>.
                      </>
                    ) : null
                  ) : null}
                </span>
              )}
              <span className="mt-auto flex flex-wrap gap-2 pt-3">
                {config.links.map((l) => (
                  <ExternalLink key={l.href} href={l.href} className="sx-pill">
                    {l.label}
                  </ExternalLink>
                ))}
                {/* Only a published schedule gets a pill: a 'none' division (EAL) has none. */}
                {config.divisions.map((d) =>
                  d.official.mode === 'none' ? null : (
                    <ExternalLink key={d.id} href={d.official.scheduleUrl} className="sx-pill">
                      {officialSourceLabel(summary.shortName, d.official.source)}
                      {summary.singleDivision ? '' : ` · ${d.label}`}
                    </ExternalLink>
                  ),
                )}
              </span>
            </dd>
          </div>
        ))}
        <div data-region-scope="norcal" className="sx-card flex flex-col p-5 md:col-span-2">
          <dt>
            <span className="block text-lead text-ink">CIF-CCS</span>
            <span className="mt-0.5 block text-meta text-ink-3">Playoff dates &amp; format</span>
          </dt>
          <dd className="m-0 mt-2 flex flex-1 flex-col text-body text-ink-2">
            <span className="block">
              The Central Coast Section publishes the playoff calendar and format for{' '}
              {listWords(field.byLeague.map((l) => l.shortName))}.{' '}
              {ncs?.noChampionshipNote ?? ''} See{' '}
              <a href="#playoffs" className="text-accent hover:underline">
                Postseason
              </a>{' '}
              below.
            </span>
            <span className="mt-auto flex flex-wrap gap-2 pt-3">
              <ExternalLink href={SOURCE_LINKS.ccs} className="sx-pill">
                CCS {SPORT.noun}
              </ExternalLink>
            </span>
          </dd>
        </div>
        {/* One card per section whose league runs an unbracketed tournament (the Northern
            Section: its Guidelines are the EAL's rules and set the Super Regional). */}
        {unbracketedSections.map((section) => {
          const sectionLeagues = unbracketed.filter((l) => l.section.id === section.id);
          const sources = [
            ...new Set(
              sectionLeagues.flatMap((l) => {
                const ps = getLeague(l.id).postseason;
                return ps.kind === 'unbracketed-tournament' ? [ps.sourceUrl] : [];
              }),
            ),
          ];
          return (
            <div key={section.id} data-region-scope={section.region} className="sx-card flex flex-col p-5 md:col-span-2">
              <dt>
                <span className="block text-lead text-ink">CIF {section.name}</span>
                <span className="mt-0.5 block text-meta text-ink-3">Rules &amp; postseason dates</span>
              </dt>
              <dd className="m-0 mt-2 flex flex-1 flex-col text-body text-ink-2">
                <span className="block">
                  The {section.name}&rsquo;s Field Hockey Guidelines set the rules and the postseason for{' '}
                  {listWords(sectionLeagues.map((l) => l.shortName))}. See{' '}
                  <a href="#playoffs" className="text-accent hover:underline">
                    Postseason
                  </a>{' '}
                  below.
                </span>
                <span className="mt-auto flex flex-wrap gap-2 pt-3">
                  <ExternalLink href={section.officialUrl} className="sx-pill">
                    {section.shortName} field hockey
                  </ExternalLink>
                  {sources.map((href) => (
                    <ExternalLink key={href} href={href} className="sx-pill">
                      Field Hockey Guidelines (PDF)
                    </ExternalLink>
                  ))}
                </span>
              </dd>
            </div>
          );
        })}
        {/* One card per Southern California section (DESIGN-socal §2.4): the document its leagues'
            rules come from (`rulesSource`), and its postseason in one sentence from config. */}
        {socalSections.map((section) => {
          const sectionLeagues = leagues.filter((l) => l.section.id === section.id);
          // A group with no table (the LA independents) is under the Section's rules too, but
          // it is no league that could have published rules or a schedule: the sentence says so apart.
          const sectionTabled = sectionLeagues.filter((l) => !isIndependentLeague(l.id));
          const sectionGroups = sectionLeagues.filter((l) => isIndependentLeague(l.id));
          const noDocumentFor =
            sectionGroups.length === 0
              ? sectionLeagues.length === 1
                ? 'it'
                : 'them'
              : listWords(sectionTabled.map(leagueRef));
          return (
            <div key={section.id} data-region-scope={section.region} className="sx-card flex flex-col p-5 md:col-span-2">
              <dt>
                <span className="block text-lead text-ink">CIF {section.name}</span>
                <span className="mt-0.5 block text-meta text-ink-3">Rules &amp; postseason</span>
              </dt>
              <dd className="m-0 mt-2 flex flex-1 flex-col text-body text-ink-2">
                <span className="block">
                  {capitalized(rulesDocument(section))} sets the
                  section&rsquo;s rules for {listWords(sectionLeagues.map(leagueRef))}; we found no league
                  rules, schedule or standings document for {noDocumentFor}
                  {sectionGroups.length > 0 ? ', and the independents play in no league' : ''}.{' '}
                  {section.noChampionshipNote ??
                    `The ${section.name} holds its own field hockey playoffs; see Postseason below.`}
                  {section.id === 'sds'
                    ? ' MaxPreps does not get every one of its playoff games, so a playoff game MaxPreps has no contest or no score for takes the score the Section posts on its bracket sheet, marked † with the words “Score via the CIF San Diego Section”. Where MaxPreps has a final, its score stands.'
                    : ''}
                </span>
                <span className="mt-auto flex flex-wrap gap-2 pt-3">
                  <ExternalLink href={section.officialUrl} className="sx-pill">
                    {section.shortName} field hockey
                  </ExternalLink>
                  {section.id === 'sds' ? (
                    <ExternalLink href={SDS_BRACKET_SHEET_URL} className="sx-pill">
                      {section.shortName} bracket sheet
                    </ExternalLink>
                  ) : null}
                  <ExternalLink href={section.rulesSource.url} className="sx-pill">
                    {`${section.rulesSource.name} (${section.rulesSource.format})`}
                  </ExternalLink>
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-stack max-w-prose text-meta text-ink-2">
        When MaxPreps has never published a result for a game that a league&rsquo;s official
        schedule says was scheduled &mdash; today that is {plural(officialFixtures.length, 'game', 'games')}{' '}
        &mdash; it is listed as scheduled per the league rather than silently dropped.
      </p>
      <p id="history-coverage" className="mt-stack max-w-prose text-meta text-ink-2">
        Last season ({archive.season}): the{' '}
        <Link href="/history/2025-26" prefetch={false} className="text-accent hover:underline">
          {archive.season} archive
        </Link>{' '}
        has final standings and all-league awards for{' '}
        {listWords(archive.available.map((l) => getLeague(l.id).shortName))},{' '}
        {archive.available.length === 1 ? 'from its own documents' : 'each from that league’s own documents'} (
        {archive.sourceDocs.join('; ')}), because MaxPreps only ever serves the current season.
        {archive.unavailableLeagues.length > 0 ? (
          <>
            {' '}
            {listWords(archive.unavailableLeagues.map((l) => getLeague(l.id).shortName))}{' '}
            {archive.unavailableLeagues.length === 1 ? 'is' : 'are'} marked unavailable: we found no official{' '}
            {archive.season} final standings, and we do not fill the gap with standings or awards from third-party
            sites or newspapers.
          </>
        ) : null}
        {/* The independents are this site's grouping (DESIGN §24.10): said apart, not as a gap. */}
        {archive.groupsSentence ? ` ${archive.groupsSentence}` : null}
        {archive.publishedOnly.length > 0 ? (
          <>
            {' '}
            The archive links what {listWords([...archive.publishers.keys()])} did publish officially (
            {listWords(archive.publishedDocs)}), without reproducing it.
          </>
        ) : null}
      </p>
      {/* The hand-researched recruiting pages are field hockey's alone (lib/sports/current.ts). */}
      {HAS_RECRUITING ? (<>
      <p id="clubs-coverage" className="mt-stack max-w-prose text-meta text-ink-2">
        Club field hockey: the{' '}
        <Link href="/clubs" prefetch={false} className="text-accent hover:underline">
          club teams
        </Link>{' '}
        pages list {getClubs().length} youth clubs (the clubs found around these schools, plus any other club
        a player here is tied to) and, for each, the players on these varsity rosters that a public
        page ties to it: the club&rsquo;s own site, a SportsRecruits, NCSA, Hudl or FieldLevel profile, a
        MaxPreps career page, the NFHCA&rsquo;s high school watchlists, MAX Field Hockey&rsquo;s
        club and school pages, or local news such as the Gilroy Dispatch and Stick Together. It was
        researched by hand, each tie checked twice when it was added, and is not part of the
        twice-daily update. Only players already on these rosters are
        named, social media is never used, and recall is partial.
      </p>
      <p id="commits-coverage" className="mt-stack max-w-prose text-meta text-ink-2">
        College commitments: the{' '}
        <Link href="/commits" prefetch={false} className="text-accent hover:underline">
          college commitments
        </Link>{' '}
        page lists the players on these varsity rosters that a public page says have committed to
        play a sport in college, field hockey or any other
        {commitCount > 0 ? ` (${commitCount} found)` : ''}, from
        players&rsquo; recruiting profiles, commitment lists, club and school sites, and local
        news. It was researched by hand with the club pages&rsquo; matching rule, each commitment
        checked twice when it was added, and is not part of the twice-daily update. A social-media post
        counts only from an official college, school or club account, so a commitment announced
        only on a player&rsquo;s own account is not listed, and recall is partial.
      </p>
      </>) : null}
    </section>
  );
}

export default SourcesSection;

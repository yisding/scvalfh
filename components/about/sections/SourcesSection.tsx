import Link from 'next/link';

import { independentsWords } from '../../layout/site';
import { ScopeProse, SourcesProse } from '../../layout/site-prose';
import ExternalLink from '../../ui/ExternalLink';
import SectionHeader from '../../ui/SectionHeader';
import { capitalized } from '../../words/capitalized';
import { listWords, numberWord, plural } from '../../../lib/format';
import { getLeague, getSection, isIndependentLeague } from '../../../lib/leagues';
import { SDS_BRACKET_SHEET_URL } from '../../../lib/league-config/sections';
import { SOURCE_LINKS } from '../../../lib/season';
import { SPORT } from '../../../lib/sports/current';
import { isQuotedLeague, leagueRef, rulesDocument, type AboutSources } from '../about-view';
import { officialSourceLabel } from '../LeagueHealthCard';

/**
 * /about#sources: where the data comes from. Foundation's two paragraphs first (`SourcesProse`,
 * `ScopeProse`: the text the footer used to carry), then a definition list, one row per source:
 * its name and what we take from it, the sentence, and its links. The three feeds (MaxPreps, si.com,
 * cifsshome.org), one row per league (a group of independents, a league with no schedule document
 * and a league with its own documents each say so their own way), the CCS row, a row per section
 * whose league runs an unbracketed tournament and per Southern California section, then the
 * paragraphs on official fixtures and last season's archive (`#history-coverage`). The club and
 * commitment pages are under /about#recruiting.
 */
/** One source: a hairline row; from 768 the name and what we take beside the text and its links. */
const SOURCE = 'border-t border-hairline py-3 md:grid md:grid-cols-[11rem_minmax(0,1fr)] md:gap-x-6';
const WHAT = 'm-0 mt-1 text-body text-ink-2 md:mt-0';
const LINKS = 'mt-1 flex flex-wrap gap-x-6';

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
  } = sources;
  return (
    <section id="sources" data-first="" className="sx-section">
      <SectionHeader kicker="Data sources" />
      <div className="sx-prose">
        <SourcesProse />
        <ScopeProse />
        <p>
          The latest update covers all {counts.teams} teams and {counts.games} games ({counts.leagueGames} of them
          league games): {plural(counts.finals, 'final score')}, {counts.pending} not yet reported.
        </p>
      </div>
      <dl className="m-0 mt-4 max-w-[47rem]">
        <div className={SOURCE}>
          <dt>
            <span className="block text-body font-semibold text-ink">MaxPreps</span>
            <span className="block text-cell text-ink-2">Primary source</span>
          </dt>
          <dd className={WHAT}>
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
            <span className={LINKS}>
              <ExternalLink href={SOURCE_LINKS.maxpreps} className="sx-action whitespace-normal">
                MaxPreps {SPORT.noun}
              </ExternalLink>
            </span>
          </dd>
        </div>
        <div className={SOURCE}>
          <dt>
            <span className="block text-body font-semibold text-ink">High School on SI (si.com)</span>
            <span className="block text-cell text-ink-2">Secondary: checks scores and fills some gaps</span>
          </dt>
          <dd className={WHAT}>
            <span className="block">
              Sports Illustrated&rsquo;s high-school stats site (formerly SBLive) publishes its own
              scoreboard. We compare every final score with it, and publish its score only under
              the fixed rules listed under{' '}
              <a href="#backfills" className="sx-link">
                Scores taken from si.com
              </a>
              . It is never used for league membership, records or the standings order.
            </span>
            <span className={LINKS}>
              <ExternalLink href={SOURCE_LINKS.sblive} className="sx-action whitespace-normal">
                si.com {SPORT.noun}
              </ExternalLink>
            </span>
          </dd>
        </div>
        <div className={SOURCE}>
          <dt>
            <span className="block text-body font-semibold text-ink">cifsshome.org</span>
            <span className="block text-cell text-ink-2">Cross-check only</span>
          </dt>
          <dd className={WHAT}>
            <span className="block">
              The CIF Southern Section&rsquo;s schedule-and-score site, where schools from several
              Sections, ours among them, enter their own schedules and scores. We compare its scores with
              MaxPreps&rsquo; and list every difference in the{' '}
              <a href="#cross-check" className="sx-link">
                cross-check log
              </a>
              . Nothing from it is published as a score, record or standing.
            </span>
            <span className={LINKS}>
              <ExternalLink href={SOURCE_LINKS.cifss} className="sx-action whitespace-normal">
                cifsshome.org scores
              </ExternalLink>
            </span>
          </dd>
        </div>
        {perLeague.map(({ summary, config, noDocument, officialNotes }) => (
          <div key={summary.id} data-region-scope={summary.region} className={SOURCE}>
            <dt>
              <span className="block text-body font-semibold text-ink">
                {isIndependentLeague(summary.id) ? summary.name : summary.shortName}
              </span>
              <span className="block text-cell text-ink-2">{isIndependentLeague(summary.id) ? 'No league' : summary.name}</span>
              <span className="block text-cell text-ink-2">{summary.section.shortName}</span>
            </dt>
            <dd className={WHAT}>
              {isIndependentLeague(summary.id) ? (
                // A group of independents: no league rules and no league documents to quote. Its note says
                // what its table counts; the Section's rules govern their games (overtime, the season's last date).
                <span className="block">
                  {officialNotes.join(' ')} The Southern Section rules that apply to their games, and how the
                  table is ordered, are under{' '}
                  <a href={`#rules-${summary.id}`} className="sx-link">
                    {summary.name}
                  </a>
                  , from {rulesDocument(getSection(summary.section.id))}.
                </span>
              ) : noDocument ? (
                <span className="block">
                  The rules quoted under{' '}
                  <a href={`#rules-${summary.id}`} className="sx-link">
                    {summary.shortName} rules
                  </a>{' '}
                  come from {rulesDocument(getSection(summary.section.id))}.{' '}
                  {officialNotes.join(' ')}
                  {config.membershipNote ? ` ${config.membershipNote}` : ''}
                </span>
              ) : (
                <span className="block">
                  League membership, the rules quoted under{' '}
                  <a href={`#rules-${summary.id}`} className="sx-link">
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
              <span className={LINKS}>
                {config.links.map((l) => (
                  <ExternalLink key={l.href} href={l.href} className="sx-action whitespace-normal">
                    {l.label}
                  </ExternalLink>
                ))}
                {/* Only a published schedule gets a link: a 'none' division (EAL) has none. */}
                {config.divisions.map((d) =>
                  d.official.mode === 'none' ? null : (
                    <ExternalLink key={d.id} href={d.official.scheduleUrl} className="sx-action whitespace-normal">
                      {officialSourceLabel(summary.shortName, d.official.source)}
                      {summary.singleDivision ? '' : `, ${d.label}`}
                    </ExternalLink>
                  ),
                )}
              </span>
            </dd>
          </div>
        ))}
        <div data-region-scope="norcal" className={SOURCE}>
          <dt>
            <span className="block text-body font-semibold text-ink">CIF-CCS</span>
            <span className="block text-cell text-ink-2">Playoff dates &amp; format</span>
          </dt>
          <dd className={WHAT}>
            <span className="block">
              The Central Coast Section publishes the playoff calendar and format for{' '}
              {listWords(field.byLeague.map((l) => l.shortName))}.{' '}
              {ncs?.noChampionshipNote ?? ''} See{' '}
              <a href="#playoffs" className="sx-link">
                Postseason
              </a>{' '}
              below.
            </span>
            <span className={LINKS}>
              <ExternalLink href={SOURCE_LINKS.ccs} className="sx-action whitespace-normal">
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
            <div key={section.id} data-region-scope={section.region} className={SOURCE}>
              <dt>
                <span className="block text-body font-semibold text-ink">CIF {section.name}</span>
                <span className="block text-cell text-ink-2">Rules &amp; postseason dates</span>
              </dt>
              <dd className={WHAT}>
                <span className="block">
                  The {section.name}&rsquo;s Field Hockey Guidelines set the rules and the postseason for{' '}
                  {listWords(sectionLeagues.map((l) => l.shortName))}. See{' '}
                  <a href="#playoffs" className="sx-link">
                    Postseason
                  </a>{' '}
                  below.
                </span>
                <span className={LINKS}>
                  <ExternalLink href={section.officialUrl} className="sx-action whitespace-normal">
                    {section.shortName} field hockey
                  </ExternalLink>
                  {sources.map((href) => (
                    <ExternalLink key={href} href={href} className="sx-action whitespace-normal">
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
            <div key={section.id} data-region-scope={section.region} className={SOURCE}>
              <dt>
                <span className="block text-body font-semibold text-ink">CIF {section.name}</span>
                <span className="block text-cell text-ink-2">Rules &amp; postseason</span>
              </dt>
              <dd className={WHAT}>
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
                <span className={LINKS}>
                  <ExternalLink href={section.officialUrl} className="sx-action whitespace-normal">
                    {section.shortName} field hockey
                  </ExternalLink>
                  {section.id === 'sds' ? (
                    <ExternalLink href={SDS_BRACKET_SHEET_URL} className="sx-action whitespace-normal">
                      {section.shortName} bracket sheet
                    </ExternalLink>
                  ) : null}
                  <ExternalLink href={section.rulesSource.url} className="sx-action whitespace-normal">
                    {`${section.rulesSource.name} (${section.rulesSource.format})`}
                  </ExternalLink>
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
      <div className="sx-prose mt-4">
      <p>
        When MaxPreps has never published a result for a game that a league&rsquo;s official
        schedule says was scheduled &mdash; today that is {plural(officialFixtures.length, 'game', 'games')}{' '}
        &mdash; it is listed as scheduled per the league rather than silently dropped.
      </p>
      <p id="history-coverage">
        Last season ({archive.season}): the{' '}
        <Link href="/history/2025-26" prefetch={false}>
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
      </div>
    </section>
  );
}

export default SourcesSection;

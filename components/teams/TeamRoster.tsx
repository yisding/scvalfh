import Link from 'next/link';

import { listWords } from '../../lib/format';
import EmptyState from '../ui/EmptyState';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import Tag from '../ui/Tag';
import type { RosterFact, RosterRow, RosterView } from './roster-view';

/**
 * The team page's roster (SPEC §1.1j): every varsity player MaxPreps lists, with whatever number,
 * grade, position and height somebody published.
 *
 * A list, not a table: a five-column table cannot reflow at 320px / 400% zoom without a scroller
 * (DESIGN §10.8), and for many of the programs most columns would be empty. Each row is
 * the number (when the team publishes numbers at all), the name, and one meta line holding only
 * the facts that exist — a blank is never printed as a guess or a placeholder.
 *
 * The rows sit in one card with divider rules, in a row-major grid like the all-league lists on
 * /history (components/about/AwardsBlock.tsx): one column on a phone, two from 640px, three from
 * 1024px, where the section spans both page columns. A grid row's cells share one height, so the
 * rules run straight across. Reading order is DOM order: left to right, then down.
 *
 * Provenance is visible, not buried: a value that did not come from MaxPreps carries a † that the
 * footnote explains and the Sources row links; where a source disagrees with what is shown, the
 * disagreement is listed with a link to it.
 *
 * A player with a recruiting page of their own (NCSA and the like) gets a line of links under the
 * facts — its own line, so a link never dangles off the end of a wrapped fact line. Alone on its
 * line, a link is not inline text, so it carries the 24px `sx-action` box (WCAG 2.5.8). Each link's
 * accessible name leads with the player's name, so a screen reader's links list tells them apart.
 *
 * A player a public page ties to a youth club gets a club line (DESIGN §17.4) between the facts and
 * the profile links: "Club: SF Hawks", "Club: NorCal Impact · Earlier clubs: Fly FHC, Lightning",
 * "Listed club: Fly FHC" for a club a source names with no date that makes it current. It answers
 * "where does she play" next to the facts and keeps the off-site links as the row's last line. It
 * is its own line for the same reason the profiles are, so it never dangles. Its links are
 * internal, to the club's page on this site, which cites a source for every tie: no arrow, the
 * `sx-action` box, and an accessible name that leads with the player ("Storey Lewis’s club: SF
 * Hawks"), the visible label hidden from assistive technology so it is not read twice. The words
 * are components/clubs/club-view.ts', shared with the club pages. A footnote explains the line, and
 * says recall is partial, wherever one appears.
 *
 * A player a public page says has committed to play college field hockey gets a commitment line
 * (DESIGN §21.5) right under the facts, above any club line: "Committed: Stanford", or "Signed:
 * Stanford" only where a source says so. It is the same kind of line as the club line — its own
 * line, an internal link with the `sx-action` box and no arrow, the visible label hidden from
 * assistive technology and the link's accessible name leading with the player ("Pat Example’s
 * college commitment: Stanford") — and it links the player's row on /commits, which cites the
 * sources. The words are components/commits/commit-view.ts'. A footnote explains it, links
 * /commits and says recall is partial, wherever one appears.
 *
 * A team with no list still shows the coaches and sources the enrichment file found for it, under
 * the empty state, and the empty state says only what the file records about other sources.
 */

/** "†" for sighted readers; a short spoken note instead of the glyph for a screen reader. */
function ElsewhereMark() {
  return (
    <>
      <span aria-hidden="true" className="text-ink-3">
        &dagger;
      </span>
      <span className="sr-only"> (other source)</span>
    </>
  );
}

function Facts({ facts }: { facts: RosterFact[] }) {
  return (
    <span className="block text-meta text-ink-2">
      {facts.map((fact, i) => (
        <span key={i}>
          {/* A no-break space BEFORE each dot, so a narrow column breaks after a dot and never
              starts a line with one (the AwardsBlock rule). */}
          {i > 0 ? <>&nbsp;&middot; </> : null}
          <span className="whitespace-nowrap">
            {fact.text}
            {fact.elsewhere ? <ElsewhereMark /> : null}
          </span>
        </span>
      ))}
    </span>
  );
}

function Profiles({ row }: { row: RosterRow }) {
  return (
    <span className="block text-meta text-ink-2">
      {row.profiles.map((profile, i) => (
        <span key={profile.url}>
          {i > 0 ? <>&nbsp;&middot; </> : null}
          <ExternalLink href={profile.url} className="sx-action gap-1 whitespace-nowrap">
            {/* Wrapped: `.sx-action` is inline-flex, which would trim the space after the sr-only
                name if it and the label were separate flex items ("Storey Lewis'sNCSA profile"). */}
            <span>
              <span className="sr-only">{row.name}&rsquo;s </span>
              {profile.label}
            </span>
          </ExternalLink>
        </span>
      ))}
    </span>
  );
}

function Clubs({ row }: { row: RosterRow }) {
  return (
    <span className="block text-meta text-ink-2">
      {row.clubs.map((group, i) => (
        <span key={group.status}>
          {i > 0 ? <>&nbsp;&middot; </> : null}
          {/* Hidden from assistive technology: each link below says it in its own name. The no-break
              space keeps the label with its first club. */}
          <span aria-hidden="true" className="text-ink-3">
            {group.label}:
          </span>
          &nbsp;
          {group.clubs.map((club, j) => (
            <span key={club.slug}>
              {j > 0 ? ', ' : null}
              {/* `prefetch={false}`: a link per row, to a static page (tests/ui/prefetch-policy). */}
              <Link
                href={club.href}
                prefetch={false}
                className="sx-action whitespace-nowrap text-accent hover:underline"
              >
                {/* One span, so inline-flex cannot trim the space after the sr-only name. */}
                <span>
                  <span className="sr-only">
                    {row.name}&rsquo;s {group.srLabel}:{' '}
                  </span>
                  {club.name}
                </span>
              </Link>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

function Commitment({ row }: { row: RosterRow }) {
  const line = row.commitment!;
  return (
    <span className="block text-meta text-ink-2">
      {/* Hidden from assistive technology: the link says it in its own name. The no-break space
          keeps the label with the college. */}
      <span aria-hidden="true" className="text-ink-3">
        {line.label}:
      </span>
      &nbsp;
      {/* `prefetch={false}`: a link per row, to a static page (tests/ui/prefetch-policy). */}
      {/* Not nowrap, unlike a club name: a college without a short name shows its official one
          ("University of North Carolina at Chapel Hill"), which must wrap at 320px. */}
      <Link href={line.college.href} prefetch={false} className="sx-action text-accent hover:underline">
        {/* One span, so inline-flex cannot trim the space after the sr-only name. */}
        <span>
          <span className="sr-only">
            {row.name}&rsquo;s {line.srLabel}:{' '}
          </span>
          {line.college.name}
        </span>
      </Link>
    </span>
  );
}

function Coaches({ view }: { view: RosterView }) {
  if (view.coaches.length === 0) return null;
  return (
    <div className="mt-6">
      <SectionHeader as="h3" size="label" kicker="Coaches" />
      <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
        {view.coaches.map((coach) => (
          <li key={coach.key} className="min-w-0">
            <span className="block text-body text-ink">{coach.name}</span>
            {coach.role ? <span className="block text-meta text-ink-3">{coach.role}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Sources({ view }: { view: RosterView }) {
  if (view.sources.length === 0) return null;
  return (
    <div className="mt-6">
      <SectionHeader as="h3" size="label" kicker="Sources" />
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {view.sources.map((s) => (
          <li key={s.url}>
            <ExternalLink href={s.url} className="sx-pill">
              {s.label}
            </ExternalLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The empty state's second sentence for a team MaxPreps lists nobody for: what the file records. */
function OtherRostersText({ view }: { view: RosterView }) {
  const other = view.otherRosters;
  if (other.status === 'none') return <>No other public source we checked has a current roster either.</>;
  if (other.status === 'partial') {
    return (
      <>
        {other.summary} <ExternalLink href={other.source}>See that list</ExternalLink>.
      </>
    );
  }
  return <>We have not checked other public sources for this team.</>;
}

export function TeamRoster({ view }: { view: RosterView }) {
  const { rows, showNumbers, teamName } = view;

  if (view.status === 'error' || view.status === 'pending' || rows.length === 0) {
    const action = view.rosterUrl
      ? { href: view.rosterUrl, label: 'Check MaxPreps', external: true }
      : undefined;
    // Coaches and the sources come from the enrichment file, not the MaxPreps list, so a team
    // with no list still shows them (each renders nothing when it has nothing).
    return (
      <div>
        <EmptyState
          heading={
            view.status === 'error'
              ? `${teamName}'s roster could not be read.`
              : view.status === 'pending'
                ? `${teamName}'s roster has not been collected yet.`
                : `MaxPreps lists no players for ${teamName}.`
          }
          action={action}
        >
          {view.status === 'error' ? (
            'The last roster update failed and there was no earlier list to fall back on.'
          ) : view.status === 'pending' ? (
            'No roster update has covered this team yet. It will appear once a run collects it.'
          ) : (
            <OtherRostersText view={view} />
          )}
        </EmptyState>
        <Coaches view={view} />
        <Sources view={view} />
      </div>
    );
  }

  const hasCaptain = rows.some((r) => r.captain);

  return (
    <div>
      <ul className="sx-card sx-flush sx-bleed m-0 grid list-none p-0 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <li
            key={row.key}
            // A rule on top of every row except the first in each column: one row in a single
            // column, the first two from 640px, the first three from 1024px.
            className="flex min-w-0 items-baseline gap-3 border-t border-divider px-gutter py-2.5 first:border-t-0 sm:px-4 sm:[&:nth-child(2)]:border-t-0 lg:[&:nth-child(3)]:border-t-0"
          >
            {showNumbers ? (
              // Two digits (and a †) fit 2rem; Valley Christian's "21/88" needs the wider column.
              <span
                className={`sx-num ${view.numberChars > 3 ? 'w-11' : 'w-8'} shrink-0 text-right text-meta font-semibold text-ink-2`}
              >
                {row.jersey ? (
                  <>
                    <span className="sr-only">Number </span>
                    {row.jersey.text}
                    {row.jersey.elsewhere ? <ElsewhereMark /> : null}
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">&mdash;</span>
                    <span className="sr-only">No number listed</span>
                  </>
                )}
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block text-body text-ink">
                {row.name}
                {row.captain ? (
                  <>
                    {' '}
                    <Tag label="captain" className="relative -top-px ml-1">
                      C
                    </Tag>
                  </>
                ) : null}
              </span>
              {row.facts.length > 0 ? <Facts facts={row.facts} /> : null}
              {row.commitment ? <Commitment row={row} /> : null}
              {row.clubs.length > 0 ? <Clubs row={row} /> : null}
              {row.profiles.length > 0 ? <Profiles row={row} /> : null}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 max-w-prose text-meta text-ink-3">
        <p className="m-0">
          What the coach entered on MaxPreps
          {view.asOf ? ` as of ${view.asOf}` : ''}. Anything nobody published is left blank, never
          guessed.
          {hasCaptain ? (
            <>
              {' '}
              <Tag className="relative -top-px">C</Tag> marks a captain.
            </>
          ) : null}
        </p>
        {view.hasElsewhere ? (
          <p className="mt-1 mb-0">
            <span aria-hidden="true">&dagger;</span> From another public source
            {view.elsewhereSources.length > 0 ? <> ({listWords(view.elsewhereSources)})</> : null} where
            MaxPreps has it blank; each source is linked under Sources.
            {view.hasDerivedGrade
              ? ' A few grades are worked out from a class year listed for an earlier season.'
              : ''}
          </p>
        ) : null}
        {view.profilePlatforms.length > 0 ? (
          <p className="mt-1 mb-0">
            Profile links go to players&rsquo; own recruiting pages on{' '}
            {listWords(view.profilePlatforms)}, each matched to a player here by name, sport, and
            school or class year.
          </p>
        ) : null}
        {view.hasCommitments ? (
          <p className="mt-1 mb-0">
            Commitment lines link to the player&rsquo;s entry on the{' '}
            <Link href="/commits" prefetch={false} className="text-accent hover:underline">
              college commitments
            </Link>{' '}
            page, which cites a source for each one; &ldquo;Signed&rdquo; appears only where a source
            says so. They were checked by hand on {view.commitsCheckedOn} and are not part of the
            twice-daily update. Recall is partial: a player with no commitment line may still have
            committed.
          </p>
        ) : null}
        {view.hasClubs ? (
          <p className="mt-1 mb-0">
            Club lines link to the club&rsquo;s page on this site, which cites a source for each
            player it lists.
            {view.hasListedClub
              ? ' A “listed club” is one a source names without saying whether the player is still with it.'
              : ''}{' '}
            Recall is partial: a player with no club line may still play for a club.
          </p>
        ) : null}
        {view.jvLeftOut > 0 ? (
          <p className="mt-1 mb-0">
            MaxPreps lists {teamName}&rsquo;s whole program on one page; the{' '}
            {view.jvLeftOut} players the school lists as JV are not shown.
          </p>
        ) : null}
        {view.status === 'carried-forward' ? (
          <p className="mt-1 mb-0 text-ink-2">
            The latest roster update could not read MaxPreps, so this is the list as it stood
            {view.asOf ? ` on ${view.asOf}` : ' before that'}.
          </p>
        ) : null}
      </div>

      <Coaches view={view} />

      {view.conflicts.length > 0 ? (
        <div className="mt-6">
          <SectionHeader as="h3" size="label" kicker="Where sources disagree" />
          <ul className="m-0 flex max-w-prose list-none flex-col gap-1 p-0 text-meta text-ink-2">
            {view.conflicts.map((c) => (
              <li key={c.key}>
                <span className="text-ink">{c.name}</span>: {c.field}{' '}
                {c.shown === null ? 'not listed here' : `${c.shown} here`}, {c.other}
                {c.derived ? ', worked out from ' : ' on '}
                <ExternalLink href={c.sourceUrl}>{c.sourceLabel}</ExternalLink>
                {c.now ? `, so ${c.now} now` : ''}.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Sources view={view} />
    </div>
  );
}

export default TeamRoster;

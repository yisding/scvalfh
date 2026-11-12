import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';
import { MissingValue } from '../ui/MissingValue';
import type { RosterFact, RosterRow, RosterView } from './roster-view';

/**
 * The team page's roster (SPEC §1.1j): every varsity player MaxPreps lists, with whatever number,
 * grade, position and height somebody published.
 *
 * A list, not a table (DESIGN §33): a five-column table cannot reflow at 320px without a scroller,
 * and for many programs most columns would be empty. Each item is the number (when the team
 * publishes numbers at all), the name, and one line holding only the facts that exist, each its
 * own element; a blank is never printed as a guess or a placeholder. The items sit in `sx-auto`
 * columns with a hairline under each: one column on a phone, two in the team page's main column.
 * Reading order is DOM order: left to right, then down.
 *
 * Provenance is visible: a value that did not come from MaxPreps carries a † that the ONE legend
 * line under the list explains and the Sources row links; where a source disagrees with what is
 * shown, the disagreement is listed with a link to it. How clubs, commitments and profile links are
 * collected is said once, on /about.
 *
 * A player with a recruiting page of their own gets a line of links under the facts; a player a
 * public page says has committed to a college gets a commitment line linking their row on /commits;
 * a player a public page ties to a club gets a club line linking /clubs/<slug>. Each link's
 * accessible name starts with the player's name (sr-only), so a links list does not read "NCSA
 * profile" eleven times. The three lines are shared with /recruiting.
 */
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
    <span className="flex flex-wrap gap-x-3 text-cell text-ink-2">
      {facts.map((fact, i) => (
        <span key={i} className="whitespace-nowrap">
          {fact.text}
          {fact.elsewhere ? <ElsewhereMark /> : null}
        </span>
      ))}
    </span>
  );
}

/**
 * The three recruiting lines of a row: shared with /recruiting (components/recruiting/RecruitingList.tsx),
 * which shows the same rows of every school's roster, so the two pages say the same thing.
 */
export type RecruitingLineRow = Pick<RosterRow, 'name' | 'commitment' | 'clubs' | 'profiles'>;

export function Profiles({ row }: { row: Pick<RecruitingLineRow, 'name' | 'profiles'> }) {
  return (
    <span className="flex flex-wrap gap-x-4 text-cell text-ink-2">
      {row.profiles.map((profile) => (
        <ExternalLink key={profile.url} href={profile.url} className="sx-action whitespace-nowrap">
          {/* Wrapped: `.sx-action` is inline-flex, which would trim the space after the sr-only
              name if it and the label were separate flex items ("Storey Lewis'sNCSA profile"). */}
          <span>
            <span className="sr-only">{row.name}&rsquo;s </span>
            {profile.label}
          </span>
        </ExternalLink>
      ))}
    </span>
  );
}

export function Clubs({ row }: { row: RecruitingLineRow }) {
  return (
    <span className="block text-cell text-ink-2">
      {row.clubs.map((group, i) => (
        <span key={group.status}>
          {i > 0 ? ' ' : null}
          {/* Hidden from assistive technology: each link below says it in its own name. The no-break
              space keeps the label with its first club. */}
          <span aria-hidden="true" className="text-ink-3">
            {group.label}:
          </span>
          &nbsp;
          {group.clubs.map((club, j) => (
            <span key={club.slug}>
              {j > 0 ? ' ' : null}
              {/* The comma, or the dot before the next group, inside the link's nowrap span: the
                  link is inline-flex, an atomic inline, so a line could otherwise start with it. */}
              <span className="whitespace-nowrap">
                {/* `prefetch={false}`: a link per row, to a static page (tests/ui/prefetch-policy). */}
                <Link
                  href={club.href}
                  prefetch={false}
                  className="sx-action whitespace-nowrap"
                >
                  {/* One span, so inline-flex cannot trim the space after the sr-only name. */}
                  <span>
                    <span className="sr-only">
                      {row.name}&rsquo;s {group.srLabel}:{' '}
                    </span>
                    {club.name}
                  </span>
                </Link>
                {j < group.clubs.length - 1 ? ',' : i < row.clubs.length - 1 ? <>&nbsp;&middot;</> : null}
              </span>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

export function Commitment({ row }: { row: RecruitingLineRow }) {
  const line = row.commitment!;
  return (
    <span className="block text-cell text-ink-2">
      {/* Hidden from assistive technology: the link says it in its own name. The no-break space
          keeps the label with the college. */}
      <span aria-hidden="true" className="text-ink-3">
        {line.label}:
      </span>
      &nbsp;
      {/* `prefetch={false}`: a link per row, to a static page (tests/ui/prefetch-policy). */}
      {/* Not nowrap, unlike a club name: a college without a short name shows its official one
          ("University of North Carolina at Chapel Hill"), which must wrap at 320px. */}
      <Link href={line.college.href} prefetch={false} className="sx-action">
        {/* One span, so inline-flex cannot trim the space after the sr-only name. */}
        <span>
          <span className="sr-only">
            {row.name}&rsquo;s {line.srLabel}:{' '}
          </span>
          {line.college.name}
          {/* Another sport is named after the college; field hockey goes without saying here. */}
          {line.sport ? <span aria-hidden="true"> ({line.sport})</span> : null}
        </span>
      </Link>
    </span>
  );
}

function Coaches({ view }: { view: RosterView }) {
  if (view.coaches.length === 0) return null;
  return (
    <div className="mt-6">
      <h3 className="m-0 mb-1 text-lead text-ink">Coaches</h3>
      <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
        {view.coaches.map((coach) => (
          <li key={coach.key} className="min-w-0">
            <span className="block text-body text-ink">{coach.name}</span>
            {coach.role ? <span className="block text-cell text-ink-2">{coach.role}</span> : null}
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
      <h3 className="m-0 text-lead text-ink">Sources</h3>
      <ul className="sx-linkrow mt-0">
        {view.sources.map((s) => (
          <li key={s.url}>
            <ExternalLink href={s.url} className="sx-action">
              {s.label}
            </ExternalLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What the file records about other rosters, for a team MaxPreps lists nobody for. */
function OtherRostersText({ view }: { view: RosterView }) {
  const other = view.otherRosters;
  if (other.status === 'none') return <>No other public source we checked has a current roster either.</>;
  if (other.status === 'partial') {
    return (
      <>
        {other.summary}{' '}
        <ExternalLink href={other.source} className="sx-link">
          See that list
        </ExternalLink>
      </>
    );
  }
  return <>We have not checked other public sources for this team.</>;
}

export interface TeamRosterProps {
  view: RosterView;
}

export function TeamRoster({ view }: TeamRosterProps) {
  const { rows, showNumbers, teamName } = view;

  if (view.status === 'error' || view.status === 'pending' || rows.length === 0) {
    // Coaches and the sources come from the enrichment file, not the MaxPreps list, so a team
    // with no list still shows them (each renders nothing when it has nothing).
    return (
      <div>
        <p className="sx-empty">
          {view.status === 'error'
            ? `${teamName}'s roster could not be read.`
            : view.status === 'pending'
              ? `${teamName}'s roster has not been collected yet. It will appear once a run collects it.`
              : `MaxPreps lists no players for ${teamName}.`}
          {view.rosterUrl ? (
            <>
              {' '}
              <ExternalLink href={view.rosterUrl} className="sx-link">
                Check MaxPreps
              </ExternalLink>
            </>
          ) : null}
        </p>
        {view.status !== 'error' && view.status !== 'pending' ? (
          <p className="sx-note mt-0">
            <OtherRostersText view={view} />
          </p>
        ) : null}
        <Coaches view={view} />
        <Sources view={view} />
      </div>
    );
  }

  const hasCaptain = rows.some((r) => r.captain);
  // Two digits (and a †) fit 2rem; Valley Christian's "21/88" needs the wider column.
  const numberWidth = view.numberChars > 3 ? 'w-11' : 'w-8';

  return (
    <div>
      <ul className="sx-auto m-0 list-none p-0">
        {rows.map((row) => (
          <li key={row.key} className="flex min-w-0 items-baseline gap-3 border-b border-hairline py-1.5">
            {showNumbers ? (
              <span className={['sx-num shrink-0 text-right text-body text-ink-2', numberWidth].join(' ')}>
                {row.jersey ? (
                  <>
                    <span className="sr-only">Number </span>
                    {row.jersey.text}
                    {row.jersey.elsewhere ? <ElsewhereMark /> : null}
                  </>
                ) : (
                  <MissingValue words="No number listed" />
                )}
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block text-body font-medium text-ink">
                {row.name}
                {row.captain ? (
                  <>
                    {' '}
                    <span className="text-cell font-semibold text-ink-2">
                      <span aria-hidden="true">C</span>
                      <span className="sr-only">captain</span>
                    </span>
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

      {/* ONE legend line: where the list comes from and what its two marks mean. */}
      <p className="sx-note">
        From MaxPreps{view.asOf ? `, as of ${view.asOf}` : ''}.{hasCaptain ? ' C: captain.' : ''}
        {view.hasElsewhere ? (
          <>
            {' '}
            <span aria-hidden="true">&dagger;</span>: from another public source, linked under Sources.
          </>
        ) : null}
        {view.jvLeftOut > 0 ? ` The ${view.jvLeftOut} players the school lists as JV are not shown.` : ''}
        {view.status === 'carried-forward' ? ' The latest roster update could not read MaxPreps.' : ''}
      </p>
      {view.recruitingHref ? (
        <ul className="sx-linkrow">
          <li>
            <Link href={view.recruitingHref} prefetch={false} className="sx-action">
              Recruiting
            </Link>
          </li>
        </ul>
      ) : null}

      <Coaches view={view} />

      {view.conflicts.length > 0 ? (
        <div className="mt-6">
          <h3 className="m-0 mb-1 text-lead text-ink">Where sources disagree</h3>
          <ul className="m-0 flex max-w-prose list-none flex-col gap-1 p-0 text-cell text-ink-2">
            {view.conflicts.map((c) => (
              <li key={c.key}>
                <span className="text-ink">{c.name}</span>: {c.field}{' '}
                {c.shown === null ? 'not listed here' : `${c.shown} here`}, {c.other}
                {c.derived ? ', worked out from ' : ' on '}
                <ExternalLink href={c.sourceUrl} className="sx-link">
                  {c.sourceLabel}
                </ExternalLink>
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

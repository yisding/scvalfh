import EmptyState from '../ui/EmptyState';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import Tag from '../ui/Tag';
import type { RosterRow, RosterView } from './roster-view';

/**
 * The team page's roster (SPEC §1.1j): every varsity player MaxPreps lists, with whatever number,
 * grade, position and height somebody published.
 *
 * A list, not a table: a five-column table cannot reflow at 320px / 400% zoom without a scroller
 * (DESIGN §10.8), and for seven of the fifteen programs most columns would be empty. Each row is
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
 * A player with a recruiting page of their own (NCSA and the like) gets a link at the end of the
 * meta line, after the facts. Its accessible name leads with the player's name, so a screen
 * reader's links list tells the rows apart.
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

/** The meta line: the row's facts, then its profile links, one dot-separated run. */
function Meta({ row }: { row: RosterRow }) {
  const items = [
    ...row.facts.map((fact) => (
      <span key={fact.text} className="whitespace-nowrap">
        {fact.text}
        {fact.elsewhere ? <ElsewhereMark /> : null}
      </span>
    )),
    ...row.profiles.map((profile) => (
      <ExternalLink key={profile.url} href={profile.url} className="whitespace-nowrap">
        <span className="sr-only">{row.name}&rsquo;s </span>
        {profile.label}
      </ExternalLink>
    )),
  ];
  return (
    <span className="block text-meta text-ink-2">
      {items.map((item, i) => (
        <span key={i}>
          {/* A no-break space BEFORE each dot, so a narrow column breaks after a dot and never
              starts a line with one (the AwardsBlock rule). */}
          {i > 0 ? <>&nbsp;&middot; </> : null}
          {item}
        </span>
      ))}
    </span>
  );
}

/** "NCSA", "NCSA and SportsRecruits", "NCSA, Hudl and SportsRecruits". */
function listWords(words: string[]): string {
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

export function TeamRoster({ view }: { view: RosterView }) {
  const { rows, showNumbers, teamName } = view;

  if (view.status === 'error' || rows.length === 0) {
    const action = view.rosterUrl
      ? { href: view.rosterUrl, label: 'Check MaxPreps', external: true }
      : undefined;
    return (
      <EmptyState
        heading={
          view.status === 'error'
            ? `${teamName}'s roster could not be read.`
            : `MaxPreps lists no players for ${teamName}.`
        }
        action={action}
      >
        {view.status === 'error'
          ? 'The last roster update failed and there was no earlier list to fall back on.'
          : 'No other public source we checked has a current roster either.'}
      </EmptyState>
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
              {row.facts.length > 0 || row.profiles.length > 0 ? <Meta row={row} /> : null}
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
            <span aria-hidden="true">&dagger;</span> From another public source &mdash; the
            school&rsquo;s athletics site, a school paper, or MaxPreps&rsquo; JV and career pages
            &mdash; where MaxPreps has it blank.
            {view.hasDerivedGrade
              ? ' A few grades are worked out from a class year listed for an earlier season.'
              : ''}
          </p>
        ) : null}
        {view.profilePlatforms.length > 0 ? (
          <p className="mt-1 mb-0">
            Profile links go to players&rsquo; own recruiting pages on{' '}
            {listWords(view.profilePlatforms)}, matched to this list by name, school and sport, and
            by class year where the page gives one.
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

      {view.coaches.length > 0 ? (
        <div className="mt-6">
          <SectionHeader as="h3" size="label" kicker="Coaches" />
          <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
            {view.coaches.map((coach) => (
              <li key={coach.key} className="min-w-0">
                <span className="block text-body text-ink">{coach.name}</span>
                {coach.role ? (
                  <span className="block text-meta text-ink-3">{coach.role}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view.conflicts.length > 0 ? (
        <div className="mt-6">
          <SectionHeader as="h3" size="label" kicker="Where sources disagree" />
          <ul className="m-0 flex max-w-prose list-none flex-col gap-1 p-0 text-meta text-ink-2">
            {view.conflicts.map((c) => (
              <li key={c.key}>
                <span className="text-ink">{c.name}</span>: {c.field}{' '}
                {c.shown === null ? 'not listed here' : `${c.shown} here`}, {c.other} on{' '}
                <ExternalLink href={c.sourceUrl}>{c.sourceLabel}</ExternalLink>.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view.sources.length > 0 ? (
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
      ) : null}
    </div>
  );
}

export default TeamRoster;

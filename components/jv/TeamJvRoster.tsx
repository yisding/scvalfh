import ExternalLink from '../ui/ExternalLink';
import GridRowFiller from '../ui/GridRowFiller';
import { MissingValue } from '../ui/MissingValue';
import Tag from '../ui/Tag';
import type { TeamJvRosterView } from './jv-roster-view';

/**
 * A team page's JV roster: the varsity roster's list (components/teams/TeamRoster.tsx: one card of
 * grid cells, number, name and one line of the facts that exist, a blank never printed as a guess),
 * with none of its recruiting lines, which are for the varsity rosters. The footnote names the source
 * and when it was read, and the pill links it. A player on the varsity roster above is not repeated
 * (lib/jv/jv-rosters.ts): the footnote counts them, and a list that is all varsity players says so in
 * place of the grid. Only a school some source lists JV players for gets this section
 * (components/jv/jv-roster-view.ts returns null otherwise).
 */
export function TeamJvRoster({ view }: { view: TeamJvRosterView }) {
  const { rows, showNumbers } = view;
  const hasCaptain = rows.some((r) => r.captain);
  const sourceName = view.source === 'maxpreps' ? 'MaxPreps’ JV roster' : `${view.teamName}’s JV list on ${view.sourceLabel}`;
  const pill = (
    <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
      <li>
        <ExternalLink href={view.sourceUrl} className="sx-pill sx-pill-ring">
          {view.source === 'maxpreps' ? 'MaxPreps JV roster' : `${view.sourceLabel} JV roster`}
        </ExternalLink>
      </li>
    </ul>
  );
  if (rows.length === 0) {
    return (
      <div>
        <p className="m-0 max-w-prose text-body text-ink-2">
          Every player on {sourceName} is on the varsity roster above, so none is repeated here.
        </p>
        {pill}
      </div>
    );
  }
  return (
    <div>
      <ul className="sx-card sx-flush sx-bleed my-0 grid list-none p-0 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <li key={row.key} className="sx-gridcell flex items-baseline gap-3">
            {showNumbers ? (
              <span
                className={`sx-num ${view.numberChars > 3 ? 'w-11' : 'w-8'} shrink-0 text-right text-meta font-semibold text-ink-2`}
              >
                {row.jersey ? (
                  <>
                    <span className="sr-only">Number </span>
                    {row.jersey}
                  </>
                ) : (
                  <MissingValue words="No number listed" />
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
              {row.facts.length > 0 ? (
                <span className="block text-meta text-ink-2">
                  {row.facts.map((fact, i) => (
                    <span key={i}>
                      {i > 0 ? <>&nbsp;&middot; </> : null}
                      <span className="whitespace-nowrap">{fact}</span>
                    </span>
                  ))}
                </span>
              ) : null}
            </span>
          </li>
        ))}
        <GridRowFiller count={rows.length} columns={{ sm: 2, lg: 3 }} />
      </ul>

      <div className="mt-3 max-w-prose text-meta text-ink-3">
        <p className="m-0">
          {view.source === 'maxpreps' ? (
            <>What the coach entered on MaxPreps&rsquo; JV roster as of {view.asOf}.</>
          ) : (
            <>
              {view.teamName}&rsquo;s own JV list on {view.sourceLabel}, as read {view.asOf}.
            </>
          )}{' '}
          Anything the source leaves blank is left blank, never guessed.
          {hasCaptain ? (
            <>
              {' '}
              <Tag className="relative -top-px">C</Tag> marks a captain.
            </>
          ) : null}
        </p>
        {view.other ? (
          <p className="mt-1 mb-0">
            The other list we found,{' '}
            <ExternalLink href={view.other.url}>{view.other.words}</ExternalLink>, has{' '}
            {view.other.count === 0
              ? 'no JV player who is not on the varsity roster'
              : view.other.count === 1
                ? 'one'
                : String(view.other.count)}
            ; the fuller list is shown.
          </p>
        ) : null}
        {view.onVarsity > 0 ? (
          <p className="mt-1 mb-0">
            {view.onVarsity === 1 ? 'One more player' : `${view.onVarsity} more players`} on {sourceName}{' '}
            {view.onVarsity === 1 ? 'is' : 'are'} on the varsity roster above and{' '}
            {view.onVarsity === 1 ? 'is' : 'are'} not repeated here.
          </p>
        ) : null}
      </div>
      {pill}
    </div>
  );
}

export default TeamJvRoster;

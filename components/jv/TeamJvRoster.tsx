import { listWords } from '../../lib/format';
import { Profiles } from '../teams/TeamRoster';
import ExternalLink from '../ui/ExternalLink';
import { MissingValue } from '../ui/MissingValue';
import type { TeamJvRosterView } from './jv-roster-view';

/**
 * A team page's JV roster: the varsity roster's list (components/teams/TeamRoster.tsx: the same
 * `sx-auto` columns of hairline rows, number, name and one line of the facts that exist, a blank never printed as a guess).
 * Of its recruiting lines only the profile links appear (the same Profiles line, data/jv-profiles.json):
 * commitments and clubs are for the varsity rosters. The footnote names the source
 * and when it was read, and a link under it goes there. A player on the varsity roster above is not repeated
 * (lib/jv/jv-rosters.ts): the footnote counts them, and a list that is all varsity players says so in
 * place of the grid. Only a school some source lists JV players for gets this section
 * (components/jv/jv-roster-view.ts returns null otherwise).
 */
export function TeamJvRoster({ view }: { view: TeamJvRosterView }) {
  const { rows, showNumbers } = view;
  const hasCaptain = rows.some((r) => r.captain);
  const sourceName = view.source === 'maxpreps' ? 'MaxPreps’ JV roster' : `${view.teamName}’s JV list on ${view.sourceLabel}`;
  const pill = (
    <ul className="sx-linkrow">
      <li>
        <ExternalLink href={view.sourceUrl} className="sx-action">
          {view.source === 'maxpreps' ? 'MaxPreps JV roster' : `${view.sourceLabel} JV roster`}
        </ExternalLink>
      </li>
    </ul>
  );
  if (rows.length === 0) {
    return (
      <div>
        <p className="sx-empty">
          Every player on {sourceName} is on the varsity roster above, so none is repeated here.
        </p>
        {pill}
      </div>
    );
  }
  return (
    <div>
      <ul className="sx-auto m-0 list-none p-0">
        {rows.map((row) => (
          <li key={row.key} className="flex min-w-0 items-baseline gap-3 border-b border-hairline py-1.5">
            {showNumbers ? (
              <span className={['sx-num shrink-0 text-right text-body text-ink-2', view.numberChars > 3 ? 'w-11' : 'w-8'].join(' ')}>
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
              {row.facts.length > 0 ? (
                <span className="block text-meta text-ink-2">
                  {row.facts.map((fact, i) => (
                    <span key={i}>
                      {i > 0 ? ', ' : null}
                      <span className="whitespace-nowrap">{fact}</span>
                    </span>
                  ))}
                </span>
              ) : null}
              {row.profiles.length > 0 ? <Profiles row={row} /> : null}
            </span>
          </li>
        ))}
      </ul>

      <div className="sx-note">
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
              C: captain.
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
        {view.profilePlatforms.length > 0 ? (
          <p className="mt-1 mb-0">
            Profile links go to JV players&rsquo; own recruiting pages on {listWords(view.profilePlatforms)},
            each matched to a player here by name, sport, and school or class year. They were looked for
            by hand on {view.profilesCheckedOn}, and recall is partial: a player with no link may still
            have a profile.
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

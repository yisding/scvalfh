import { EM_DASH, ordinal } from '../../lib/format';
import PinControl from '../ui/PinControl';
import TeamMonogram from '../ui/TeamMonogram';
import type { TeamPageView } from './team-view';

/**
 * The 84px identity header (DESIGN §3.7): a 56px monogram, the school name as the page's `h1`,
 * the mascot, and one meta line of division · city · place. Then the pin control.
 *
 * The monogram is the ONLY place a school color appears anywhere on the site: fifteen
 * uncontrolled brand hues blow past every categorical ceiling, so they are decoration with a
 * measured contrast guardrail, never an encoding (DESIGN §7.1, §12.4). No mascot image is ever
 * requested from a third party.
 */
export function TeamIdentity({
  view,
  knownSlugs,
}: {
  view: TeamPageView;
  knownSlugs: readonly string[];
}) {
  const { team, standing, hasResults, divisionLabel, divisionSize } = view;
  const place =
    hasResults && standing
      ? `${ordinal(standing.computed.place)} of ${divisionSize}${
          standing.tiebreak.shared ? ' (tied)' : ''
        }`
      : `${EM_DASH} of ${divisionSize}`;

  return (
    <header className="flex items-start gap-3 pt-3">
      <TeamMonogram team={team} size={56} />
      <div className="min-w-0 flex-1">
        <h1 className="m-0 text-h1">{team.name}</h1>
        <p className="mt-0.5 mb-2 text-meta text-ink-2">
          {team.mascot} &middot; {divisionLabel} &middot; {team.city}, CA &middot;{' '}
          <span className="sx-num">{place}</span>
        </p>
        <PinControl slug={team.slug} name={team.name} knownSlugs={knownSlugs} />
      </div>
    </header>
  );
}

export default TeamIdentity;

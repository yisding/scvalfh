import Link from 'next/link';

import { BYLAW_CITATIONS, CCS_BRACKET_URL, PLAYOFF_KEY_DATES } from '../../lib/season';
import { dateWithYear } from '../../lib/format';
import { outcomesFor } from '../../lib/standings';
import type { PlayoffStatus } from '../../lib/types';
import ExternalLink from '../ui/ExternalLink';
import type { TeamPageView } from './team-view';

/**
 * Where this team stands in the CCS picture (DESIGN §8, By-Laws Article VII §2).
 *
 * The block never disappears: a team with no automatic path reads "not in line for an automatic
 * berth" with a link to the bracket, because vanishing would leave the reader unsure whether we
 * simply had no data. Every status is a WRITTEN WORD and there are no percentages anywhere — there
 * is no model, and inventing one would be the least honest thing on the site (DESIGN §7.11).
 */
const SENTENCE: Record<PlayoffStatus, (name: string) => string> = {
  aq: (name) =>
    `${name} is currently in automatic-qualifier position: the first three teams in each division receive an automatic berth.`,
  'play-in': (name) =>
    `${name} is currently in fourth, which plays a play-in game for the SCVAL seventh automatic berth.`,
  'at-large': (name) =>
    `${name} is currently in fifth, which is submitted to CCS for at-large consideration.`,
  out: (name) => `${name} is not currently in line for an automatic berth.`,
};

/** The tail of the sentence when a level place straddles an Article VII §2 boundary. */
const ALSO: Record<PlayoffStatus, string> = {
  aq: 'an automatic berth',
  'play-in': 'the fourth place that plays in on Oct 30',
  'at-large': 'the fifth place submitted to CCS for at-large consideration',
  out: 'no automatic path',
};

/**
 * A place left level by Article VI §7 covers more than one finishing slot, so the team could end
 * up on either side of a by-law boundary. Saying only the better one would read as a ruling.
 */
function playoffSentence(name: string, outcomes: readonly PlayoffStatus[]): string {
  const [first, ...rest] = outcomes;
  if (first === undefined) return SENTENCE.out(name);
  const head = SENTENCE[first](name);
  if (rest.length === 0) return head;
  return `${head} That place is level, though, so ${name} could equally end up with ${rest
    .map((status) => ALSO[status])
    .join(' or ')} once Article VI §7's coin flip is run.`;
}

export function TeamPlayoffLine({ view }: { view: TeamPageView }) {
  const { team, standing, hasResults } = view;
  return (
    <div className="space-y-2 text-meta">
      <p className="m-0 text-body text-ink">
        {hasResults && standing
          ? playoffSentence(team.name, outcomesFor(standing))
          : `No results are reported for ${team.name}, so it has no computed position in the CCS picture.`}
      </p>
      {hasResults && standing?.tiebreak.shared ? (
        <p className="m-0 text-ink-2">{standing.tiebreak.note}</p>
      ) : null}
      <p className="m-0 text-ink-2">
        {BYLAW_CITATIONS.qualifiers}. The SCVAL crossover and play-in are{' '}
        {dateWithYear(PLAYOFF_KEY_DATES.crossover)}; CCS seeds on{' '}
        {dateWithYear(PLAYOFF_KEY_DATES.seedingMeeting)}. Berths are assigned by the CCS committee
        and nothing here is official.
      </p>
      {/* Two standalone actions on their own row, so each carries its own 24px box (WCAG 2.5.8)
          rather than the 17px height of the type around them. */}
      <p className="m-0 flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/playoffs" className="sx-action text-accent hover:underline">
          Playoff picture <span aria-hidden="true">&rarr;</span>
        </Link>
        <ExternalLink href={CCS_BRACKET_URL} className="sx-action">
          Official CCS bracket
        </ExternalLink>
      </p>
    </div>
  );
}

export default TeamPlayoffLine;

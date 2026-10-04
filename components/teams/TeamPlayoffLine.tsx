import Link from 'next/link';

import { CCS } from '../../lib/leagues';
import { splitStatusLabel } from '../playoffs/playoff-view';
import Arrow from '../ui/Arrow';
import ExternalLink from '../ui/ExternalLink';
import StatusChip from '../ui/StatusChip';
import type { TeamPageView } from './team-view';

/** 'MCAL tournament' | 'Super Regional' | 'playoff': the event a result-less team has no place in. */
function postseasonPhrase(league: TeamPageView['league']): string {
  switch (league.postseasonKind) {
    case 'league-tournament':
      return `${league.shortName} tournament`;
    case 'unbracketed-tournament':
      return league.postseasonName ?? 'playoff';
    case 'ccs-ladder':
      return 'playoff';
  }
}

/**
 * Where this team stands in its league's postseason picture (SPEC §10.5): the CCS ladder for SCVAL,
 * BVAL and PCAL, the MCAL tournament for MCAL, the Super Regional for the EAL. The copy is `getTeamPostseasonLine(slug)` from
 * lib/data.ts — the same accessor the home page's pinned card uses — so the two cannot disagree:
 *
 * - a CCS league: the ladder label, then the league's sentence (the SCVAL crossover date, BVAL's
 *   Oct 31 play-in, or "No automatic-berth route; …"), and `CCS playoffs →`;
 * - MCAL: the ladder label and the tournament format, `MCAL tournament →`. No CCS sentence, no
 *   berth meter and no CCS bracket link: the North Coast Section holds no field hockey
 *   championship, so a CCS concept on an MCAL page would be false (SPEC §10.9);
 * - the EAL: the status chip (a Super Regional place or outside the top six) and the Super
 *   Regional's dates and what is not published, from lib/data.ts. No CCS sentence, no CCS link and
 *   no bracket, because none is published.
 *
 * A team with no results is never placed by merit: the accessor returns null and the block reads
 * `No results reported yet.` Every status is a WRITTEN WORD (DESIGN §7.11). Nothing here is
 * official.
 */
export function TeamPlayoffLine({ view }: { view: TeamPageView }) {
  const { postseasonLine: line, standing, league } = view;
  if (!line) {
    return (
      <div className="sx-card p-5 text-meta">
        <p className="m-0 text-body text-ink">No results reported yet.</p>
        <p className="mt-2 mb-0 text-ink-2">
          {view.team.name} has no counted {league.shortName} result, so it has no computed place
          in the {postseasonPhrase(league)} picture.
        </p>
      </div>
    );
  }
  // The chip is the label's head; a level place's " — <rule> decides it" tail is the tiebreak
  // note's job below, not the chip's.
  const { head } = splitStatusLabel(line.label);
  return (
    <div className="sx-card p-5 text-meta">
      <p className="m-0 mb-3">
        <StatusChip tone={view.postseasonAccent ? 'accent' : 'neutral'}>{head}</StatusChip>
      </p>
      <p className="m-0 text-body text-ink">{line.sentence}</p>
      {standing?.tiebreak.shared && standing.tiebreak.note ? (
        <p className="mt-2 mb-0 text-ink-2">{standing.tiebreak.note}</p>
      ) : null}
      <p className="mt-2 mb-0 text-ink-2">Projected from the table today; nothing here is official.</p>
      <p className="mt-3 mb-0 flex flex-wrap gap-2">
        <Link href={line.href} prefetch={false} className="sx-pill">
          {line.linkText} <Arrow />
        </Link>
        {league.postseasonKind === 'ccs-ladder' ? (
          <ExternalLink href={CCS.bracketUrl} className="sx-pill">
            Official CCS bracket
          </ExternalLink>
        ) : null}
      </p>
    </div>
  );
}

export default TeamPlayoffLine;

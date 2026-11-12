import Link from 'next/link';

import { CCS } from '../../lib/league-config/sections';
import { splitStatusLabel } from '../playoffs/playoff-view';
import ExternalLink from '../ui/ExternalLink';
import type { TeamPageView } from './team-view';

/**
 * Where this team stands in its league's postseason picture (SPEC §10.5): the CCS ladder for SCVAL,
 * BVAL and PCAL, the MCAL tournament for MCAL, the Super Regional for the EAL. The copy is `getTeamPostseasonLine(slug)` from
 * components/playoffs/team-postseason-line.ts — the same accessor the home page's pinned card uses — so the two cannot disagree:
 *
 * - a CCS league: the ladder label, then the league's sentence (the SCVAL crossover date, BVAL's
 *   Oct 31 play-in, or "No automatic berth; …"), and `CCS playoffs →`;
 * - MCAL: the ladder label and the tournament format, `MCAL tournament →`. No CCS sentence, no
 *   berth meter and no CCS bracket link: the North Coast Section holds no field hockey
 *   championship, so a CCS concept on an MCAL page would be false (SPEC §10.9);
 * - the EAL: the status chip (a Super Regional place or outside the top six) and the Super
 *   Regional's dates and what is not published, from lib/data.ts. No CCS sentence, no CCS link and
 *   no bracket, because none is published.
 * - the Sunset and the LA independents ('no-postseason'): the chip 'In the Tournament of Champions' or
 *   'Not in the Tournament of Champions' and the league's note (the tournament is their postseason; CIF-SS
 *   holds none, Blue Book 2011.1, 3500.2), for every team whatever it has played; no "projected" line,
 *   because no table place leads into it.
 * - a San Diego league ('section-playoffs'): the ladder label (1st: the designated champion's play-in;
 *   below it: no league route), the Section's qualification line and the team's own playoff division
 *   (I or II, the Section's 2026 Divisions sheet), and `San Diego Section playoffs →`. No seed.
 *
 * Drawn as plain text in the rail (DESIGN §33): the status as one bold line, the sentence, the
 * tiebreak note and the honesty line under it, then a row of links. The team's bracket GAME, once
 * there is one, is the page's Next game row (with its own "Bracket" link) and a line of the
 * schedule; it is not repeated here.
 *
 * A team with no results is never placed by merit: the accessor returns null and the block reads
 * `No results reported yet.` Every status is a WRITTEN WORD (DESIGN §7.11). Nothing here is
 * official, and the line that says so (`caveat`) prints only where something is projected: under a
 * CCS ladder and a league tournament still read from the table, never under a San Diego card (the
 * Section places teams), an EAL card (all six are in) or the Sunset's.
 */
export interface TeamPlayoffLineProps {
  view: TeamPageView;
}

export function TeamPlayoffLine({ view }: TeamPlayoffLineProps) {
  const { postseasonLine: line, standing, league } = view;
  if (!line) return <p className="sx-empty">No results reported yet.</p>;
  // The status is the label's head; a level place's " — <rule> decides it" tail is the tiebreak
  // note's job below.
  const { head } = splitStatusLabel(line.label);
  // The sentence often opens with the very words of the line above it ("CCS Division 1 semifinal · 3 v 2:
  // vs Mitty …"): they are said once, and the sentence starts at what is new.
  const tail = line.sentence.startsWith(head) ? line.sentence.slice(head.length).replace(/^\s*[·:,.—-]\s*/, '') : '';
  const rest = tail ? tail.charAt(0).toUpperCase() + tail.slice(1) : line.sentence;
  return (
    <>
      <p className="m-0 text-body font-semibold text-ink">{head}</p>
      <p className="sx-note mt-1">{rest}</p>
      {standing?.tiebreak.shared && standing.tiebreak.note ? <p className="sx-note">{standing.tiebreak.note}</p> : null}
      {/* The honesty line is the accessor's (`caveat`): a projection says so; a tournament with results says it
          reads them; the EAL, a San Diego league and the Sunset, which project nothing, print none. */}
      {line.caveat ? <p className="sx-note">{line.caveat}</p> : null}
      <ul className="sx-linkrow">
        <li>
          <Link href={line.href} prefetch={false} className="sx-action">
            {line.linkText}
          </Link>
        </li>
        {league.postseasonKind === 'ccs-ladder' ? (
          <li>
            <ExternalLink href={CCS.bracketUrl ?? CCS.sources.index} className="sx-action">
              {CCS.bracketUrl ? 'Official CCS bracket' : 'CCS playoffs'}
            </ExternalLink>
          </li>
        ) : null}
      </ul>
    </>
  );
}

export default TeamPlayoffLine;

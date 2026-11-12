import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import { capitalized } from '../words/capitalized';
import { getTeams } from '../../lib/data';
import type { LeagueSummary } from '../../lib/data';
import { listWords, numberWord } from '../../lib/format';
import { getLeague, isIndependentLeague, sectionOf } from '../../lib/leagues';

/**
 * A league whose section runs no field hockey championship (the Sunset, the LA independents; `id=<league>`, the
 * target of the nav and the league row). A section of /playoffs like every other league's (the name is kept:
 * it was a card). With the section's outside tournament (the Tournament of Champions, DESIGN §24.13) it
 * follows that tournament's section (OutsideTournament.tsx): it names the tournament as the league's
 * postseason (the config's note), says which of its teams play in it and which do not, links the Blue Book
 * for why CIF runs none, and links the tournament's games. The LA independents' section adds the group's own
 * note (schools in no league, whose table is their games against each other). No seed and no bracket. Without
 * such a tournament the section is the note and its source alone.
 */
export default function NoPostseasonCard({ summary }: { summary: LeagueSummary }) {
  const league = getLeague(summary.id);
  const ps = league.postseason;
  if (ps.kind !== 'no-postseason') return null;
  const independent = isIndependentLeague(summary.id);
  const groupNote = independent && league.divisions[0]?.official.mode === 'none' ? league.divisions[0].official.note : null;
  const event = sectionOf(summary.id).outsideTournament;
  const teams = getTeams({ league: summary.id });
  const inIt = event ? teams.filter((t) => event.entrants.includes(t.slug)) : [];
  const notInIt = event ? teams.filter((t) => !event.entrants.includes(t.slug)) : [];
  const who = independent ? summary.name : `${summary.shortName} teams`;
  const heading = independent ? summary.name : summary.shortName;
  return (
    <section id={summary.id} aria-labelledby={`${summary.id}-heading`} className="sx-section">
      <SectionHeader id={`${summary.id}-heading`} kicker={heading} />
      <div className="sx-prose">
        <p>{ps.note}</p>
        {event && inIt.length > 0 ? (
          <p>
            {`${capitalized(numberWord(inIt.length))} of the ${numberWord(teams.length)} ${who} play in it: ${listWords(inIt.map((t) => t.name))}.`}
            {notInIt.length > 0 ? ` Not in it: ${listWords(notInIt.map((t) => t.name))}.` : null}
          </p>
        ) : null}
        {groupNote ? <p>{groupNote}</p> : null}
        <p>
          {event ? 'Why CIF does not run it: ' : `${ps.citations.noPlayoffs}. `}
          <ExternalLink href={ps.sourceUrl}>{ps.sourceLabel}</ExternalLink>
        </p>
      </div>
      {event ? (
        <p className="sx-linkrow">
          <Link href={`#${event.id}-games`} prefetch={false} className="sx-action">
            {`${event.name} games`}
          </Link>
        </p>
      ) : null}
    </section>
  );
}

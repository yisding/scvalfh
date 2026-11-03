import Link from 'next/link';

import Arrow from '../ui/Arrow';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import { capitalized } from '../words/capitalized';
import { getTeams } from '../../lib/data';
import type { LeagueSummary } from '../../lib/data';
import { listWords, numberWord } from '../../lib/format';
import { getLeague, isIndependentLeague, sectionOf } from '../../lib/leagues';

/**
 * A league whose section runs no field hockey championship (the Sunset, the LA independents; `id=<league>`, the
 * target of the nav and the league chips). With the section's outside tournament (the Tournament of Champions,
 * DESIGN §24.13) the card sits inside that tournament's section (OutsideTournament.tsx), beside the other
 * league's: it names the tournament as the league's postseason (the config's note), says which of its teams play
 * in it and which do not, and links the Blue Book for why CIF runs none. The LA independents' card adds the
 * group's own note (schools in no league, whose table is their games against each other). No seed and no
 * bracket. Without such a tournament the card is the note and its source alone.
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
  const heading = independent ? summary.name : `${summary.shortName} — ${summary.name}`;
  const body = (
    <>
      <p className="m-0">{ps.note}</p>
      {event && inIt.length > 0 ? (
        <p className="mt-2 mb-0">
          {`${capitalized(numberWord(inIt.length))} of the ${numberWord(teams.length)} ${who} play in it: ${listWords(inIt.map((t) => t.name))}.`}
          {notInIt.length > 0 ? ` Not in it: ${listWords(notInIt.map((t) => t.name))}.` : null}
        </p>
      ) : null}
      {groupNote ? <p className="mt-2 mb-0 text-meta">{groupNote}</p> : null}
      <p className="mt-2 mb-0 text-meta">
        {event ? 'Why CIF does not run it: ' : `${ps.citations.noPlayoffs}. `}
        <ExternalLink href={ps.sourceUrl}>{ps.sourceLabel}</ExternalLink>
      </p>
      {event ? (
        <p className="mt-2 mb-0 text-meta">
          <Link href={`#${event.id}-games`} prefetch={false} className="sx-action text-accent hover:underline">
            {`${event.name} games`} <Arrow />
          </Link>
        </p>
      ) : null}
    </>
  );
  if (event) {
    return (
      <section id={summary.id} aria-labelledby={`${summary.id}-heading`} className="sx-card flex flex-col p-5 md:p-6">
        <h3 id={`${summary.id}-heading`} className="m-0 text-lead text-ink">
          {heading}
        </h3>
        <div className="mt-2 text-body text-ink-2">{body}</div>
      </section>
    );
  }
  return (
    <section id={summary.id} aria-labelledby={`${summary.id}-heading`} className="mt-section md:mt-section-lg">
      <SectionHeader id={`${summary.id}-heading`} kicker={heading} />
      <div className="sx-inset max-w-3xl text-body text-ink-2">{body}</div>
    </section>
  );
}

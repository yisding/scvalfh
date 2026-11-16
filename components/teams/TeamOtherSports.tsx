import { otherSportTeams } from '../../lib/schools/other-sports';
import type { Team } from '../../lib/types';

/**
 * The team page's "Other sports" block, in the rail before Elsewhere: one row of links to the same school's team
 * pages on the other sport sites (lib/schools/other-sports.ts), only those whose registry holds the school. A school
 * no other site covers gets no block. Plain links in the same tab: the sites are one family, not another source.
 *
 * `id="other-sports"`: scripts/assert-copy.ts takes the block out before it holds a page to its own sport's words,
 * since naming the other programs is the block's whole point.
 */
export function TeamOtherSports({ team }: { team: Pick<Team, 'id' | 'name'> }) {
  const others = otherSportTeams(team.id);
  if (others.length === 0) return null;
  return (
    <section id="other-sports" className="sx-section" aria-labelledby="other-sports-heading">
      <h2 id="other-sports-heading">Other sports</h2>
      <ul className="sx-linkrow mt-0">
        {others.map((o) => (
          <li key={o.sport}>
            <a href={o.href} className="sx-action">
              <span className="sr-only">{team.name} </span>
              {o.title}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default TeamOtherSports;

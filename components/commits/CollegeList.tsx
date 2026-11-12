import { listWords } from '../../lib/format';
import ExternalLink from '../ui/ExternalLink';
import type { CollegeRow } from './commit-view';

/**
 * The colleges on /commits (DESIGN §33): each with its place, then one line per team a player here
 * committed to (the sport, its division and conference: they differ by sport at one college), how
 * many players here committed to it and from which schools, and each team's page.
 *
 * A list, not a table, in the commitment entries' `sx-auto` columns. The row's id is collegeAnchor(),
 * so `/commits#norcal-college-<slug>` lands on it: a college has a row in each region it has players
 * from. A program link is the college's own site, so it is an off-site link with the arrow; its label
 * names the college and the sport ("Stanford field hockey", "St. Lawrence soccer"), so links in a
 * screen reader's list tell themselves apart. Nothing long is `nowrap`: official names and the
 * schools line reflow at 320px.
 */
export interface CollegeListProps {
  colleges: CollegeRow[];
}

export function CollegeList({ colleges }: CollegeListProps) {
  return (
    <ul className="sx-auto m-0 list-none p-0">
      {colleges.map((college) => (
        <li key={college.slug} id={college.anchor} className="sx-target min-w-0 border-b border-hairline py-1.5">
          <span className="block text-body font-semibold text-ink">{college.name}</span>
          <span className="flex flex-wrap gap-x-3 text-cell text-ink-2">
            {college.fullName ? <span>{college.fullName}</span> : null}
            <span>{college.place}</span>
          </span>
          {college.programs.map((program) => (
            <span key={program.sport} className="flex flex-wrap gap-x-3 text-cell text-ink-2">
              {program.facts.map((fact) => (
                <span key={fact}>{fact}</span>
              ))}
            </span>
          ))}
          <span className="block text-cell text-ink-2">
            {college.countLine}: {listWords(college.schools)}
          </span>
          {college.programs.some((program) => program.link) ? (
            <span className="flex flex-wrap gap-x-4">
              {college.programs.map((program) =>
                program.link ? (
                  <ExternalLink key={program.sport} href={program.link.url} className="sx-action whitespace-normal">
                    {program.link.label}
                  </ExternalLink>
                ) : null,
              )}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default CollegeList;

import ExternalLink from '@/components/ui/ExternalLink';
import GridRowFiller from '@/components/ui/GridRowFiller';
import { listWords } from '@/lib/format/words';
import type { CollegeRow } from '@/views/commits/commit-view';

/**
 * The colleges on /commits (DESIGN §21.1): each with its place, then one line per team a player here
 * committed to (the sport, its division and conference: they differ by sport at one college), how
 * many players here committed to it and from which schools, and each team's page.
 *
 * A list, not a table (DESIGN §10.8), in the same card and grid as the commitment rows. The row's id
 * is collegeAnchor(), so `/commits#norcal-college-<slug>` lands on it: a college has a row in each
 * region it has players from. A program link is the college's own site, so it is an off-site link
 * with the arrow, standing alone on its line with the `sx-action` box; its label names the college and the sport ("Stanford field hockey", "St. Lawrence soccer"),
 * so links in a screen reader's list tell themselves apart. Nothing long is `nowrap`: official names
 * and the schools line reflow at 320px.
 */
export interface CollegeListProps {
  colleges: CollegeRow[];
}

export function CollegeList({ colleges }: CollegeListProps) {
  return (
    <ul className="sx-card sx-flush sx-bleed my-0 grid list-none p-0 sm:grid-cols-2 lg:grid-cols-3">
      {colleges.map((college) => (
        <li
          key={college.slug}
          id={college.anchor}
          className="sx-gridcell"
        >
          <span className="block text-body font-semibold text-ink">{college.name}</span>
          {college.fullName ? <span className="block text-meta text-ink-2">{college.fullName}</span> : null}
          <span className="block text-meta text-ink-2">{college.place}</span>
          {college.programs.map((program) => (
            <span key={program.sport} className="block text-meta text-ink-2">
              {program.facts.join(' · ')}
            </span>
          ))}
          <span className="block text-meta text-ink-2">
            {college.countLine}: {listWords(college.schools)}
          </span>
          {college.programs.map((program) =>
            program.link ? (
              <span key={program.sport} className="block text-meta">
                <ExternalLink href={program.link.url} className="sx-action gap-1">
                  {program.link.label}
                </ExternalLink>
              </span>
            ) : null,
          )}
        </li>
      ))}
      <GridRowFiller count={colleges.length} columns={{ sm: 2, lg: 3 }} />
    </ul>
  );
}

export default CollegeList;

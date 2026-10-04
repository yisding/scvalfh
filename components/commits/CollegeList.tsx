import { listWords } from '../../lib/format';
import ExternalLink from '../ui/ExternalLink';
import type { CollegeRow } from './commit-view';

/**
 * The colleges on /commits (DESIGN §21.1): each with its division, conference and place, how many
 * players here committed to it and from which schools, and its field hockey page.
 *
 * A list, not a table (DESIGN §10.8), in the same card and grid as the commitment rows. The row's id
 * is collegeAnchor(), so `/commits#college-<slug>` lands on it. The program link is the college's
 * own site, so it is an off-site link with the arrow, standing alone on its line with the
 * `sx-action` box; its label names the college ("Stanford field hockey"), so links in a screen
 * reader's list tell themselves apart. Nothing long is `nowrap`: official names and the schools
 * line reflow at 320px.
 */
export function CollegeList({ colleges }: { colleges: CollegeRow[] }) {
  return (
    <ul className="sx-card sx-flush sx-bleed m-0 grid list-none p-0 sm:grid-cols-2 lg:grid-cols-3">
      {colleges.map((college) => (
        <li
          key={college.slug}
          id={college.anchor}
          className="min-w-0 border-t border-divider px-gutter py-2.5 first:border-t-0 sm:px-4 sm:[&:nth-child(2)]:border-t-0 lg:[&:nth-child(3)]:border-t-0"
        >
          <span className="block text-body font-semibold text-ink">{college.name}</span>
          {college.fullName ? <span className="block text-meta text-ink-2">{college.fullName}</span> : null}
          <span className="block text-meta text-ink-2">{college.facts.join(' · ')}</span>
          <span className="block text-meta text-ink-2">
            {college.countLine}: {listWords(college.schools)}
          </span>
          {college.program ? (
            <span className="block text-meta">
              <ExternalLink href={college.program.url} className="sx-action gap-1">
                {college.program.label}
              </ExternalLink>
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default CollegeList;

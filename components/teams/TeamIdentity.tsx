import PinControl from '../ui/PinControl';
import TeamMonogram from '../ui/TeamMonogram';
import type { TeamPageView } from './team-view';

/**
 * The identity hero (DESIGN §3.7, modernization brief §5.7): one card holding the school's
 * monogram (56px on a phone, 64px from 768px), the school name as the page's `h1`, and one meta
 * line of mascot · division · city. The pin control sits under them on a phone (full width) and at
 * the right edge from 768px.
 *
 * The standings place is NOT repeated here: the Place tile directly below states it twice already
 * ("4th" over "of 8 in De Anza", with "(tied)" when it is level), so a third copy one line above
 * it was noise.
 *
 * `data-team-slug` lets the pinned-team marker (PinnedTeamMarks and the head script) stamp
 * `data-pinned` on this card when it is the pinned team, so the hero gets the same 3px accent rule
 * as the pinned tile on /teams — the pin is in localStorage, so the server cannot draw it. The
 * card holds no `.sx-pin-note`: the pressed Pin button already says "Pinned" in words.
 *
 * Phone padding is 16px and the row gap 12px (20 / 16 from 768px) to keep the Last result on the
 * first phone screen.
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
  const { team, divisionLabel } = view;

  return (
    <header
      data-team-slug={team.slug}
      className="sx-card mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 p-4 md:gap-5 md:p-6"
    >
      {/* Two decorative monograms, one per breakpoint. Each sits in its own wrapper because the
          monogram's own `inline-flex` would otherwise compete with `hidden` in the cascade. */}
      <span className="flex shrink-0 md:hidden">
        <TeamMonogram team={team} size={56} />
      </span>
      <span className="hidden shrink-0 md:flex">
        <TeamMonogram team={team} size={64} />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="m-0 text-h1 text-ink">{team.name}</h1>
        <p className="mt-1 mb-0 text-meta text-ink-2">
          {team.mascot} &middot; {divisionLabel} &middot; {team.city}, CA
        </p>
      </div>
      <PinControl
        slug={team.slug}
        name={team.name}
        knownSlugs={knownSlugs}
        className="w-full md:ml-auto md:w-auto"
      />
    </header>
  );
}

export default TeamIdentity;

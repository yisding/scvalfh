import { BUILD_INSTANT } from '../layout/build-instant';
import LastUpdated from '../layout/LastUpdated';
import PageHeader from '../layout/PageHeader';
import PinControl from '../prefs/PinControl';
import TeamMonogram from '../ui/TeamMonogram';
import { getFetchedAt } from '../../lib/data';
import { placeMark, recordString } from '../../lib/format';
import type { TeamPageView } from './team-view';

/**
 * The team page's header (DESIGN §33): the school's logo (64px; the stylesheet draws it at 48px
 * below 768), the school name as the page's `h1` at the title size (a long name wraps beside the
 * logo, it is never cut), ONE plain line under it (the league and division: `SCVAL De Anza`, or
 * `MCAL` for a single-division league), then the record as figures: the league record, the overall
 * record and the place, each over a small label. A team with no reported results has no figures at
 * all, never 0-0-0 and never a dash. A level place is written `T-7th`, as every table writes it.
 *
 * At the right from 768px (under the figures on a phone): the pin state (`PinControl`: "Your team" +
 * "Remove", or the button "Make this my team") and the short Updated stamp after it.
 *
 * `data-team-slug` on the wrapper lets the pinned-team marker (PinnedTeamMarks and the head script)
 * stamp `data-pinned` on it when this is the reader's team. The pin is in localStorage, so the
 * server cannot draw it. Pinning here also remembers the team's league (`PinControl`'s `leagueId`).
 *
 * The wrapper's first child is a one-rule `<style>` for its own slug (`pinSelfCss`): when the pinned
 * team is THIS team (`html[data-pin]`, stamped pre-paint by the prefs script), it switches off
 * PinControl's pre-hydration "This replaces your team." note before it can paint.
 *
 * The logo is the school's mascot, self-hosted from public/mascots/: no image is ever requested
 * from a third party.
 */
/**
 * The rule for one slug, or null for anything that is not a registry slug. Slugs are
 * `[a-z0-9-]+` (the prefs script holds `data-pin` to the same pattern), so the value needs no CSS
 * escaping and can never close the attribute selector or the `<style>`.
 */
export function pinSelfCss(slug: string): string | null {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  return `html[data-pin="${slug}"] [data-team-slug="${slug}"]{--sx-pin-other:none}`;
}

export interface TeamIdentityProps {
  view: TeamPageView;
  knownSlugs: readonly string[];
}

/** `SCVAL De Anza` | `MCAL`: the one line under the name. */
export function leagueLine(view: Pick<TeamPageView, 'league' | 'divisionHeading'>): string {
  return view.divisionHeading ? `${view.league.shortName} ${view.divisionHeading}` : view.league.shortName;
}

export function TeamIdentity({ view, knownSlugs }: TeamIdentityProps) {
  const { team, standing, hasResults } = view;
  const pinSelf = pinSelfCss(team.slug);
  const figures =
    hasResults && standing
      ? [
          { label: 'League', value: recordString(standing.computed) },
          ...(standing.overall.gp > 0 ? [{ label: 'Overall', value: recordString(standing.overall) }] : []),
          {
            // The scope is the label: `2nd` over `De Anza`, `T-7th` over `El Camino`.
            label: view.scopeLabel,
            value: placeMark(standing.computed.place, standing.tiebreak.shared, 'pill'),
          },
        ]
      : undefined;

  return (
    <div data-team-slug={team.slug}>
      {pinSelf ? <style dangerouslySetInnerHTML={{ __html: pinSelf }} /> : null}
      <PageHeader
        lead={<TeamMonogram team={team} size={64} />}
        title={team.name}
        meta={leagueLine(view)}
        figures={figures}
        end={
          <>
            <PinControl slug={team.slug} leagueId={team.league} label={view.pinLabel} knownSlugs={knownSlugs} />
            <LastUpdated at={getFetchedAt()} now={BUILD_INSTANT} variant="time" />
          </>
        }
      />
    </div>
  );
}

export default TeamIdentity;

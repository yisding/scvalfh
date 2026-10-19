import PinControl from '@/components/ui/PinControl';
import PlaceMark from '@/components/ui/PlaceMark';
import TeamMonogram from '@/components/ui/TeamMonogram';
import { placeScope } from '@/views/teams/team-view';
import type { TeamPageView } from '@/views/teams/team-view';

/**
 * The identity hero (DESIGN §3.7, modernization brief §5.7): one card holding the school's
 * monogram (56px on a phone, 64px from 768px), the school name as the page's `h1`, and one meta
 * line of mascot · division · league · city (SPEC §10.5: `Pirates · De Anza · SCVAL · San Jose`;
 * a single-division league has no division label: `Red-Tailed Hawks · MCAL · Mill Valley`). The
 * pin control sits under them on a phone (full width) and at the right edge from 768px.
 *
 * The standings place IS stated here, on a second meta line ("4th of 8 in De Anza", "T-7th of 8 in
 * El Camino" for a level place, with "tied for 7th" in words for a screen reader). The stat tiles
 * used to sit directly under this card and say it, so a copy here was noise; they now follow Last
 * and Next, a phone screen further down, and "where do we stand" is the first of the parent's
 * three questions. The words come from the Place tile's own `placeScope`, so the two never
 * disagree. A team with no reported results has no place, so the line is simply absent — never
 * an em dash in a sentence.
 *
 * `data-team-slug` lets the pinned-team marker (PinnedTeamMarks and the head script) stamp
 * `data-pinned` on this card when it is the pinned team, so the hero gets the same 3px accent rule
 * as the pinned tile on /teams — the pin is in localStorage, so the server cannot draw it. The
 * card holds no `.sx-pin-note`: on the pinned team's page the button already says "Unpin this team"
 * in words.
 *
 * Phone padding is 16px and the row gap 12px (20 / 16 from 768px) to keep the Last result and the
 * Next game's date and opponent on the first phone screen.
 *
 * Pinning here also remembers the team's league (`PinControl`'s `leagueId`, SPEC §8.2).
 *
 * The hero's first child is a one-rule `<style>` for its own slug (`pinSelfCss`): when the pinned
 * team is THIS team (`html[data-pin]`, stamped pre-paint by the prefs script), it switches off
 * PinControl's pre-hydration "This replaces your pinned team." note before it can paint. Without it
 * the note showed on the pinned team's own page until DOMContentLoaded, when the head script marks
 * the hero `[data-pinned]`, and on a phone the page then jumped up 28px (app/globals.css,
 * `.sx-pin-other`). A `<style>` is `display: none`, so it is no flex item in the hero.
 *
 * The tile is the school's mascot, self-hosted from public/mascots/ (DESIGN §7.1, §12.4): no
 * image is ever requested from a third party.
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

export function TeamIdentity({ view, knownSlugs }: TeamIdentityProps) {
  const { team, standing, hasResults } = view;
  const place = hasResults && standing ? standing.computed.place : null;
  const shared = place !== null && (standing?.tiebreak.shared ?? false);
  const pinSelf = pinSelfCss(team.slug);

  return (
    <header
      data-team-slug={team.slug}
      className="sx-card mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 p-4 md:gap-5 md:p-6"
    >
      {pinSelf ? <style dangerouslySetInnerHTML={{ __html: pinSelf }} /> : null}
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
        <p className="mt-1 mb-0 text-meta text-ink-2">{view.identityLine}</p>
        {place !== null ? (
          <p className="mt-0.5 mb-0 text-meta text-ink-2">
            <PlaceMark place={place} shared={shared} form="pill" />{' '}
            {placeScope(view.divisionSize, view.scopeLabel)}
          </p>
        ) : null}
      </div>
      <PinControl
        slug={team.slug}
        leagueId={team.league}
        label={view.pinLabel}
        knownSlugs={knownSlugs}
        className="w-full md:ml-auto md:w-auto"
      />
    </header>
  );
}

export default TeamIdentity;

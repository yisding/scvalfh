import FestivalFollowSync from '../../components/festival/FestivalFollowSync';
import { buildFestivalFollowCss } from '../../components/festival/follow-css';
import { festivalTeamSlugs } from '../../lib/festival/festival';
import { HAS_FESTIVAL } from '../../lib/sports/current';

/**
 * Every /festival page (DESIGN §35): the followed-team stylesheet, generated from the festival's team slugs
 * (components/festival/follow-css.ts), which turns the head script's `<html data-fest-follow>` stamp into stars and
 * bold names before first paint; and the client cleanup of followed slugs the festival no longer has. Only the
 * festival's pages carry either, so no other route's HTML or first-load JS grows. Another sport's build renders the
 * pages as 404s and this adds nothing.
 *
 * Below the 48rem breakpoint the site's bottom chrome is hidden (owner ask, 2026-11-26): the fixed tab bar
 * (Scores, Standings, Playoffs, Teams, More) and the footer's index read as the festival's own sections on a phone.
 * The body and scroll padding that cleared the tab bar go with it. Both stay in the HTML; the header's wordmark
 * still leads back to the site, and the festival pages credit their source in FestivalChrome's
 * "Scores as of …, from TourneyMachine" line. Unlayered, so it outranks globals.css's layered rules.
 */
const SLUGS = festivalTeamSlugs();
const FESTIVAL_FOOTER_CSS =
  '@media not all and (min-width:48rem){.sx-tabbar,.sx-foot{display:none}' +
  'html{scroll-padding-bottom:0}body{padding-bottom:calc(2rem + env(safe-area-inset-bottom))}}';
const FOLLOW_CSS = HAS_FESTIVAL ? `${buildFestivalFollowCss(SLUGS)}${FESTIVAL_FOOTER_CSS}` : '';

export default function FestivalLayout({ children }: LayoutProps<'/festival'>) {
  if (!HAS_FESTIVAL) return children;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: FOLLOW_CSS }} />
      <FestivalFollowSync knownSlugs={SLUGS} />
      {children}
    </>
  );
}

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
 */
const SLUGS = festivalTeamSlugs();
const FOLLOW_CSS = HAS_FESTIVAL ? buildFestivalFollowCss(SLUGS) : '';

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

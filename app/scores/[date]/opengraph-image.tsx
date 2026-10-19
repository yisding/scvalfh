import { notFound } from 'next/navigation';

import { ogPng } from '@/components/og/png';
import { SCORES_DAY_CARD_ALT, ScoresDayCard } from '@/components/og/ScoresDayCard';
import { dayCardModel } from '@/views/scores/day-card';
import { scoresParam, scoresStaticParams } from '@/views/scores/scores-route';
import { OG_CONTENT_TYPE, OG_SIZE } from '@/views/site/og-theme';

/**
 * The per-date OG card (DESIGN §3.4) — the thing a link pasted into a group text previews with —
 * drawn by components/og/ScoresDayCard.tsx from views/scores/day-card.ts.
 *
 * TEXT ONLY, like the root card: no logo file, no school colors, no third-party image request.
 * Every score comes from `dayLines()` → `describeGame()`, so a game with no published score shows
 * an en dash here exactly as it does in the HTML. The card can no more invent a `0-0` than the page
 * can.
 *
 * The title is `<Thu Sep 24> · <n> games in <k> leagues` (SPEC §8.4) and the day's headline result
 * — the final with the largest margin — leads the lines.
 */
export const alt = SCORES_DAY_CARD_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * Prerenders one card per date that has a contest, exactly like the page beside it. Next's metadata
 * route loader re-exports every userland named export except `default`, `generateSitemaps` and
 * `dynamicParams`, so this is honoured here the same way it is in `/game/[id]/opengraph-image`.
 * Without it the route is the site's only `ƒ` (server-rendered on demand).
 */
export function generateStaticParams(): { date: string }[] {
  return scoresStaticParams();
}

/**
 * `dynamicParams` cannot reach a metadata route — Next's metadata-route loader filters it out of
 * the re-exported config — so an unknown param still reaches this handler. It answers the way the
 * page beside it does, with a 404: rendering a generic card instead handed crawlers an unbounded
 * set of 200-OK image URLs whose pages do not exist.
 */
export default async function Image({ params }: PageProps<'/scores/[date]'>) {
  const { date } = await params;
  if (!scoresParam(date)) notFound();
  return ogPng(<ScoresDayCard model={dayCardModel(date)} />);
}

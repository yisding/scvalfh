import { notFound } from 'next/navigation';

import { GAME_CARD_ALT, GameCard } from '@/components/og/GameCard';
import { ogPng } from '@/components/og/png';
import { gameStaticParams } from '@/views/game/game-route';
import { buildGameView, buildSupersededStub } from '@/views/game/game-view';
import { OG_CONTENT_TYPE, OG_SIZE } from '@/views/site/og-theme';

/**
 * The per-game OG card (DESIGN §1.1, §3.5), drawn by components/og/GameCard.tsx.
 *
 * TEXT ONLY, like every other card on this site: no logo file, no school colors, no third-party
 * image request — the same constraint that made `TeamMonogram` a color square rather than a
 * hotlinked mascot (DESIGN §12.4). The one job is that a link pasted into a group text previews the
 * LINE SCORE itself.
 *
 * The numbers are `SideView.glyph` from the shared model, which comes from `describeGame()`, so a
 * game with no reported score shows two en dashes on the card exactly as it does on the page. A
 * scheduled game shows the start time in the score column instead of a number, never a `0`.
 *
 * Params are EXACTLY the page's (`gameStaticParams`: `gameIdToParam`, so a si.com game is
 * `/game/sblive-<n>/opengraph-image`, never a raw `sblive:<n>` path, plus the superseded stubs,
 * whose card is the MaxPreps game's). The kicker names the league (`BVAL · Santa Teresa`,
 * `Non-league`, `MCAL semifinal`), and a si.com score says `Score via si.com` (SPEC §8.4).
 *
 * The record under each name is `GameSideModel.sub` from the same model, so it is the league
 * record AS OF this game (`recordAsOf`, G-1) — a card shared weeks later still shows the record
 * that went with that score, exactly as the page does. A regular-season non-league game shows each
 * side's current league record instead.
 */

export const alt = GAME_CARD_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams(): Array<{ id: string }> {
  return gameStaticParams();
}

/**
 * `dynamicParams` cannot reach a metadata route — Next's metadata-route loader filters it out of
 * the re-exported config — so an unknown param still reaches this handler. It answers the way the
 * page beside it does, with a 404: rendering a generic card instead handed crawlers an unbounded
 * set of 200-OK image URLs whose pages do not exist.
 */
export default async function Image({ params }: PageProps<'/game/[id]'>) {
  const { id } = await params;
  // buildGameView guards with gameParam (views/game/game-route.ts), which runs paramToGameId before
  // any accessor that can throw (SPEC §8.1); a superseded stub's card is its MaxPreps game's.
  const model = buildGameView(id) ?? buildSupersededStub(id)?.targetModel;
  if (!model) notFound();
  return ogPng(<GameCard model={model} />);
}

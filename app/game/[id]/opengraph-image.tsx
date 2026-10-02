import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';

import { buildGameModel, gameKicker } from '@/components/game/game-model';
import { SITE_NAME } from '@/components/layout/site-url';
import { getGames } from '@/lib/data';
import { dateWithYear, timeOfDayPT } from '@/lib/format';

/**
 * The per-game OG card (DESIGN §1.1, §3.5).
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
 * The record under each name is `GameSideModel.sub` from the same model, so it is the league
 * record AS OF this game (`recordAsOf`, G-1) — a card shared weeks later still shows the record
 * that went with that score, exactly as the page does.
 */

export const alt = `${SITE_NAME} — game score card`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams(): Array<{ id: string }> {
  return getGames().map((game) => ({ id: game.contestId }));
}

const INK = '#f2f5f8';
const INK_2 = '#aab4bf';
const INK_3 = '#919ba5';
const RULE = '#3d444d';
const BG = '#0b0d10';

/**
 * `dynamicParams` cannot reach a metadata route — Next's metadata-route loader filters it out of
 * the re-exported config — so an unknown param still reaches this handler. It answers the way the
 * page beside it does, with a 404: rendering a generic card instead handed crawlers an unbounded
 * set of 200-OK image URLs whose pages do not exist.
 */
export default async function Image({ params }: PageProps<'/game/[id]'>) {
  const { id } = await params;
  const model = buildGameModel(id);
  if (!model) notFound();

  const { game, away, home, display } = model;
  const sides = [away, home];
  const when = game.isTimeTba
    ? `${dateWithYear(game.dateLocal)} · time TBA`
    : `${dateWithYear(game.dateLocal)} · ${timeOfDayPT(game.dateLocal)}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: BG,
          color: INK,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 24,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: INK_3,
            }}
          >
            {gameKicker(model)}
          </div>
          <div style={{ display: 'flex', marginTop: 10, height: 2, background: RULE }} />
        </div>

        {/* Away over home — the same order as every list and the scoreboard on the page. */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {sides.map((side, index) => (
            <div
              key={side.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 32,
                paddingTop: index === 0 ? 0 : 18,
                paddingBottom: index === 0 ? 18 : 0,
                borderBottom: index === 0 ? `1px solid ${RULE}` : 'none',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 60,
                    fontWeight: side.view.weight === 'winner' ? 700 : 400,
                    color: side.view.weight === 'loser' ? INK_2 : INK,
                  }}
                >
                  {side.label}
                </div>
                {side.sub ? (
                  <div style={{ display: 'flex', marginTop: 8, fontSize: 26, color: INK_3 }}>
                    {side.sub}
                  </div>
                ) : null}
              </div>
              {/* No score column at all on a game that has none — the status is in the kicker. */}
              {display.showScores ? (
                <div
                  style={{
                    display: 'flex',
                    fontSize: 96,
                    fontWeight: side.view.weight === 'winner' ? 700 : 400,
                    color: side.view.hasScore
                      ? side.view.weight === 'loser'
                        ? INK_2
                        : INK
                      : INK_3,
                  }}
                >
                  {side.view.glyph}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', color: INK_3, fontSize: 22 }}>
          <div style={{ display: 'flex' }}>{when}</div>
          <div style={{ display: 'flex', marginTop: 6 }}>
            {SITE_NAME} · unofficial · data from MaxPreps
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}

import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';

import { buildJvGameView, jvGameStaticParams } from '../../../../components/jv/jv-game-view';
import { OG, OG_SIZE } from '../../../../components/metadata/og-theme';
import { SITE_NAME } from '../../../../components/layout/site';
import { isOfficialJvContestId } from '../../../../lib/jv/jv-official';

/**
 * A JV game's OG card: the varsity card (app/game/[id]/opengraph-image.tsx) with the JV competition as its
 * kicker, "JV" after each name and each JV team's record under it, text only. Params are exactly the page's.
 */

/** The card's source words: where the score came from. */
function ogSourceWords(game: { provenance: { scores: string }; contestId: string }): string {
  if (game.provenance.scores === 'sblive') return 'Score via si.com';
  if (game.provenance.scores === 'school-site') return 'Score via the school’s athletics site';
  if (isOfficialJvContestId(game.contestId)) return 'listed from the league schedule';
  return 'data from MaxPreps';
}

export const alt = `${SITE_NAME} — JV game score card`;
export const size = OG_SIZE;
export const contentType = 'image/png';

export function generateStaticParams(): Array<{ id: string }> {
  return jvGameStaticParams();
}

/**
 * `dynamicParams` cannot reach a metadata route — Next's metadata-route loader filters it out of
 * the re-exported config — so an unknown param still reaches this handler. It answers the way the
 * page beside it does, with a 404: rendering a generic card instead handed crawlers an unbounded
 * set of 200-OK image URLs whose pages do not exist.
 */
export default async function Image({ params }: PageProps<'/jv/game/[id]'>) {
  const { id } = await params;
  const model = buildJvGameView(id);
  if (!model) notFound();

  const { game, away, home, display } = model;
  const sides = [away, home];
  const when = model.whenLabel;

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
          background: OG.BG,
          color: OG.TEXT,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 26,
              color: OG.TEXT_3,
            }}
          >
            {/* The status first, as the varsity card's kicker (gameKicker): a postponed game must not read as one to come. */}
            {`${display.statusLabel} · ${model.competition.name} · ${model.countsAs.label}`}
          </div>
          <div style={{ display: 'flex', marginTop: 10, height: 2, background: OG.RULE }} />
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
                borderBottom: index === 0 ? `1px solid ${OG.RULE}` : 'none',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 60,
                    fontWeight: side.view.weight === 'winner' ? 700 : 400,
                    color: side.view.weight === 'loser' ? OG.TEXT_2 : OG.TEXT,
                  }}
                >
                  {side.jvLabel}
                </div>
                {side.sub ? (
                  <div style={{ display: 'flex', marginTop: 8, fontSize: 26, color: OG.TEXT_3 }}>
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
                        ? OG.TEXT_2
                        : OG.TEXT
                      : OG.TEXT_3,
                  }}
                >
                  {side.view.glyph}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', color: OG.TEXT_3, fontSize: 22 }}>
          <div style={{ display: 'flex' }}>{when}</div>
          <div style={{ display: 'flex', marginTop: 6 }}>
            {`${SITE_NAME} · unofficial · ${ogSourceWords(game)}`}
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}

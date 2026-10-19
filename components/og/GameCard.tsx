import type { GameView } from '@/views/game/game-view';
import { gameCardWhen, gameKicker } from '@/views/game/titles';
import { OG } from '@/views/site/og-theme';
import { SITE_NAME } from '@/views/site/site';

import { OgFrame, OgKicker, OgRule } from './primitives';

/** The game card's alt (app/game/[id]/opengraph-image.tsx `alt`): static, so it names the kind of card. */
export const GAME_CARD_ALT = `${SITE_NAME} — game score card`;

/**
 * The per-game OG card (DESIGN §1.1, §3.5; route: app/game/[id]/opengraph-image.tsx): the kicker,
 * away over home with each side's record and score, then the date line and the provenance line.
 *
 * The numbers are `SideView.glyph` from the shared model, which comes from `describeGame()`, so a
 * game with no reported score shows two en dashes on the card exactly as it does on the page. A
 * scheduled game shows no score column at all; the status is in the kicker.
 */
export function GameCard({ model }: { model: GameView }) {
  const { away, home, display } = model;
  const sides = [away, home];
  return (
    <OgFrame padding={72}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <OgKicker size={24}>{gameKicker(model)}</OgKicker>
        <OgRule marginTop={10} />
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
                {side.label}
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
        <div style={{ display: 'flex' }}>{gameCardWhen(model)}</div>
        <div style={{ display: 'flex', marginTop: 6 }}>
          {model.source ? `${SITE_NAME} · unofficial · Score via si.com` : `${SITE_NAME} · unofficial · data from MaxPreps`}
        </div>
      </div>
    </OgFrame>
  );
}

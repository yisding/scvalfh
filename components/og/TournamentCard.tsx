import type { TournamentCardModel } from '@/views/playoffs/tournament';
import { OG } from '@/views/site/og-theme';
import { SITE_NAME } from '@/views/site/site';

import { OgFrame, OgRule, OgTitle } from './primitives';

/**
 * The tournament card's alt (app/playoffs/[league]/opengraph-image.tsx `alt`). Static: a
 * per-league alt would need `generateImageMetadata`, which changes the image URL shape.
 */
export const TOURNAMENT_CARD_ALT = 'League tournament card: the seeds from the league table and the round dates';

/**
 * The `/playoffs/<league>` OG card (SPEC §8.4; model: views/playoffs/tournament.ts
 * `tournamentCardModel`): "MCAL tournament", the six seeds in two columns, the round dates.
 * TEXT ONLY, like every card on this site (DESIGN §12.4).
 */
export function TournamentCard({ model }: { model: TournamentCardModel }) {
  const { seeds, rounds } = model;
  return (
    <OgFrame padding={64}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <OgTitle size={60}>{model.name}</OgTitle>
        <div style={{ display: 'flex', marginTop: 8, fontSize: 28, color: OG.TEXT_3 }}>{model.sub}</div>
        <OgRule marginTop={16} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {seeds.length === 0 ? (
          <div style={{ display: 'flex', fontSize: 36, color: OG.TEXT_3 }}>No league results yet</div>
        ) : (
          seeds.map((s) => (
            <div key={s.seed} style={{ display: 'flex', width: '50%', paddingTop: 12, fontSize: 36 }}>
              <div style={{ display: 'flex', width: 48, color: OG.TEXT_3 }}>{s.seed}</div>
              <div style={{ display: 'flex' }}>{s.names}</div>
            </div>
          ))
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 26, color: OG.TEXT }}>{rounds.join(' · ')}</div>
        <div style={{ display: 'flex', marginTop: 8, fontSize: 22, color: OG.TEXT_3 }}>
          {SITE_NAME} · {model.shortName} · unofficial
        </div>
      </div>
    </OgFrame>
  );
}

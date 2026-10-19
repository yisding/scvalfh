import { EN_DASH, gameWord, plural } from '@/lib/format/words';
import type { DayCardModel } from '@/views/scores/day-card';
import { OG } from '@/views/site/og-theme';
import { SITE_NAME } from '@/views/site/site';

import { OgFrame, OgKicker, OgRule, OgTitle } from './primitives';

/** The day card's alt (app/scores/[date]/opengraph-image.tsx `alt`). */
export const SCORES_DAY_CARD_ALT = 'One day of girls varsity field hockey scores';

/**
 * The per-date OG card (DESIGN §3.4; model: views/scores/day-card.ts): the `<site> · scores`
 * kicker, the date's title, up to four game lines (a non-league game flagged `NL`, a game with no
 * score showing its status instead), `+ <n> more games`, and the counts footer.
 */
export function ScoresDayCard({ model }: { model: DayCardModel }) {
  const { heading, lines, remaining, total, finals } = model;
  return (
    <OgFrame padding={72}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <OgKicker size={26}>{SITE_NAME} &middot; scores</OgKicker>
        <OgRule marginTop={8} />
        <OgTitle size={48} marginTop={20}>
          {heading}
        </OgTitle>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
        {lines.length === 0 ? (
          <div style={{ display: 'flex', fontSize: 34, color: OG.TEXT_2 }}>
            Nothing is scheduled for this date.
          </div>
        ) : (
          lines.map((line) => (
            <div
              key={line.contestId}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                borderTop: `1px solid ${OG.BORDER}`,
                paddingTop: 10,
                fontSize: 30,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', color: OG.TEXT }}>
                {line.awayName} {line.versus} {line.homeName}
                {line.isNonLeague ? (
                  <div
                    style={{
                      display: 'flex',
                      marginLeft: 12,
                      fontSize: 20,
                      letterSpacing: 2,
                      color: OG.TEXT_3,
                    }}
                  >
                    NL
                  </div>
                ) : null}
              </div>
              <div
                style={{
                  display: 'flex',
                  marginLeft: 32,
                  color: line.showScores ? OG.TEXT : OG.TEXT_3,
                  fontWeight: line.showScores ? 600 : 400,
                  fontSize: line.showScores ? 34 : 24,
                  textTransform: line.showScores ? 'none' : 'uppercase',
                  letterSpacing: line.showScores ? 0 : 2,
                }}
              >
                {line.showScores
                  ? `${line.awayGlyph} ${EN_DASH} ${line.homeGlyph}`
                  : line.statusLabel}
              </div>
            </div>
          ))
        )}
        {remaining > 0 ? (
          <div style={{ display: 'flex', fontSize: 24, color: OG.TEXT_3 }}>
            + {remaining} more {gameWord(remaining)}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          marginTop: 20,
          borderTop: `2px solid ${OG.RULE}`,
          paddingTop: 12,
          fontSize: 22,
          color: OG.TEXT_3,
        }}
      >
        {total} {gameWord(total)} &middot; {plural(finals, 'final score')} &middot; unofficial
        &middot; data from MaxPreps and si.com
      </div>
    </OgFrame>
  );
}

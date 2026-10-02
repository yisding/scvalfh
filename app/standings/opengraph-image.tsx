import { ImageResponse } from 'next/og';

import { SITE_NAME } from '@/components/layout/site-url';
import { formatStamp, shortDate } from '@/lib/format';

import { getStandingsPageData } from './standings-data';

/**
 * The /standings OG card.
 *
 * TEXT ONLY, like every card on this site: no logo file, no school colors and no third-party image
 * request (DESIGN §12.4). It carries the top three of each division with their points, because the
 * automatic-qualifier line is exactly where the standings become news — Article VII §2 gives the
 * first three in each division an AQ — and a link preview has room for nothing else.
 *
 * A shared place prints as `T3`, the US sports-page mark the tables use: Article VI §7 ends in a
 * coin flip we cannot compute, and a card that silently picked a winner would be the one place on
 * the site that lies.
 */
export const alt = `${SITE_NAME} — De Anza and El Camino standings`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const INK = '#f2f5f8';
const MUTED = '#919ba5';
const DIM = '#aab4bf';
const RULE = '#3d444d';

export default function StandingsOpengraphImage() {
  const { asOf, views } = getStandingsPageData();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 64,
          background: '#0b0d10',
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
              color: MUTED,
            }}
          >
            SCVAL girls varsity field hockey
          </div>
          <div style={{ display: 'flex', marginTop: 8, height: 2, background: RULE }} />
          <div style={{ display: 'flex', marginTop: 20, fontSize: 56, fontWeight: 600 }}>
            Standings
          </div>
          <div style={{ display: 'flex', marginTop: 8, fontSize: 24, color: DIM }}>
            3 points a win, 1 a tie &middot; league games only
            {views[0]?.throughDate ? ` · through ${shortDate(views[0].throughDate)}` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 40 }}>
          {views.map((view) => {
            const top = view.rows
              .filter((row) => row.standing.hasReportedResults)
              .slice(0, 3);
            return (
              <div
                key={view.division}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  borderTop: `2px solid ${RULE}`,
                  paddingTop: 16,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    fontSize: 22,
                    letterSpacing: 4,
                    textTransform: 'uppercase',
                    color: MUTED,
                  }}
                >
                  {view.label}
                </div>
                {top.length === 0 ? (
                  <div style={{ display: 'flex', marginTop: 12, fontSize: 30, color: DIM }}>
                    No league results yet
                  </div>
                ) : (
                  top.map((row) => {
                    const place = row.standing.computed.place;
                    return (
                      <div
                        key={row.team.id}
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 14,
                          marginTop: 14,
                        }}
                      >
                        <div style={{ display: 'flex', fontSize: 26, color: MUTED, width: 44 }}>
                          {row.standing.tiebreak.shared ? 'T' : ''}
                          {place}
                        </div>
                        <div style={{ display: 'flex', fontSize: 34, fontWeight: 600 }}>
                          {row.team.shortName}
                        </div>
                        <div style={{ display: 'flex', fontSize: 24, color: DIM }}>
                          {row.standing.computed.pts} pts &middot;{' '}
                          {row.standing.computed.w}-{row.standing.computed.l}-
                          {row.standing.computed.t}
                        </div>
                      </div>
                    );
                  })
                )}
                <div style={{ display: 'flex', marginTop: 14, fontSize: 20, color: MUTED }}>
                  {top.length === 0
                    ? 'First three qualify automatically for CCS'
                    : 'Top three take a CCS automatic berth · 4th plays in'}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', fontSize: 20, color: MUTED }}>
          As of {formatStamp(asOf)} &middot; unofficial &middot; computed from MaxPreps results
        </div>
      </div>
    ),
    { ...size },
  );
}

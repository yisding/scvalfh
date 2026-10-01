import { ImageResponse } from 'next/og';

import { SITE_NAME } from '@/components/layout/site-url';
import { getAllStandings, getFetchedAt, getTeamById } from '@/lib/data';
import { DIVISION_LABELS } from '@/lib/season';
import { formatStamp, recordString } from '@/lib/format';
import type { Division } from '@/lib/types';

/**
 * The root OG card (DESIGN §1.1). TEXT ONLY: no logo file, no school colors and no third-party
 * image request — the same constraint that made TeamMonogram a color square instead of a hotlinked
 * mascot. It names both division leaders, because that is the one fact a link preview can carry.
 *
 * If a division is tied at the top, BOTH teams are named: By-Laws Article VI §2 — "if there is a
 * tie at the top both teams shall be declared division champions".
 */
export const alt = `${SITE_NAME} — 2026 standings, scores and CCS playoffs`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function leadersFor(division: Division) {
  const rows = getAllStandings()[division].filter((s) => s.hasReportedResults);
  const top = rows.filter((s) => s.computed.place === 1);
  return top.map((s) => {
    const team = getTeamById(s.teamId);
    return {
      // shortName, not name: "St. Ignatius College Preparatory" wraps to three lines at 1200px.
      name: team?.shortName ?? s.slug,
      record: recordString(s.computed),
      pts: s.computed.pts,
    };
  });
}

export default function OpengraphImage() {
  const divisions: Division[] = ['de-anza', 'el-camino'];
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
          background: '#0b0d10',
          color: '#f2f5f8',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 26,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: '#919ba5',
            }}
          >
            SCVAL girls varsity field hockey
          </div>
          <div style={{ display: 'flex', marginTop: 8, height: 2, background: '#3d444d' }} />
          <div style={{ display: 'flex', marginTop: 28, fontSize: 68, fontWeight: 600 }}>
            Fall 2026 scores &amp; standings
          </div>
        </div>

        <div style={{ display: 'flex', gap: 48 }}>
          {divisions.map((division) => {
            const leaders = leadersFor(division);
            return (
              <div
                key={division}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                  borderTop: '2px solid #3d444d',
                  paddingTop: 20,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    fontSize: 24,
                    letterSpacing: 4,
                    textTransform: 'uppercase',
                    color: '#919ba5',
                  }}
                >
                  {DIVISION_LABELS[division]}
                </div>
                {leaders.length === 0 ? (
                  <div style={{ display: 'flex', marginTop: 12, fontSize: 34, color: '#aab4bf' }}>
                    No results yet
                  </div>
                ) : (
                  leaders.map((leader) => (
                    <div
                      key={leader.name}
                      style={{ display: 'flex', flexDirection: 'column', marginTop: 14 }}
                    >
                      <div style={{ display: 'flex', fontSize: 44, fontWeight: 600 }}>
                        {leader.name}
                      </div>
                      <div style={{ display: 'flex', marginTop: 6, fontSize: 28, color: '#aab4bf' }}>
                        {leader.record} &middot; {leader.pts} pts
                      </div>
                    </div>
                  ))
                )}
                {leaders.length > 1 ? (
                  <div style={{ display: 'flex', marginTop: 8, fontSize: 22, color: '#919ba5' }}>
                    Tied at the top — both are division champions (Article VI §2)
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', fontSize: 22, color: '#919ba5' }}>
          As of {formatStamp(getFetchedAt())} &middot; unofficial &middot; data from MaxPreps
        </div>
      </div>
    ),
    { ...size },
  );
}

import { ImageResponse } from 'next/og';

import { OG, OG_SIZE } from '../../components/layout/og-theme';
import { SITE_NAME } from '../../components/layout/site';
import { buildStandingsOverviewView } from '../../components/standings/standings-page-view';
import { leaderClause } from '../../components/standings/standings-view';
import { getTeams } from '../../lib/data';
import { shortDate } from '../../lib/format';

/**
 * The /standings OG card (SPEC §8.4): "Standings — every league", then one row per league —
 * `SCVAL  De Anza: St Ignatius 18 pts · El Camino: Los Gatos 21 pts` (short name and points;
 * co-leaders at most two names joined with " & ", then ` +<n>`; `No league results yet` before a
 * league's first result).
 *
 * TEXT ONLY, like every card on this site: no logo file, no school colors and no third-party image
 * request (DESIGN §12.4). Division labels only through `divisionHeading()` (the summaries' own
 * `heading`): the single-division leagues print none.
 */
export const alt = `${SITE_NAME} — standings for every league: each division’s leaders with points`;
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function StandingsOpengraphImage() {
  const { leaders, leagues, throughDate } = buildStandingsOverviewView();
  const teamCount = getTeams().length;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          // Five league rows (EAL added): less vertical padding keeps the footer clear of the last
          // row, with room for a row that wraps.
          padding: '48px 64px',
          background: OG.BG,
          color: OG.TEXT,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 24, letterSpacing: 4, textTransform: 'uppercase', color: OG.TEXT_3 }}>
            {SITE_NAME}
          </div>
          <div style={{ display: 'flex', marginTop: 8, height: 2, background: OG.RULE }} />
          <div style={{ display: 'flex', marginTop: 20, fontSize: 56, fontWeight: 600 }}>
            Standings — every league
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {leaders.map(({ league, lines }) => (
            <div
              key={league.id}
              style={{ display: 'flex', alignItems: 'baseline', gap: 24, borderTop: `1px solid ${OG.RULE}`, paddingTop: 10 }}
            >
              <div style={{ display: 'flex', width: 120, fontSize: 30, fontWeight: 600 }}>{league.shortName}</div>
              <div style={{ display: 'flex', flex: 1, fontSize: 26, color: OG.TEXT_2 }}>{leaderClause(lines)}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', fontSize: 20, color: OG.TEXT_3 }}>
          {leagues.length} leagues &middot; {teamCount} teams
          {throughDate ? ` · results through ${shortDate(throughDate)}` : ''} &middot; unofficial
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}

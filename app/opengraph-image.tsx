import { ImageResponse } from 'next/og';

import { OG, OG_SIZE } from '../components/layout/og-theme';
import { ROOT_OG_ALT, SITE_NAME } from '../components/layout/site';
import { leaderLine } from '../components/standings/standings-page-view';
import { leaderClause } from '../components/standings/standings-view';
import { getLatestResultsDate, getLeagueSummaries, getTeams } from '../lib/data';
import { shortDate } from '../lib/format';
import { SEASON_CALENDAR_YEAR } from '../lib/season';

/**
 * The root OG card (SPEC §8.4). TEXT ONLY: no logo file, no school colors and no third-party image
 * request — the same constraint that made TeamMonogram a color square instead of a hotlinked mascot.
 *
 * One row per league, config order: `SCVAL  De Anza: St Ignatius 18 pts · El Camino: Los Gatos 21
 * pts` — the leader(s) of each division with their points. A single-division league has no
 * division label (`PCAL  Stevenson 18 pts`). Co-leaders: at most two names joined with " & ", then
 * ` +<n>`. A league with no counted result reads `No league results yet`. No league hue. The row
 * is the /standings card's own (standings-view's `leaderClause` over standings-page-view's
 * `leaderLine`), so the two cards cannot word a league's leaders differently.
 *
 * Five rows have to fit between the title and the footer at 1200×630: 56px top and bottom padding
 * and 10px row padding keep the footer on the card with up to three of the five rows wrapping to
 * a second line (BVAL's two divisions with co-leaders already do). Rendered and checked at five
 * rows, on the live snapshot and with three rows wrapped.
 */
export const alt = ROOT_OG_ALT;
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function OpengraphImage() {
  const leagues = getLeagueSummaries();
  const through = getLatestResultsDate();
  const rows = leagues.map((league) => ({
    id: league.id,
    shortName: league.shortName,
    text: leaderClause(league.divisions.map((d) => leaderLine(d.id, d.heading))),
  }));
  const footer = `${leagues.length} leagues · ${getTeams().length} teams · ${
    through ? `results through ${shortDate(through)}` : 'no results yet'
  }`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px 72px',
          background: OG.BG,
          color: OG.TEXT,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 56, fontWeight: 600 }}>{`${SITE_NAME} · ${SEASON_CALENDAR_YEAR}`}</div>
          <div style={{ display: 'flex', marginTop: 16, height: 2, background: OG.RULE }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((row) => (
            <div
              key={row.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                paddingTop: 10,
                paddingBottom: 10,
                borderBottom: `1px solid ${OG.RULE}`,
              }}
            >
              <div style={{ display: 'flex', width: 170, flexShrink: 0, fontSize: 32, lineHeight: 1.15, fontWeight: 600 }}>
                {row.shortName}
              </div>
              <div style={{ display: 'flex', flex: 1, fontSize: 28, lineHeight: 1.3, color: '#d5dbe1' }}>{row.text}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', fontSize: 24, color: OG.TEXT_3 }}>
          {footer} &middot; unofficial
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}

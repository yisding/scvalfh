import { ImageResponse } from 'next/og';

import { leagueRowText } from '@/components/home/home-data';
import { SITE_NAME } from '@/components/layout/site';
import { getLatestResultsDate, getLeagueSummaries, getTeams } from '@/lib/data';
import { shortDate } from '@/lib/format';

/**
 * The root OG card (SPEC §8.4). TEXT ONLY: no logo file, no school colors and no third-party image
 * request — the same constraint that made TeamMonogram a color square instead of a hotlinked mascot.
 *
 * One row per league, config order: `SCVAL  De Anza: St Ignatius 18 pts · El Camino: Los Gatos 21
 * pts` — the leader(s) of each division with their points. A single-division league has no
 * division label (`PCAL  Stevenson 18 pts`). Co-leaders: at most two names joined with " & ", then
 * ` +<n>`. A league with no counted result reads `No league results yet`. No league hue.
 *
 * Five rows have to fit between the title and the footer at 1200×630: 56px top and bottom padding
 * and 10px row padding keep the footer on the card with up to three of the five rows wrapping to
 * a second line (BVAL's two divisions with co-leaders already do). Rendered and checked at five
 * rows, on the live snapshot and with three rows wrapped.
 */
export const alt = `${SITE_NAME} — 2026 standings, scores and playoffs`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  const leagues = getLeagueSummaries();
  const through = getLatestResultsDate();
  const rows = leagues.map((league) => ({
    id: league.id,
    shortName: league.shortName,
    text: leagueRowText(league.divisions),
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
          background: '#0b0d10',
          color: '#f2f5f8',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 56, fontWeight: 600 }}>{SITE_NAME} · 2026</div>
          <div style={{ display: 'flex', marginTop: 16, height: 2, background: '#3d444d' }} />
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
                borderBottom: '1px solid #3d444d',
              }}
            >
              <div style={{ display: 'flex', width: 170, flexShrink: 0, fontSize: 32, lineHeight: 1.15, fontWeight: 600 }}>
                {row.shortName}
              </div>
              <div style={{ display: 'flex', flex: 1, fontSize: 28, lineHeight: 1.3, color: '#d5dbe1' }}>{row.text}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', fontSize: 24, color: '#919ba5' }}>
          {footer} &middot; unofficial
        </div>
      </div>
    ),
    { ...size },
  );
}

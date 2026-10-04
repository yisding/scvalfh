import { ImageResponse } from 'next/og';

import { SITE_WORDMARK } from '../../../components/layout/site-url';
import { getFetchedAt, getLastLeagueResultDate, getLeagueSummary, getStandings, getTeams } from '../../../lib/data';
import { formatStamp, shortDate } from '../../../lib/format';

/**
 * The league standings card (SPEC §8.4), shared by `/standings/<league>` and
 * `/schedule/<league>`: `<SHORT> standings · through <date>`, then each division's top 4 with PTS
 * and W-L-T (a single-division league: one column, top 6), or `No league results yet`.
 *
 * TEXT ONLY, like every card on this site: no logo file, no school colors and no third-party image
 * request (DESIGN §12.4). A shared place prints as `T3`, the US sports-page mark the tables use:
 * the league's last step is the league's to run, and a card that silently picked a winner would be
 * the one place on the site that lies.
 * Division labels come only from `divisionHeading()` (via the league summary): PCAL and MCAL get
 * none.
 */
const CARD_SIZE = { width: 1200, height: 630 };

const INK = '#f2f5f8';
const MUTED = '#919ba5';
const DIM = '#aab4bf';
const RULE = '#3d444d';

export function leagueStandingsCard(leagueId: string): ImageResponse {
  const league = getLeagueSummary(leagueId);
  if (!league) throw new Error(`app/standings/[league]/og-card.tsx: unknown league ${leagueId}`);
  const teams = getTeams();
  const single = league.divisions.length === 1;
  const through = getLastLeagueResultDate({ league: league.id });
  const columns = league.divisions.map((d) => ({
    id: d.id,
    heading: d.heading,
    rows: getStandings(d.id)
      .filter((s) => s.hasReportedResults)
      .slice(0, single ? 6 : 4)
      .map((s) => ({
        id: s.teamId,
        place: `${s.tiebreak.shared ? 'T' : ''}${s.computed.place}`,
        name: teams.find((t) => t.id === s.teamId)?.shortName ?? s.slug,
        pts: s.computed.pts,
        record: `${s.computed.w}-${s.computed.l}-${s.computed.t}`,
      })),
  }));

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
          <div style={{ display: 'flex', fontSize: 24, letterSpacing: 4, textTransform: 'uppercase', color: MUTED }}>
            {SITE_WORDMARK} &middot; {league.name}
          </div>
          <div style={{ display: 'flex', marginTop: 8, height: 2, background: RULE }} />
          <div style={{ display: 'flex', marginTop: 20, fontSize: 52, fontWeight: 600 }}>
            {league.shortName} standings{through ? ` · through ${shortDate(through)}` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 40 }}>
          {columns.map((column) => (
            <div
              key={column.id}
              style={{ display: 'flex', flexDirection: 'column', flex: 1, borderTop: `2px solid ${RULE}`, paddingTop: 14 }}
            >
              {column.heading ? (
                <div style={{ display: 'flex', fontSize: 22, letterSpacing: 4, textTransform: 'uppercase', color: MUTED }}>
                  {column.heading}
                </div>
              ) : null}
              {column.rows.length === 0 ? (
                <div style={{ display: 'flex', marginTop: 12, fontSize: 30, color: DIM }}>No league results yet</div>
              ) : (
                column.rows.map((row) => (
                  <div key={row.id} style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: single ? 8 : 12 }}>
                    <div style={{ display: 'flex', fontSize: 24, color: MUTED, width: 44 }}>{row.place}</div>
                    <div style={{ display: 'flex', fontSize: single ? 30 : 32, fontWeight: 600 }}>{row.name}</div>
                    <div style={{ display: 'flex', fontSize: 22, color: DIM }}>
                      {row.pts} pts &middot; {row.record}
                    </div>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', fontSize: 20, color: MUTED }}>
          As of {formatStamp(getFetchedAt())} &middot; league games only &middot; unofficial
        </div>
      </div>
    ),
    { ...CARD_SIZE },
  );
}

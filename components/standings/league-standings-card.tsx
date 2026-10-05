import { ImageResponse } from 'next/og';

import { OG, OG_SIZE } from '../layout/og-theme';
import { SITE_WORDMARK } from '../layout/site';
import { getFetchedAt, getLastLeagueResultDate, getLeagueSummary, getStandings, getTeams } from '../../lib/data';
import { formatStamp, recordString, shortDate } from '../../lib/format';

/**
 * The alt both routes that render this card export (`export const alt = LEAGUE_STANDINGS_CARD_ALT`):
 * the same card, so the same words. Static, because a per-league alt would need
 * `generateImageMetadata`, which changes the image URL shape.
 */
export const LEAGUE_STANDINGS_CARD_ALT = 'League standings card: each division’s leaders with points and W-L-T';

/**
 * The league standings card (SPEC §8.4), shared by `/standings/<league>` and
 * `/schedule/<league>`: `<SHORT> standings · through <date>`, then each division's top 4 with PTS
 * and W-L-T (a single-division league: one column, top 6), or `No league results yet`.
 *
 * TEXT ONLY, like every card on this site: no logo file, no school colors and no third-party image
 * request (DESIGN §12.4). A shared place prints as `T3`, the US sports-page mark the tables use:
 * the league's last step is the league's to run, and a card that silently picked a winner would be
 * the one place on the site that lies.
 * Division labels come only from `divisionHeading()` (via the league summary): a single-division
 * league (PCAL, MCAL, EAL) gets none.
 */
export function leagueStandingsCard(leagueId: string): ImageResponse {
  const league = getLeagueSummary(leagueId);
  if (!league) throw new Error(`components/standings/league-standings-card.tsx: unknown league ${leagueId}`);
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
        record: recordString(s.computed),
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
          background: OG.BG,
          color: OG.TEXT,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 24, letterSpacing: 4, textTransform: 'uppercase', color: OG.TEXT_3 }}>
            {SITE_WORDMARK} &middot; {league.name}
          </div>
          <div style={{ display: 'flex', marginTop: 8, height: 2, background: OG.RULE }} />
          <div style={{ display: 'flex', marginTop: 20, fontSize: 52, fontWeight: 600 }}>
            {league.shortName} standings{through ? ` · through ${shortDate(through)}` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 40 }}>
          {columns.map((column) => (
            <div
              key={column.id}
              style={{ display: 'flex', flexDirection: 'column', flex: 1, borderTop: `2px solid ${OG.RULE}`, paddingTop: 14 }}
            >
              {column.heading ? (
                <div style={{ display: 'flex', fontSize: 22, letterSpacing: 4, textTransform: 'uppercase', color: OG.TEXT_3 }}>
                  {column.heading}
                </div>
              ) : null}
              {column.rows.length === 0 ? (
                <div style={{ display: 'flex', marginTop: 12, fontSize: 30, color: OG.TEXT_2 }}>No league results yet</div>
              ) : (
                column.rows.map((row) => (
                  <div key={row.id} style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: single ? 8 : 12 }}>
                    <div style={{ display: 'flex', fontSize: 24, color: OG.TEXT_3, width: 44 }}>{row.place}</div>
                    <div style={{ display: 'flex', fontSize: single ? 30 : 32, fontWeight: 600 }}>{row.name}</div>
                    <div style={{ display: 'flex', fontSize: 22, color: OG.TEXT_2 }}>
                      {row.pts} pts &middot; {row.record}
                    </div>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', fontSize: 20, color: OG.TEXT_3 }}>
          As of {formatStamp(getFetchedAt())} &middot; league games only &middot; unofficial
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}

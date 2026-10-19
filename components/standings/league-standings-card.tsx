import { ImageResponse } from 'next/og';

import { OG, OG_SIZE } from '@/components/layout/og-theme';
import { SITE_WORDMARK } from '@/components/layout/site';
import { getFetchedAt } from '@/lib/datasets/snapshot';
import { formatStamp, shortDate } from '@/lib/format/dates';
import { placeMark, recordString } from '@/lib/format/numbers';
import { getLastLeagueResultDate } from '@/lib/queries/games';
import { getLeagueSummary } from '@/lib/queries/leagues';
import { getStandings } from '@/lib/queries/standings';
import { getTeams } from '@/lib/queries/teams';

/**
 * The alt both routes that render this card export (`export const alt = LEAGUE_STANDINGS_CARD_ALT`):
 * the same card, so the same words. Static, because a per-league alt would need
 * `generateImageMetadata`, which changes the image URL shape.
 */
export const LEAGUE_STANDINGS_CARD_ALT = 'League standings card: each division’s leaders with points and W-L-T';

/** The card's content box: 1200 less 64 of padding a side. */
const CONTENT_WIDTH = OG_SIZE.width - 2 * 64;

/** A two-division card's column, and a single-division card's one column: 516px. */
const COLUMN_GAP = 40;
const HALF_COLUMN = (CONTENT_WIDTH - COLUMN_GAP) / 2;

/**
 * A row's tracks, by the number of division columns, laid out the way the site's tables are: the
 * place and the stats are fixed tracks that never shrink, and the name takes what is left, on one
 * line (ellipsized past it, never wrapped). A free flex row put each row's stats wherever its name
 * happened to end (65px apart on SCVAL), and on the three-division card (North County) the names
 * and the stats both wrapped, each row grew to two lines and the fourth ran into the footer.
 *
 * One or two columns: place, name, stats on one line. The stats are right-aligned in a 176px track
 * ("33 pts · 11-0-0" in 22px is about 150), so the records end at one x down a column, and a name
 * has 268px: "Valley Christian" in 32px is about 228.
 * Three or more (`stacked`): a 331px column cannot hold all three on a line. On one line at 26px
 * names and 18px stats a name had 155px, and "Canyon Crest", "La Costa Canyon" and "Mission Vista"
 * ellipsized. So there the stats go under the name, at the name's x on every row, and the name has
 * the column less the place: 285px, where "La Costa Canyon" in 26px is about 205. Four such rows
 * (59px each) leave about 30px above the footer.
 */
function rowTracks(divisions: number) {
  if (divisions >= 3) {
    return { stacked: true, gap: 10, rowGap: 6, place: 36, placeTop: 6, placeSize: 18, nameSize: 26, stats: 0, statsSize: 18 };
  }
  return {
    stacked: false,
    gap: 14,
    rowGap: divisions === 1 ? 8 : 12,
    place: 44,
    placeTop: 0,
    placeSize: 24,
    nameSize: divisions === 1 ? 30 : 32,
    stats: 176,
    statsSize: 22,
  };
}

/**
 * The league standings card (SPEC §8.4), shared by `/standings/<league>` and
 * `/schedule/<league>`: `<SHORT> standings · through <date>`, then each division's top 4 with PTS
 * and W-L-T (a single-division league: one column, top 6; three or more divisions: each name over
 * its PTS and W-L-T, see `rowTracks`), or `No league results yet`.
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
        place: placeMark(s.computed.place, s.tiebreak.shared, 'table'),
        name: teams.find((t) => t.id === s.teamId)?.shortName ?? s.slug,
        pts: s.computed.pts,
        record: recordString(s.computed),
      })),
  }));

  const t = rowTracks(league.divisions.length);

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

        <div style={{ display: 'flex', gap: COLUMN_GAP }}>
          {columns.map((column) => (
            <div
              key={column.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                // A single-division league's one column is as wide as a two-division card's, so
                // its stats sit where theirs do rather than 500px of rule away from the names.
                ...(single ? { width: HALF_COLUMN } : { flex: 1, minWidth: 0 }),
                borderTop: `2px solid ${OG.RULE}`,
                paddingTop: 14,
              }}
            >
              {column.heading ? (
                <div style={{ display: 'flex', fontSize: 22, letterSpacing: 4, textTransform: 'uppercase', color: OG.TEXT_3 }}>
                  {column.heading}
                </div>
              ) : null}
              {column.rows.length === 0 ? (
                <div style={{ display: 'flex', marginTop: 12, fontSize: 30, color: OG.TEXT_2 }}>No league results yet</div>
              ) : (
                column.rows.map((row) => {
                  // Satori's flex items do not shrink unless told to (its default `flexShrink` is
                  // 0), so the inline name states `flex` and `minWidth` as well as the ellipsis.
                  // Stacked, the column's stretch gives it the width (a `flex: 1` there would be
                  // a zero-height basis, and `overflow: hidden` drew no name at all).
                  const name = (
                    <div
                      style={{
                        display: 'flex',
                        ...(t.stacked ? {} : { flex: 1, minWidth: 0 }),
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontSize: t.nameSize,
                        fontWeight: 600,
                      }}
                    >
                      {row.name}
                    </div>
                  );
                  const stats = (
                    <div
                      style={{
                        display: 'flex',
                        ...(t.stacked ? {} : { justifyContent: 'flex-end', width: t.stats }),
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                        fontSize: t.statsSize,
                        color: OG.TEXT_2,
                      }}
                    >
                      {row.pts} pts &middot; {row.record}
                    </div>
                  );
                  return (
                    // Stacked, the row is top-aligned and the place drops `placeTop` to sit on the
                    // name's baseline: Satori aligns a column's baseline to its box, not its first line.
                    <div
                      key={row.id}
                      style={{ display: 'flex', alignItems: t.stacked ? 'flex-start' : 'baseline', gap: t.gap, marginTop: t.rowGap }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          width: t.place,
                          flexShrink: 0,
                          paddingTop: t.placeTop,
                          fontSize: t.placeSize,
                          color: OG.TEXT_3,
                        }}
                      >
                        {row.place}
                      </div>
                      {/* Not a fragment for the inline pair: Satori lays a fragment out as one box. */}
                      {t.stacked ? (
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                          {name}
                          {stats}
                        </div>
                      ) : (
                        name
                      )}
                      {t.stacked ? null : stats}
                    </div>
                  );
                })
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

import { buildStandingsOverviewView, leaderLine } from '../standings/standings-page-view';
import { leaderClause, type LeaderLine } from '../standings/standings-view';
import { getLatestResultsDate, getLeagueSummaries, getTeams } from '../../lib/data';
import { shortDate } from '../../lib/format';
import { INDEPENDENT_LEAGUES, LEAGUES_PROPER, REGIONS, isIndependentLeague } from '../../lib/leagues';
import { SEASON_CALENDAR_YEAR } from '../../lib/season';
import type { LeagueId, RegionId } from '../../lib/types';

import { OG, OG_SIZE } from './og-theme';
import { SITE_WORDMARK } from './site';

/**
 * The two-region leaders card shared by the root OG card (app/opengraph-image.tsx) and the /standings
 * card (app/standings/opengraph-image.tsx), DESIGN-socal §2.4 and design-review UI §7.
 *
 * Nine one-per-line league rows no longer fit 1200×630: at the five-league sizes (56px padding, a 56px
 * title, 32px names, 10px row padding) nine single-line rows alone were ≈ 522px against 518px of room,
 * before any row wrapped. So the leagues sit in two region columns side by side (NorCal, then SoCal, in
 * REGIONS order), each under a region heading ('Northern California' / 'Southern California', in the
 * dark theme's text-3 grey), with a smaller title from SITE_WORDMARK (shorter than SITE_NAME, so one
 * line). The design's first sizes (a 44px title, 24px names over a 120px column, 22px text at line height
 * 1.3, 6px row padding, 48px padding) were MEASURED too tall: with every leader line at its longest the
 * root card needed 716px. The sizes below (REGION_CARD) measure 538px for the root card and 567px for the
 * /standings card (its eyebrow line) at the longest lines, rendered by satori/resvg on 2026-10-06
 * (tests/ui/og-region-card.test.ts, which fails above 630). The SoCal column is the taller one: North
 * County's three divisions wrap to four lines. Columns are (1200 − 2 × 56 − 40) / 2 = 524px wide.
 *
 * The row TEXT is still standings-view's `leaderClause` over standings-page-view's `leaderLine`, so the
 * two cards and the /standings metadata can never word a league's leaders differently. A test renders
 * both cards with every division's leader line forced to its longest (the division's two longest short
 * names as co-leaders, "+n", two-digit points) and measures the rendered height
 * (tests/ui/og-region-card.test.ts).
 *
 * TEXT ONLY, like every card on this site: no logo file, no school colors, no third-party image request
 * (DESIGN §12.4), and no league or region hue.
 */

export interface RegionCardRow {
  id: LeagueId;
  shortName: string;
  text: string;
}

export interface RegionCardColumn {
  region: RegionId;
  /** 'Northern California' | 'Southern California'. */
  heading: string;
  rows: RegionCardRow[];
}

/** The card's layout constants (the test reads them to know the budget it checks against). */
export const REGION_CARD = {
  paddingY: 40,
  paddingX: 56,
  columnGap: 40,
  titleSize: 40,
  eyebrowSize: 18,
  regionHeadingSize: 20,
  nameSize: 21,
  nameWidth: 104,
  textSize: 19,
  textLineHeight: 1.25,
  rowPadding: 5,
  footerSize: 19,
} as const;

/** The leader lines per league (config order), grouped into REGIONS order; `lines` overrides for tests. */
export function regionCardColumns(
  linesOf: (leagueId: LeagueId) => readonly LeaderLine[] = (id) => {
    const league = getLeagueSummaries().find((l) => l.id === id);
    return league ? league.divisions.map((d) => leaderLine(d.id, d.heading)) : [];
  },
): RegionCardColumn[] {
  const leagues = getLeagueSummaries();
  return REGIONS.map((region) => ({
    region: region.id,
    heading: region.name,
    // Every table of the region, the Southern Section independents' included (DESIGN §24.10); the group's row is
    // labelled by its division ('Independents'), since its short name is an adjective.
    rows: leagues
      .filter((l) => l.region === region.id)
      .map((l) => ({
        id: l.id,
        shortName: isIndependentLeague(l.id) ? (l.divisions[0]?.label ?? l.shortName) : l.shortName,
        text: leaderClause(linesOf(l.id)),
      })),
  }));
}

/**
 * `9 leagues, 5 independents`: the leagues proper, then the teams in no league (DESIGN §24.9), so a card
 * never counts the independents as a tenth league.
 */
function leagueCountWords(): string {
  const independents = INDEPENDENT_LEAGUES.reduce((n, g) => n + g.divisions.reduce((m, d) => m + d.expectedTeams, 0), 0);
  return `${LEAGUES_PROPER.length} leagues${independents > 0 ? `, ${independents} independents` : ''}`;
}

export interface RegionCardProps {
  /** Small uppercase line above the title (the /standings card's SITE_WORDMARK); none on the root card. */
  eyebrow?: string;
  title: string;
  columns: readonly RegionCardColumn[];
  footer: string;
  /**
   * `'fixed'` (the card): 1200×630 with the footer pushed to the bottom. `'natural'` (tests only): the
   * same blocks stacked at their natural height with the minimum gaps, so a render on a taller canvas
   * shows how much of the 630px the content really needs.
   */
  sizing?: 'fixed' | 'natural';
}

/** The minimum space between the title block, the columns and the footer in `'natural'` sizing. */
export const REGION_CARD_MIN_GAP = 16;

export function RegionCard({ eyebrow, title, columns, footer, sizing = 'fixed' }: RegionCardProps) {
  const C = REGION_CARD;
  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: `${C.paddingY}px ${C.paddingX}px`,
        background: OG.BG,
        color: OG.TEXT,
        fontFamily: 'sans-serif',
        // Satori rejects an `undefined` style value, so each sizing spreads only its own keys.
        ...(sizing === 'fixed'
          ? { height: '100%', justifyContent: 'space-between' }
          : { justifyContent: 'flex-start', gap: REGION_CARD_MIN_GAP }),
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {eyebrow ? (
          <div
            style={{
              display: 'flex',
              marginBottom: 6,
              fontSize: C.eyebrowSize,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: OG.TEXT_3,
            }}
          >
            {eyebrow}
          </div>
        ) : null}
        <div style={{ display: 'flex', fontSize: C.titleSize, fontWeight: 600, lineHeight: 1.15 }}>{title}</div>
        <div style={{ display: 'flex', marginTop: 12, height: 2, background: OG.RULE }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: C.columnGap }}>
        {columns.map((column) => (
          <div key={column.region} style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                paddingBottom: C.rowPadding,
                borderBottom: `1px solid ${OG.RULE}`,
                fontSize: C.regionHeadingSize,
                color: OG.TEXT_3,
              }}
            >
              {column.heading}
            </div>
            {column.rows.map((row) => (
              <div
                key={row.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  paddingTop: C.rowPadding,
                  paddingBottom: C.rowPadding,
                  borderBottom: `1px solid ${OG.RULE}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    width: C.nameWidth,
                    flexShrink: 0,
                    fontSize: C.nameSize,
                    lineHeight: 1.2,
                    fontWeight: 600,
                  }}
                >
                  {row.shortName}
                </div>
                <div style={{ display: 'flex', flex: 1, fontSize: C.textSize, lineHeight: C.textLineHeight, color: '#d5dbe1' }}>
                  {row.text}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', fontSize: C.footerSize, color: OG.TEXT_3 }}>{footer}</div>
    </div>
  );
}

/** The card's canvas: the same 1200×630 every card uses. */
export const REGION_CARD_SIZE = OG_SIZE;

// ---------------------------------------------------------------- the two cards' words
// Kept here rather than in the route files: an `opengraph-image` route exports only its image function
// and `alt` / `size` / `contentType` (node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/01-metadata/opengraph-image.md, "Config exports"), and the test needs these too.

/**
 * The root card (app/opengraph-image.tsx): `NorCal HS Field Hockey · 2026` (SITE_WORDMARK, shorter
 * than SITE_NAME, so one line at 44px) and `9 leagues, 3 independents · 102 teams · results through Oct 2 ·
 * unofficial`.
 */
export function rootCardProps(columns: readonly RegionCardColumn[] = regionCardColumns()): RegionCardProps {
  const through = getLatestResultsDate();
  return {
    title: `${SITE_WORDMARK} · ${SEASON_CALENDAR_YEAR}`,
    columns,
    footer: `${leagueCountWords()} · ${getTeams().length} teams · ${
      through ? `results through ${shortDate(through)}` : 'no results yet'
    } · unofficial`,
  };
}

/** The /standings card (app/standings/opengraph-image.tsx): the wordmark as eyebrow, "Standings — every league". */
export function standingsCardProps(columns: readonly RegionCardColumn[] = regionCardColumns()): RegionCardProps {
  const { throughDate } = buildStandingsOverviewView();
  return {
    eyebrow: SITE_WORDMARK,
    title: 'Standings — every league',
    columns,
    footer: `${leagueCountWords()} · ${getTeams().length} teams${
      throughDate ? ` · results through ${shortDate(throughDate)}` : ''
    } · unofficial`,
  };
}

import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';

import { dayCardTitle, dayLines, headlineGame, orderedForPreview } from '../../../components/schedule/day-summary';
import { gameWord, plural } from '../../../components/ui/plural';
import { OG, OG_SIZE } from '../../../components/layout/og-theme';
import { SITE_NAME } from '../../../components/layout/site';
import { getGameDates, getGames } from '../../../lib/data';
import { EN_DASH, shortDate } from '../../../lib/format';

/**
 * The per-date OG card (DESIGN §3.4) — the thing a link pasted into a group text previews with.
 *
 * TEXT ONLY, like the root card: no logo file, no school colors, no third-party image request.
 * Every score comes from `dayLines()` → `describeGame()`, so a game with no published score shows
 * an en dash here exactly as it does in the HTML. The card can no more invent a `0-0` than the page
 * can.
 *
 * The title is `<Thu Sep 24> · <n> games in <k> leagues` (SPEC §8.4) and the day's headline result
 * — the final with the largest margin — leads the lines.
 */
export const alt = 'One day of girls varsity field hockey scores';
export const size = OG_SIZE;
export const contentType = 'image/png';

/**
 * Prerenders one card per date that has a contest, exactly like the page beside it. Next's metadata
 * route loader re-exports every userland named export except `default`, `generateSitemaps` and
 * `dynamicParams`, so this is honoured here the same way it is in `/game/[id]/opengraph-image`.
 * Without it the route is the site's only `ƒ` (server-rendered on demand).
 */
export function generateStaticParams(): { date: string }[] {
  return getGameDates().map((date) => ({ date }));
}

const MAX_LINES = 4;

/**
 * `dynamicParams` cannot reach a metadata route — Next's metadata-route loader filters it out of
 * the re-exported config — so an unknown param still reaches this handler. It answers the way the
 * page beside it does, with a 404: rendering a generic card instead handed crawlers an unbounded
 * set of 200-OK image URLs whose pages do not exist.
 */
export default async function Image({ params }: PageProps<'/scores/[date]'>) {
  const { date } = await params;
  if (!getGameDates().includes(date)) notFound();
  const games = getGames({ date });
  const headline = headlineGame(games);
  const ordered = headline
    ? [headline, ...orderedForPreview(games).filter((g) => g.contestId !== headline.contestId)]
    : orderedForPreview(games);
  const lines = dayLines(ordered.slice(0, MAX_LINES));
  const remaining = games.length - lines.length;
  const finals = games.filter((game) => game.status === 'final').length;
  const heading = dayCardTitle(shortDate(date), games);

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
          background: OG.BG,
          color: OG.TEXT,
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
              color: OG.TEXT_3,
            }}
          >
            {SITE_NAME} &middot; scores
          </div>
          <div style={{ display: 'flex', marginTop: 8, height: 2, background: OG.RULE }} />
          <div style={{ display: 'flex', marginTop: 20, fontSize: 48, fontWeight: 600 }}>
            {heading}
          </div>
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
          {games.length} {gameWord(games.length)} &middot; {plural(finals, 'final score')} &middot; unofficial
          &middot; data from MaxPreps and si.com
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}

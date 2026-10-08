import Link from 'next/link';

import { EN_DASH, monthDay } from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import type { FormGame } from '../../lib/data';
import { getTeamBySlug } from '../../lib/teams';

import EmptyState from './EmptyState';
import { signedMargin } from './describe-game';

/**
 * The second and last chart on the site (DESIGN §5.7, §7.9).
 *
 * Same hueless language as the GD bar, rotated to columns: y = goal margin on ONE symmetric axis
 * clamped to the team's own range, x = game order (not a time scale — the August block would
 * compress to nothing). One series, so no legend box: the kicker names it.
 *
 * Geometry (modernization brief §4.18): the strip sits in a `p-4` card, so at 390px the plot is
 * 326 − 48 = 278px, exactly 14 columns × 18px + 13 × 2px gaps (a 14-game slate; MCAL's 16 and
 * BVAL's 10 come in as `slots` like every other). Columns are FLUID — `flex-1` up to
 * a 56px cap — so the strip fills its card at every width instead of hugging the left edge. The
 * phone floor is 12px rather than the brief's 18px: at 320 and 360 the card's plot is only 208 and
 * 248px, and an 18px floor would push the strip into a nested horizontal scroller (an overflow and
 * an axe `scrollable-region-focusable` failure). Phone columns are marks, NOT tap targets: a 24px
 * column at a 24px pitch needs 362px, and shrinking the pitch would make the 24px spacing circles of
 * WCAG 2.5.8 overlap, which DESIGN §4.4 forbids. The desktop variant's columns ARE links, so their
 * floor is 24px (20px at a 24px pitch for MCAL's 16 games); on phone the table twin and the League game log carry the same navigation.
 * Phone height 160 (it was 128, and the ±4 plot was ~100px tall inside a much larger card) includes
 * a 16px glyph band, so each arm is floor((160 − 16 − 1) / 2) = 71px; desktop 200 gives 91px.
 *
 * Unplayed games get a `?` tick and NO column, and the axis continues to the division's scheduled
 * league-game count (`slots`, the team view's `leagueScheduled` — `gamesPerTeam`: 14 in El Camino,
 * 12 in De Anza and PCAL, 10 in BVAL, 16 in MCAL), so the reader sees how much season is left and
 * never a phantom game that is not on the schedule. A game that WAS played and
 * never scored (`score-pending`) is not "left": it gets an en dash, the site's mark for a number we
 * do not have (DESIGN §5.3), and "score not reported" in words in the screen-reader description,
 * the desktop link's name and the table twin. Forfeits are excluded entirely — they have no goal
 * margin — and the caption says so. The `<details>` table twin below is the relief channel and is
 * always present, never a fallback.
 */
export interface MarginStripProps {
  /** League games in date order, played and remaining — lib/data's `getTeamForm().leagueGames`. */
  entries: FormGame[];
  teamName: string;
  /**
   * The division's scheduled league games for this team (`leagueScheduled`, from `gamesPerTeam`).
   * Required: a fixed default would pad a 10-game BVAL season with unplayed `?` games. Never fewer
   * columns than entries.
   */
  slots: number;
  /** Phone / desktop, INCLUDING the axis band. */
  height?: 160 | 200;
  className?: string;
}

const SITE_GLYPH: Record<FormGame['site'], string> = { home: 'H', away: 'A', neutral: 'N' };

/** Played, but no score was ever published (DESIGN §5.2): not "not played yet". */
function isUnreported(entry: FormGame): boolean {
  return entry.status === 'score-pending';
}

/** "vs Santa Clara" / "at Palo Alto", with the registry's short name for a registry team. */
function opponentPhrase(entry: FormGame): string {
  const name = (entry.opponentSlug ? getTeamBySlug(entry.opponentSlug)?.shortName : undefined) ??
    entry.opponent;
  return `${entry.site === 'away' ? 'at' : 'vs'} ${name}`;
}

export function MarginStrip({
  entries,
  teamName,
  slots,
  height = 160,
  className,
}: MarginStripProps) {
  const played = entries.filter((e) => e.margin !== null && !e.excludedFromMargin);
  if (played.length === 0) {
    return (
      <EmptyState
        heading={`No league results reported for ${teamName}.`}
        variant="plain"
        className={className}
      >
        The schedule is below, and MaxPreps may have results we have not picked up yet.
      </EmptyState>
    );
  }

  const isPhone = height !== 200;
  // Columns are fluid between a floor and a 56px cap. The phone floor is 12px (a chart mark; see
  // the geometry note above); the desktop floor is 24px because those marks are links (WCAG
  // 2.5.8). 14 × 24 + 13 × 3 = 375px, which fits the 380px plot of a half-width card at 1024px; a
  // 12-game strip needs 321px. MCAL's 16-game slate would need 16 × 24 + 15 × 3 = 429px and scroll
  // the page sideways, so a slate longer than 14 drops to a 20px floor with a 4px gap: 16 × 20 +
  // 15 × 4 = 380px fits, and the 24px pitch keeps WCAG 2.5.8's spacing exception (the 24px circles
  // centred on neighbouring marks touch but never overlap, DESIGN §4.4).
  const dense = !isPhone && slots > 14;
  const colClass = isPhone
    ? 'min-w-3 max-w-14 flex-1'
    : dense
      ? 'min-w-5 max-w-14 flex-1'
      : 'min-w-6 max-w-14 flex-1';
  const gap = isPhone ? 2 : dense ? 4 : 3;
  /** Only a 24px-wide column is a legal tap target, so only the desktop marks are links. */
  const interactive = !isPhone;
  // 16px: the H / A / N glyphs are 12px text on a 16px line (the 12px floor, brief §1).
  const glyphBand = 16;
  const arm = Math.floor((height - glyphBand - 1) / 2);
  const domain = Math.max(1, ...played.map((e) => Math.abs(e.margin as number)));

  const margins = played.map((e) => e.margin as number);
  const best = Math.max(...margins);
  const worst = Math.min(...margins);
  const latest = margins[margins.length - 1];
  const bestIndex = entries.findIndex((e) => e.margin === best && !e.excludedFromMargin);
  const worstIndex = entries.findIndex((e) => e.margin === worst && !e.excludedFromMargin);
  const latestIndex = entries.reduce(
    (acc, e, i) => (e.margin !== null && !e.excludedFromMargin ? i : acc),
    -1,
  );

  const cells = Array.from({ length: Math.max(slots, entries.length) }, (_, i) => entries[i]);
  const forfeits = entries.filter((e) => e.excludedFromMargin).length;
  const unreported = entries.some(isUnreported);

  return (
    <div className={className}>
      <div className="flex items-start gap-2">
        <div
          className="sx-num relative w-10 shrink-0 text-micro text-ink-3"
          style={{ height: height - glyphBand }}
          aria-hidden="true"
        >
          <span className="absolute top-0 right-0">+{domain}</span>
          <span className="absolute right-0" style={{ top: arm - 8 }}>
            0
          </span>
          <span className="absolute right-0 bottom-0">{signedMargin(-domain)}</span>
        </div>
        {/* The plot is as wide as its card, and the columns are FLUID (12px floor on phone, 24px on
            desktop, 20px at a 24px pitch for a slate longer than 14, 56px cap), so
            the strip fills the card at every width without a nested scrollbar; the zero rule and the
            columns share ONE box, so they start and end together. From 768px the wrapper is `overflow-visible`, so
            the CSS tooltips above the marks are never clipped. Below 768px it is `overflow-x-clip`,
            NOT `auto`: the hidden tooltips of the right-most marks reach past the card, and a
            scroll container would turn that into a keyboard-unreachable scrollable region (axe
            `scrollable-region-focusable`, serious). `clip` makes no scroll container; phone marks
            are not focusable and phones have no hover, so nothing visible is lost. */}
        <div className="min-w-0 flex-1 overflow-x-clip md:overflow-visible">
          <div className="relative">
            {/* The zero rule is one continuous solid hairline behind the columns, never dashed. */}
            <div
              className="sx-zero pointer-events-none absolute left-0 h-px w-full"
              style={{ top: arm }}
              aria-hidden="true"
            />
            <div className="flex" style={{ gap }}>
            {cells.map((entry, i) => {
              const margin = entry && !entry.excludedFromMargin ? entry.margin : null;
              const barHeight =
                margin === null ? 0 : Math.max(2, Math.round((Math.abs(margin) / domain) * arm));
              const label =
                i === bestIndex
                  ? `best ${signedMargin(best)}`
                  : i === worstIndex
                    ? `worst ${signedMargin(worst)}`
                    : i === latestIndex
                      ? `latest ${signedMargin(latest)}`
                      : null;
              const body = (
                <>
                  <span
                    className="flex w-full items-end justify-center"
                    style={{ height: arm }}
                    aria-hidden="true"
                  >
                    {margin !== null && margin >= 0 ? (
                      <span
                        className="sx-bar w-full"
                        style={{ height: margin === 0 ? 2 : barHeight }}
                      />
                    ) : null}
                  </span>
                  <span className="block w-full" style={{ height: 1 }} aria-hidden="true" />
                  <span
                    className="flex w-full items-start justify-center"
                    style={{ height: arm }}
                    aria-hidden="true"
                  >
                    {margin !== null && margin < 0 ? (
                      <span
                        className="sx-bar w-full"
                        style={{ height: barHeight }}
                      />
                    ) : null}
                  </span>
                  <span
                    className="sx-num block w-full text-center text-micro text-ink-3"
                    style={{ height: glyphBand }}
                    aria-hidden="true"
                  >
                    {entry
                      ? isUnreported(entry)
                        ? EN_DASH
                        : entry.margin === null
                          ? '?'
                          : SITE_GLYPH[entry.site]
                      : '?'}
                  </span>
                </>
              );
              if (!entry) {
                return (
                  <span
                    key={`slot-${i}`}
                    className={`flex flex-col items-center ${colClass}`}
                  >
                    {body}
                  </span>
                );
              }
              const description =
                `${monthDay(entry.date)} ${entry.site === 'away' ? 'at' : 'vs'} ` +
                `${entry.opponent}: ` +
                (entry.margin === null
                  ? entry.excludedFromMargin
                    ? 'forfeit, no goal margin'
                    : isUnreported(entry)
                      ? 'score not reported'
                      : 'not played yet'
                  : `margin ${signedMargin(entry.margin)}`) +
                (label ? `, ${label}` : '');
              return (
                <span
                  key={entry.contestId}
                  className={`sx-tip flex flex-col items-center ${colClass}`}
                >
                  {/* A 24px column is a legal tap target (WCAG 2.5.8); an 18px one at a 20px pitch
                      is not, on either the size rule or the spacing rule, and it cannot be made one
                      — the 24px spacing circles would have to overlap, which DESIGN §4.4 forbids
                      outright, and a 24px pitch needs 330px of the 318px this plot has at 390px. So
                      the phone marks are a CHART, like the GD bar, and the desktop marks stay links.
                      Nothing becomes unreachable: every game in the strip is a row in the table twin
                      immediately below and a 52px link in the League game log under that. */}
                  {interactive ? (
                    <Link
                      href={gameHref(entry.contestId)}
                      prefetch={false}
                      className="flex w-full flex-col items-center"
                      aria-label={description}
                    >
                      {body}
                    </Link>
                  ) : (
                    <span className="flex w-full flex-col items-center">
                      {body}
                      <span className="sr-only">{description}</span>
                    </span>
                  )}
                  {/* CSS-only tooltip on hover, and on focus wherever the mark is a link; it never
                      gates a value, because the table twin below holds the same numbers. The
                      inward anchoring of the first and last seven marks, which keeps an edge
                      tooltip inside the viewport, lives in globals.css (.sx-tip:nth-child /
                      :nth-last-child). */}
                  <span className="sx-tip-body" aria-hidden="true">
                    {monthDay(entry.date)} &middot; {opponentPhrase(entry)}
                    {entry.margin !== null
                      ? ` · ${signedMargin(entry.margin)}`
                      : entry.excludedFromMargin
                        ? ' · forfeit'
                        : isUnreported(entry)
                          ? ' · score not reported'
                          : ''}
                  </span>
                  {interactive && label ? <span className="sr-only">{label}</span> : null}
                </span>
              );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* The chart is as wide as its card; the legend is prose, so it keeps a reading measure. */}
      <p className="mt-3 mb-0 max-w-prose text-meta text-ink-3">
        {signedMargin(best)} best &middot; {signedMargin(worst)} worst &middot;{' '}
        {signedMargin(latest)} most recent. H / A / N is home, away, neutral;{' '}
        <b>?</b> is a league game with no result yet
        {unreported ? (
          <>
            ; <b>{EN_DASH}</b> is a game whose score was not reported
          </>
        ) : null}
        .
        {forfeits > 0
          ? ` ${forfeits === 1 ? '1 forfeit is' : `${forfeits} forfeits are`} excluded — a forfeit has no goal margin.`
          : ''}
      </p>

      <details className="sx-disclosure mt-2">
        <summary>Show as table</summary>
        <table className="sx-table mt-2 text-meta">
          <caption className="sr-only">{teamName} league goal margin by game</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Opponent</th>
              <th scope="col">Site</th>
              <th scope="col">Margin</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.contestId}>
                <td className="sx-num">{monthDay(entry.date)}</td>
                <td>{entry.opponent}</td>
                <td>{SITE_GLYPH[entry.site]}</td>
                <td className="sx-num">
                  {entry.excludedFromMargin
                    ? 'forfeit'
                    : isUnreported(entry)
                      ? 'score not reported'
                      : entry.margin === null
                        ? 'not played'
                        : signedMargin(entry.margin)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export default MarginStrip;

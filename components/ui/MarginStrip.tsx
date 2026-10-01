import Link from 'next/link';

import { monthDay } from '../../lib/format';
import type { FormGame } from '../../lib/data';

import EmptyState from './EmptyState';
import { signedMargin } from './game-view';

/**
 * The second and last chart on the site (DESIGN §5.7, §7.9).
 *
 * Same hueless language as the GD bar, rotated to columns: y = goal margin on ONE symmetric axis
 * clamped to the team's own range, x = game order (not a time scale — the August block would
 * compress to nothing). One series, so no legend box: the kicker names it.
 *
 * Geometry for the 358px phone content box: 40px value gutter + 14 columns × 18px + 13 × 2px gaps
 * = 278 ≤ 318. Height 56 + 1 + 56 + 15 = 128, axis band included, so the container never grows a
 * nested scrollbar. Those 18px columns are marks, NOT tap targets: a 24px column at a 24px pitch
 * needs 330px and there are 318, and shrinking the pitch instead would make the 24px spacing
 * circles of WCAG 2.5.8 overlap, which DESIGN §4.4 forbids. The desktop variant's 24px columns ARE
 * links, and on phone the table twin and the League game log carry the same navigation.
 *
 * Unplayed games get a `?` tick and NO column, and the axis continues to game 14, so the reader
 * sees how much season is left. Forfeits are excluded entirely — they have no goal margin — and
 * the caption says so. The `<details>` table twin below is the relief channel and is always
 * present, never a fallback.
 */
export interface MarginStripProps {
  /** League games in date order, played and remaining — lib/data's `getTeamForm().leagueGames`. */
  entries: FormGame[];
  teamName: string;
  /** Default 14 — the full double-round-robin league season. */
  slots?: number;
  /** Phone / desktop, INCLUDING the axis band. */
  height?: 128 | 200;
  className?: string;
}

const SITE_GLYPH: Record<FormGame['site'], string> = { home: 'H', away: 'A', neutral: 'N' };

export function MarginStrip({
  entries,
  teamName,
  slots = 14,
  height = 128,
  className,
}: MarginStripProps) {
  const played = entries.filter((e) => e.margin !== null && !e.excludedFromMargin);
  if (played.length === 0) {
    return (
      <EmptyState heading={`No league results reported for ${teamName}.`} className={className}>
        The schedule is below, and MaxPreps may have results we have not picked up yet.
      </EmptyState>
    );
  }

  const isPhone = height === 128;
  const colWidth = isPhone ? 18 : 24;
  const gap = isPhone ? 2 : 4;
  /** Only a 24px-wide column is a legal tap target, so only the desktop marks are links. */
  const interactive = !isPhone;
  const glyphBand = 15;
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

  return (
    <div className={className}>
      <div className="flex items-start gap-2">
        <div
          className="sx-num relative w-10 shrink-0 text-kicker text-ink-3"
          style={{ height: height - glyphBand }}
          aria-hidden="true"
        >
          <span className="absolute top-0 right-0">+{domain}</span>
          <span className="absolute right-0" style={{ top: arm - 5 }}>
            0
          </span>
          <span className="absolute right-0 bottom-0">{signedMargin(-domain)}</span>
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto">
          {/* `w-max` — the rule and the columns share ONE box, so they start and end together.
              Spanning the flex parent instead left a 1024px rule hanging across ~600px of empty
              surface to the right of a ~400px plot on a 1280px team page. */}
          <div className="relative w-max">
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
                    className="sx-num block w-full text-center text-kicker text-ink-3"
                    style={{ height: glyphBand }}
                    aria-hidden="true"
                  >
                    {entry ? (entry.margin === null ? '?' : SITE_GLYPH[entry.site]) : '?'}
                  </span>
                </>
              );
              if (!entry) {
                return (
                  <span
                    key={`slot-${i}`}
                    className="flex shrink-0 flex-col items-center"
                    style={{ width: colWidth }}
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
                    : 'not played yet'
                  : `margin ${signedMargin(entry.margin)}`) +
                (label ? `, ${label}` : '');
              return (
                <span
                  key={entry.contestId}
                  className="sx-tip flex shrink-0 flex-col items-center"
                  style={{ width: colWidth }}
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
                      href={`/game/${entry.contestId}`}
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
                      gates a value, because the table twin below holds the same numbers. */}
                  <span className="sx-tip-body" role="presentation">
                    {monthDay(entry.date)} &middot; {entry.opponent} &middot;{' '}
                    {SITE_GLYPH[entry.site]}{' '}
                    {entry.margin === null ? '' : `· ${signedMargin(entry.margin)}`}
                  </span>
                  {interactive && label ? <span className="sr-only">{label}</span> : null}
                </span>
              );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 62ch (DESIGN §4.3): the chart is as wide as its column, the legend is prose. */}
      <p className="mt-2 mb-0 max-w-[62ch] text-meta text-ink-3">
        {signedMargin(best)} best &middot; {signedMargin(worst)} worst &middot;{' '}
        {signedMargin(latest)} most recent. H / A / N is home, away, neutral; <b>?</b> is a game
        not played yet.
        {forfeits > 0
          ? ` ${forfeits === 1 ? '1 forfeit is' : `${forfeits} forfeits are`} excluded — a forfeit has no goal margin.`
          : ''}
      </p>

      <details className="mt-2">
        <summary className="sx-action cursor-pointer text-meta text-accent">Show as table</summary>
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

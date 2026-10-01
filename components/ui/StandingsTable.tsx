import Link from 'next/link';

import { EM_DASH, ordinal, recordString, streakString, winPct } from '../../lib/format';
import { DIVISION_LABELS } from '../../lib/season';
import type { Division, Standing, Team, TeamSlug } from '../../lib/types';

import ExternalLink from './ExternalLink';
import FormStrip, { toFormEntries } from './FormStrip';
import { GoalDiffCell } from './GoalDiffBar';
import TeamMonogram from './TeamMonogram';

/**
 * The league table (DESIGN §3.2, §7.3), amended by BYLAWS-ADDENDUM.
 *
 * A PTS column SHIPS and it is the ordering key: By-Laws Article VI §2 awards 3 points for a win
 * and 1 for a tie, and "the division placement/standings will be the order of team points".
 * DESIGN §1.2's "no PTS column" and §11.8's win-percentage sort predate the by-laws PDF and are
 * superseded by it.
 *
 * SHARED PLACES ARE REAL. Article VI §7 ends in a coin flip we cannot compute, so two or more
 * teams can carry the same `computed.place` with `tiebreak.shared === true`. Those rows render
 * LEVEL — the same number with an `=` marker — and `tiebreak.note` (which already cites the
 * article) goes into the footnotes. On the live snapshot that means De Anza has two 6th places
 * and El Camino has two 4th places and therefore NO 5th place and no at-large row.
 *
 * A row with `hasReportedResults === false` (Wilcox) sorts last, renders its rank as an em dash,
 * every numeric cell as an em dash and its GD as a `·` on the zero rule — never `0-0-0`, never
 * `.000`, never a rank by merit — and it is still a link.
 *
 * No client-side sorting: the table has one correct order and re-sorting it is a coach's
 * affordance that costs a client component and a whole `aria-sort` surface.
 */
export type StandingsVariant = 'phone' | 'desktop' | 'mini' | 'archive';

export interface StandingsRowData {
  standing: Standing;
  team: Team;
  /** Defaults to /teams/[slug]. */
  href?: string;
}

export interface StandingsTableProps {
  division: Division;
  /** Already sorted and ranked by lib/standings.ts. */
  rows: StandingsRowData[];
  /** max |gd| for THIS division — never global (R-2). */
  gdDomain: number;
  variant: StandingsVariant;
  /** "De Anza Division league standings through Sep 29" */
  caption: string;
  highlightSlug?: TeamSlug | null;
  /**
   * Teams whose published MaxPreps row disagrees with ours in ANY field (`snapshot.crossCheck`).
   * `standing.mismatch` only covers a W-L-T disagreement; today every mismatch flag is false while
   * the cross-check log holds two real placement disagreements (we order on points per Article
   * VI §2, MaxPreps orders on win percentage), so without this the ⚑ DESIGN §3.2 draws on a row
   * would never appear. The explanation stays in the notes under the table.
   */
  flaggedSlugs?: readonly TeamSlug[];
  /** Draw a 2px rule after this row index (1-based) — the 7th automatic berth. */
  berthRuleAfter?: number;
  footnotes?: string[];
  /** `mini` shows this many rows (default 4). */
  limit?: number;
  /** The MaxPreps league page, deep-linked under the table (SPEC §6). */
  sourceUrl?: string;
  className?: string;
  id?: string;
}

/** '1st', '6=' for a shared place, an em dash for a team with no reported results. */
function PlaceCell({ standing }: { standing: Standing }) {
  if (!standing.hasReportedResults) {
    return (
      <span className="sx-num text-ink-3">
        <span aria-hidden="true">{EM_DASH}</span>
        <span className="sr-only">not ranked</span>
      </span>
    );
  }
  const { place } = standing.computed;
  if (standing.tiebreak.shared) {
    return (
      <span className="sx-num text-ink">
        <span aria-hidden="true">{place}=</span>
        <span className="sr-only">tied for {ordinal(place)}</span>
      </span>
    );
  }
  return <span className="sx-num text-ink">{place}</span>;
}

/**
 * The ⚑ beside a team name. It is `aria-hidden` and paired with an sr-only sentence, because the
 * glyph alone means nothing read aloud and the detail lives in a footnote under the table.
 */
function FlagMark({ name }: { name: string }) {
  return (
    <>
      <span className="text-ink-3" aria-hidden="true">
        &#9873;
      </span>
      <span className="sr-only">
        Flagged: MaxPreps publishes a different row for {name}; see the notes under this table.
      </span>
    </>
  );
}

function dash(value: number | null, hasResults: boolean, render = (v: number) => String(v)) {
  if (!hasResults || value === null) return EM_DASH;
  return render(value);
}

/**
 * The stretched row link: its hit area is exactly the row and never overlaps a neighbour.
 *
 * `prefetch={false}` for the same reason as the nav (components/layout/NavLink.tsx) and the team
 * tiles: every team route is STATIC, and Next 16's default `auto` downloads a static route in full
 * the moment the link enters the viewport. Sixteen rows in one viewport is sixteen whole team pages
 * — measured at 97 KB on the wire and 876 KB decoded on /standings, against a 35 KB document.
 * Navigation still fetches on click.
 */
function RowLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} prefetch={false} className="absolute inset-0">
      <span className="sr-only">
        {/* Only the pinned row's copy is displayed (app/globals.css), so the accent rule beside
            it is never the only thing saying "this is your team". */}
        <span className="sx-pin-note">Your team. </span>
        {label}
      </span>
    </Link>
  );
}

function rowLabel(row: StandingsRowData): string {
  const { standing, team } = row;
  if (!standing.hasReportedResults) return `${team.name}: no results reported yet`;
  const place = standing.tiebreak.shared
    ? `tied for ${ordinal(standing.computed.place)}`
    : ordinal(standing.computed.place);
  return `${team.name}, ${place} in ${DIVISION_LABELS[team.division]}, ${recordString(
    standing.computed,
  )}, ${standing.computed.pts} points`;
}

function collectFootnotes(props: StandingsTableProps): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const { rows, gdDomain, division, variant } = props;
  if (variant !== 'archive') {
    out.push(
      `GD = league goals for minus goals against. Bars are scaled to ${
        DIVISION_LABELS[division]
      } only (|GD| max ${gdDomain}), so the two divisions' bars are not comparable to each other. A real 0 shows as 0; a score we do not have shows as an em dash. Forfeits count in W-L-T, not in GF / GA / GD.`,
    );
    out.push(
      'PTS is the official ordering key: 3 points for a win, 1 for a tie (SCVAL By-Laws Article VI §2).',
    );
  }
  // One footnote per TIED GROUP, not one per team: Cupertino's note and Homestead's note describe
  // the same coin flip. The note already cites Article VI §7, so it renders verbatim.
  const sharedGroups = new Map<string, React.ReactNode>();
  for (const row of rows) {
    if (!row.standing.tiebreak.shared) continue;
    const key = [row.standing.teamId, ...row.standing.tiebreak.tiedWith].sort().join('|');
    if (sharedGroups.has(key)) continue;
    sharedGroups.set(
      key,
      <>
        <b className="font-semibold">{row.team.name}</b>: {row.standing.tiebreak.note}
      </>,
    );
  }
  for (const note of sharedGroups.values()) out.push(note);
  for (const row of rows) {
    if (!row.standing.hasReportedResults) {
      out.push(
        `${row.team.name} is in the official ${
          DIVISION_LABELS[row.team.division]
        } alignment but has no results in the source table — no record is invented for them.`,
      );
    }
    if (row.standing.mismatch) {
      out.push(
        <>
          <span aria-hidden="true">&#9873;</span>
          <span className="sr-only">Flagged:</span> {row.team.name}:{' '}
          {row.standing.mismatchDetail ?? 'our computation differs from MaxPreps.'} We show our own
          computation.{' '}
          {row.team.external.maxprepsTeamUrl ? (
            <ExternalLink href={row.team.external.maxprepsTeamUrl}>MaxPreps</ExternalLink>
          ) : null}
        </>,
      );
    }
  }
  for (const extra of props.footnotes ?? []) out.push(extra);
  return out;
}

export function StandingsTable(props: StandingsTableProps) {
  const { variant, caption, highlightSlug, berthRuleAfter, gdDomain, className, id } = props;
  const flagged = new Set<TeamSlug>(props.flaggedSlugs ?? []);
  const rows = variant === 'mini' ? props.rows.slice(0, props.limit ?? 4) : props.rows;
  const footnotes = variant === 'mini' ? [] : collectFootnotes({ ...props, rows });

  const trClass = (row: StandingsRowData) => {
    const classes = ['relative'];
    // The pinned team's 2px accent left rule; non-league rows use the strong rule elsewhere.
    // A caller that already knows the team (the playoff bracket) passes `highlightSlug`; on the
    // static pages the pin lives in localStorage, so `data-team-slug` below is what the
    // end-of-body script in app/layout.tsx matches on.
    if (highlightSlug && row.team.slug === highlightSlug) classes.push('sx-pinned');
    return classes.join(' ');
  };
  const trStyle = (index: number) =>
    berthRuleAfter && index + 1 === berthRuleAfter
      ? { borderBottom: '2px solid var(--sx-border-strong)' }
      : undefined;

  return (
    <div className={className} id={id}>
      {/* `overflow-clip`, NOT `overflow-hidden`. `hidden` makes this div a scroll container, and a
          sticky `<thead>` then resolves its `top` against THIS box instead of the viewport — so
          the header row was rendered 88px down, floating between rows 1 and 2 (and covering row 2
          on desktop) at rest, and scrolled away entirely. `clip` clips identically without
          creating a scroll container, so the header sits in place and sticks under the chrome. */}
      <div className="sx-bleed overflow-clip">
        <table
          className={`sx-table text-meta${variant === 'desktop' ? ' sx-table-wide' : ''}`}
        >
          <caption
            className={variant === 'desktop' ? 'pb-2 text-meta text-ink-3' : 'sr-only'}
          >
            {caption}
          </caption>
          {variant === 'phone' ? (
            <>
              <thead>
                <tr>
                  <th scope="col" className="w-[18px] pl-gutter">
                    #
                  </th>
                  <th scope="col">Team</th>
                  <th scope="col" className="w-8 text-right">
                    Pts
                  </th>
                  <th scope="col" className="w-[52px] text-right">
                    W-L-T
                  </th>
                  {/* The GD track is the one column that can afford to go. Below 375px the five
                      fixed columns starved the team cell and every long school name truncated to a
                      fragment — at 320px "Santa Clara" and "Saratoga" were both unreadable stubs,
                      against DESIGN §10.8's "reflow at 320px with no loss of content". The 72px
                      plot is dropped there and the signed numeral stays, which is the cell's
                      accessible value anyway; the name is what a reader cannot do without. */}
                  <th scope="col" className="w-[36px] pr-gutter text-right min-[375px]:w-[108px]">
                    GD
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const s = row.standing;
                  const has = s.hasReportedResults;
                  return (
                    <tr
                      key={row.team.id}
                      data-team-slug={row.team.slug}
                      className={trClass(row)}
                      style={{ height: 60, ...trStyle(index) }}
                    >
                      <td className="w-[18px] pl-gutter align-top">
                        <PlaceCell standing={s} />
                      </td>
                      {/* An explicit `aria-label`, because a row header is re-announced on every
                          cell the reader moves to and this one otherwise accumulates everything in
                          the row: the row link's full label, the visible short name, the form
                          strip's own sentence and the overall record — 212 characters naming the
                          school three times, against 90 for the desktop variant, which has separate
                          columns to put those in. The name alone is what a cell announcement needs;
                          the link beside it keeps the full "1st in De Anza, 4-0-0, 12 points" and
                          the form sentence is still in the row for the virtual cursor. */}
                      <th
                        scope="row"
                        aria-label={row.team.name}
                        className="max-w-0 text-left align-top font-normal"
                      >
                        <RowLink href={row.href ?? `/teams/${row.team.slug}`} label={rowLabel(row)} />
                        <span className="flex items-center gap-1.5">
                          <TeamMonogram team={row.team} size={24} />
                          {/* shortName, not name: the phone team cell is ~148px of a 358px box,
                              so "St. Ignatius College Preparatory" truncates mid-word. The row
                              link's accessible name still carries the full school name. */}
                          <span className="min-w-0 truncate text-body text-ink">
                            {row.team.shortName}
                          </span>
                          {s.mismatch || flagged.has(row.team.slug) ? (
                            <FlagMark name={row.team.name} />
                          ) : null}
                        </span>
                        {/* Line 2 runs the FULL row width (DESIGN §3.2: 48px indent, form strip,
                            then the overall record), which a cell in a five-column table cannot
                            do — inside the ~148px team cell "8-1-0 overall" wrapped and pushed
                            every row to 81px, so only six rows cleared the fold instead of seven.
                            The <tr> is `position: relative`, so absolute placement here spans the
                            row. It is inert (the chips carry no links in this variant), hence
                            `pointer-events-none` — the row link underneath stays whole. */}
                        <span className="pointer-events-none absolute inset-x-0 bottom-[7px] flex items-center gap-2 pl-[64px] pr-gutter text-meta text-ink-3">
                          {has ? (
                            <>
                              <FormStrip
                                entries={toFormEntries(s.computed.last5)}
                                size={16}
                                label={`${row.team.name} last ${s.computed.last5.length} league games`}
                              />
                              <span className="sx-num">
                                {recordString(s.overall)} overall
                              </span>
                            </>
                          ) : (
                            <span>no results reported yet</span>
                          )}
                        </span>
                      </th>
                      <td className="sx-num w-8 text-right align-top font-semibold text-ink">
                        {has ? s.computed.pts : EM_DASH}
                      </td>
                      <td className="sx-num w-[52px] text-right align-top">
                        {has ? recordString(s.computed) : EM_DASH}
                      </td>
                      <td className="w-[36px] pr-gutter text-right align-top min-[375px]:w-[108px]">
                        {has ? (
                          <GoalDiffCell
                            value={s.computed.gd}
                            domain={gdDomain}
                            track={72}
                            barClassName="hidden min-[375px]:block"
                          />
                        ) : (
                          <span className="sx-num text-ink-3">
                            <span aria-hidden="true">&middot; {EM_DASH}</span>
                            <span className="sr-only">no goal differential</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </>
          ) : null}

          {variant === 'desktop' ? (
            <>
              <thead>
                <tr>
                  <th scope="col" className="w-8 pl-gutter">
                    #
                  </th>
                  <th scope="col">Team</th>
                  <th scope="col" className="text-right">
                    Pts
                  </th>
                  <th scope="col" className="text-right">
                    League
                  </th>
                  <th scope="col" className="text-right">
                    Pct
                  </th>
                  <th scope="col" className="text-right">
                    Overall
                  </th>
                  <th scope="col" className="text-right">
                    GF
                  </th>
                  <th scope="col" className="text-right">
                    GA
                  </th>
                  <th scope="col" className="text-right">
                    GD
                  </th>
                  <th scope="col" className="text-right">
                    Stk
                  </th>
                  <th scope="col" className="text-right">
                    Home
                  </th>
                  <th scope="col" className="text-right">
                    Away
                  </th>
                  <th scope="col" className="text-right">
                    Neut
                  </th>
                  <th scope="col" className="pr-gutter">
                    L5
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const s = row.standing;
                  const has = s.hasReportedResults;
                  return (
                    <tr
                      key={row.team.id}
                      data-team-slug={row.team.slug}
                      className={trClass(row)}
                      style={{ height: 44, ...trStyle(index) }}
                    >
                      <td className="w-8 pl-gutter">
                        <PlaceCell standing={s} />
                      </td>
                      <th scope="row" className="text-left font-normal">
                        <RowLink href={row.href ?? `/teams/${row.team.slug}`} label={rowLabel(row)} />
                        <span className="flex items-center gap-1.5">
                          <TeamMonogram team={row.team} size={24} />
                          <span className="truncate text-body text-ink">{row.team.shortName}</span>
                          {s.mismatch || flagged.has(row.team.slug) ? (
                            <FlagMark name={row.team.name} />
                          ) : null}
                        </span>
                      </th>
                      <td className="sx-num text-right font-semibold text-ink">
                        {has ? s.computed.pts : EM_DASH}
                      </td>
                      <td className="sx-num text-right">
                        {has ? recordString(s.computed) : EM_DASH}
                      </td>
                      <td className="sx-num text-right">
                        {has ? winPct(s.computed.winPct) : EM_DASH}
                      </td>
                      <td className="sx-num text-right">{has ? recordString(s.overall) : EM_DASH}</td>
                      <td className="sx-num text-right">{dash(s.computed.gf, has)}</td>
                      <td className="sx-num text-right">{dash(s.computed.ga, has)}</td>
                      <td className="text-right">
                        {has ? (
                          <GoalDiffCell
                            value={s.computed.gd}
                            domain={gdDomain}
                            track={96}
                            thickness={10}
                          />
                        ) : (
                          <span className="sx-num text-ink-3" aria-hidden="true">
                            &middot; {EM_DASH}
                          </span>
                        )}
                      </td>
                      <td className="sx-num text-right">
                        {has ? streakString(s.computed.streak) : EM_DASH}
                      </td>
                      {/* Guarded like every other cell in the row: a team with no reported
                          results (Wilcox) gets an em dash, never a fabricated 0-0-0. /about
                          promises exactly that, and TeamSplits already honours it. */}
                      <td className="sx-num text-right">
                        {has ? recordString(s.computed.homeRecord) : EM_DASH}
                      </td>
                      <td className="sx-num text-right">
                        {has ? recordString(s.computed.awayRecord) : EM_DASH}
                      </td>
                      <td className="sx-num text-right">
                        {has ? recordString(s.computed.neutralRecord) : EM_DASH}
                      </td>
                      <td className="pr-gutter">
                        {has ? (
                          <FormStrip
                            entries={toFormEntries(s.computed.last5)}
                            size={16}
                            label={`${row.team.name} last ${s.computed.last5.length} league games`}
                          />
                        ) : (
                          <span className="text-ink-3">no results</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </>
          ) : null}

          {variant === 'mini' ? (
            <>
              <thead className="sr-only">
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Team</th>
                  <th scope="col">W-L-T</th>
                  <th scope="col">Pts</th>
                  <th scope="col">GD</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const s = row.standing;
                  const has = s.hasReportedResults;
                  return (
                    <tr key={row.team.id} data-team-slug={row.team.slug} className={trClass(row)} style={{ height: 44 }}>
                      <td className="w-[18px] pl-gutter">
                        <PlaceCell standing={s} />
                      </td>
                      <th scope="row" className="max-w-0 text-left font-normal">
                        <RowLink href={row.href ?? `/teams/${row.team.slug}`} label={rowLabel(row)} />
                        <span className="flex items-center gap-1.5">
                          <TeamMonogram team={row.team} size={20} />
                          <span className="min-w-0 truncate text-body text-ink">
                            {row.team.shortName}
                          </span>
                        </span>
                      </th>
                      <td className="sx-num w-[52px] text-right">
                        {has ? recordString(s.computed) : EM_DASH}
                      </td>
                      <td className="sx-num w-8 text-right font-semibold text-ink">
                        {has ? s.computed.pts : EM_DASH}
                      </td>
                      <td className="w-[36px] pr-gutter text-right min-[375px]:w-[108px]">
                        {has ? (
                          <GoalDiffCell
                            value={s.computed.gd}
                            domain={gdDomain}
                            track={72}
                            barClassName="hidden min-[375px]:block"
                          />
                        ) : (
                          <span className="sx-num text-ink-3" aria-hidden="true">
                            &middot; {EM_DASH}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </>
          ) : null}

          {variant === 'archive' ? (
            <>
              <thead>
                <tr>
                  <th scope="col" className="w-8 pl-gutter">
                    #
                  </th>
                  <th scope="col">Team</th>
                  <th scope="col" className="text-right">
                    League
                  </th>
                  <th scope="col" className="pr-gutter text-right">
                    Overall
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.team.id} data-team-slug={row.team.slug} className={trClass(row)} style={{ height: 44 }}>
                    <td className="w-8 pl-gutter">
                      <PlaceCell standing={row.standing} />
                    </td>
                    <th scope="row" className="text-left font-normal">
                      <RowLink
                        href={row.href ?? `/teams/${row.team.slug}`}
                        label={rowLabel(row)}
                      />
                      <span className="flex items-center gap-1.5">
                        <TeamMonogram team={row.team} size={20} />
                        <span className="truncate text-body text-ink">{row.team.name}</span>
                      </span>
                    </th>
                    <td className="sx-num text-right">{recordString(row.standing.computed)}</td>
                    <td className="sx-num pr-gutter text-right">
                      {row.standing.overall.gp > 0 ? recordString(row.standing.overall) : EM_DASH}
                    </td>
                  </tr>
                ))}
              </tbody>
            </>
          ) : null}
        </table>
      </div>

      {/* 62ch, per DESIGN §4.3. The TABLE is full-bleed, but these are sentences: left at the
          content width they ran 119ch at 1280 — nearly twice the measure every other explanatory
          block on the site uses, and on /playoffs this very block sat beside a 62ch one. */}
      {footnotes.length > 0 ? (
        <ul className="mt-2 max-w-[62ch] list-none space-y-1 p-0 text-meta text-ink-3">
          {footnotes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
          {/* The last footnote is two standalone actions, not prose, so each carries its own 24px
              box (WCAG 2.5.8) rather than the 17px line box of the notes above it. */}
          <li className="flex flex-wrap items-center gap-x-2">
            <Link href="/about#standings" className="sx-action text-accent hover:underline">
              How standings are computed <span aria-hidden="true">&rarr;</span>
            </Link>
            {props.sourceUrl ? (
              <>
                <span aria-hidden="true">&middot;</span>
                <ExternalLink href={props.sourceUrl} className="sx-action">
                  MaxPreps table
                </ExternalLink>
              </>
            ) : null}
          </li>
        </ul>
      ) : null}
    </div>
  );
}

export default StandingsTable;

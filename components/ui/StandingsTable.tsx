import Link from 'next/link';

import { EM_DASH, ordinal, recordString, recordWords, streakString, winPct } from '../../lib/format';
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
 * LEVEL — the same number with the US sports-page `T` prefix ("T7", never the British "7=") — and
 * `tiebreak.note` (which already cites the article) goes into the footnotes. On the live snapshot
 * that means El Camino has two 7th places (Lynbrook and Monta Vista) and no 8th.
 *
 * A row with `hasReportedResults === false` sorts last, renders its rank as an em dash
 * and, in the phone and desktop tables, ONE "No results yet" cell across the data columns (the
 * mini table, which only ever shows the top four, keeps em dashes and a `·` on the zero rule) —
 * never `0-0-0`, never `.000`, never a rank by merit — and it is still a link.
 *
 * No client-side sorting: the table has one correct order and re-sorting it is a coach's
 * affordance that costs a client component and a whole `aria-sort` surface.
 *
 * Every variant renders its OWN card (`.sx-card.sx-flush`, plus `.sx-bleed` for the phone and mini
 * tables, which run edge to edge below 768px), so callers never wrap it. `sx-flush` clips with
 * `overflow: clip`, never `hidden`, so the sticky `<thead>` still sticks under the chrome.
 *
 * The notes are separable: `notes="none"` renders the table alone, and `collectStandingsNotes()`
 * hands the caller the generic legend (GD, PTS) and the table-specific notes (shared places, the
 * no-results team, mismatch flags, `footnotes`) so a page can place each where it belongs.
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
  /**
   * `inline` (default) prints the legend, the specific notes and the source links under the card;
   * `none` renders the card alone — the caller takes the notes from `collectStandingsNotes()`.
   */
  notes?: 'inline' | 'none';
  /** `mini` shows this many rows (default 4). */
  limit?: number;
  /** The MaxPreps league page, deep-linked under the table (SPEC §6). */
  sourceUrl?: string;
  className?: string;
  id?: string;
}

/**
 * The colour comes from the cell (rank is ink-3 in every variant). '1', 'T7' for a shared place,
 * an em dash for a team with no reported results. `whitespace-nowrap`: the phone and mini place
 * column is 20px of content at 320 and "T7" is ~16px of 13px mono, so it must never break into
 * a "T" over a "7".
 */
function PlaceCell({ standing }: { standing: Standing }) {
  if (!standing.hasReportedResults) {
    return (
      <span className="sx-num">
        <span aria-hidden="true">{EM_DASH}</span>
        <span className="sr-only">not ranked</span>
      </span>
    );
  }
  const { place } = standing.computed;
  if (standing.tiebreak.shared) {
    return (
      <span className="sx-num whitespace-nowrap">
        <span aria-hidden="true">T{place}</span>
        <span className="sr-only">tied for {ordinal(place)}</span>
      </span>
    );
  }
  return <span className="sx-num">{place}</span>;
}

/**
 * The ⚑ beside a team name. It is `aria-hidden` and paired with an sr-only sentence, because the
 * glyph alone means nothing read aloud and the detail lives in a footnote under the table.
 */
function FlagMark({ name }: { name: string }) {
  return (
    <>
      {/* -ml-1: the flag hugs the name (4px, not the row's 8px gap), which is the last few pixels
          a flagged "Monta Vista" needs to stay whole in the 320px phone row. */}
      <span className="-ml-1 shrink-0 text-ink-3" aria-hidden="true">
        &#9873;
      </span>
      <span className="sr-only">
        Flagged: MaxPreps publishes a different row for {name}; see the notes under this table.
      </span>
    </>
  );
}

/**
 * A column-head abbreviation: the short form is what a sighted reader scans ("GF"), the long form
 * is what a screen reader announces with every cell it reaches in that column ("Goals for") —
 * a bare "G F" or "P C T" spelled out on every cell is noise. The sr-only span is
 * `position: absolute`, so the `<th>` holding it must be positioned: every sticky head already
 * is; a static one (the mini table's) carries `relative`.
 */
function Abbr({ short, long }: { short: string; long: string }) {
  return (
    <>
      <span aria-hidden="true">{short}</span>
      <span className="sr-only">{long}</span>
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
 * the moment the link enters the viewport. Fifteen rows in one viewport is fifteen whole team pages
 * — measured at 97 KB on the wire and 876 KB decoded on /standings, against a 35 KB document.
 * Navigation still fetches on click.
 */
function RowLink({ href, label, className }: { href: string; label: string; className?: string }) {
  return (
    <Link href={href} prefetch={false} className={className ? `absolute inset-0 ${className}` : 'absolute inset-0'}>
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
  // The record in WORDS: "4-1-0" read aloud is a subtraction or a date, depending on the voice.
  const { pts } = standing.computed;
  return `${team.name}, ${place} in ${DIVISION_LABELS[team.division]}, ${recordWords(
    standing.computed,
  )}, ${pts} ${pts === 1 ? 'point' : 'points'}`;
}


/**
 * The table's notes, split by where they belong (brief §4.22):
 *  - `legend`: the GD paragraph and the PTS paragraph — generic, and verbatim the same under every
 *    table, so a page may print them once;
 *  - `specific`: shared-place notes, the no-results team, `standing.mismatch` flags and the
 *    caller's `footnotes` — facts about THIS division, which always stay visible.
 */
export function collectStandingsNotes(
  props: Pick<StandingsTableProps, 'rows' | 'gdDomain' | 'division' | 'variant' | 'footnotes'>,
): { legend: React.ReactNode[]; specific: React.ReactNode[] } {
  const legend: React.ReactNode[] = [];
  const specific: React.ReactNode[] = [];
  const { rows, gdDomain, division, variant } = props;
  if (variant !== 'archive') {
    legend.push(
      `GD = league goals for minus goals against. Bars are scaled to ${
        DIVISION_LABELS[division]
      }'s biggest goal difference (${gdDomain}) alone, so the two divisions' bars are not comparable to each other. A real 0 shows as 0; a score we do not have shows as an em dash. Forfeits count in the win-loss-tie record, not in the goal columns.`,
    );
    legend.push(
      'PTS is the official ordering key: 3 points for a win, 1 for a tie (SCVAL By-Laws Article VI §2).',
    );
  }
  // One note per TIED GROUP, not one per team: Cupertino's note and Homestead's note describe
  // the same coin flip. The note already cites Article VI §7, so it renders verbatim.
  const sharedGroups = new Map<string, React.ReactNode>();
  for (const row of rows) {
    if (!row.standing.tiebreak.shared) continue;
    const key = [row.standing.teamId, ...row.standing.tiebreak.tiedWith].sort().join('|');
    if (sharedGroups.has(key)) continue;
    sharedGroups.set(
      key,
      <>
        <b className="font-semibold text-ink">{row.team.name}</b>: {row.standing.tiebreak.note}
      </>,
    );
  }
  for (const note of sharedGroups.values()) specific.push(note);
  for (const row of rows) {
    if (!row.standing.hasReportedResults) {
      specific.push(
        `${row.team.name} is in the official ${
          DIVISION_LABELS[row.team.division]
        } alignment but has no results in the source table — no record is invented for them.`,
      );
    }
    if (row.standing.mismatch) {
      specific.push(
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
  for (const extra of props.footnotes ?? []) specific.push(extra);
  return { legend, specific };
}

/** The ⚑ mark, shown on any row MaxPreps publishes differently. */
function isFlagged(row: StandingsRowData, flagged: Set<TeamSlug>): boolean {
  return row.standing.mismatch || flagged.has(row.team.slug);
}

/** No results: a `·` on the zero rule plus an em dash, with the words for a screen reader. */
function NoGoalDiff() {
  return (
    <span className="sx-num text-ink-3">
      <span aria-hidden="true">&middot; {EM_DASH}</span>
      <span className="sr-only">no goal differential</span>
    </span>
  );
}

/*
 * The desktop table's column widths, lg tier then xl (brief §4.14). `.sx-table-wide` is
 * `table-layout: fixed`, so these are the ONLY widths the browser uses: each one includes the
 * cell's own padding (6px a side at lg, 10px from 1280, and 20px at the card's two inner edges),
 * and Team takes whatever is left — about 170px of the 976px table at 1024, 200px at 1280.
 * Every head fits its column at 12px sans caps: "LEAGUE" ≈ 46px and "OVERALL" ≈ 55px are why
 * those two columns are wider than their numerals need.
 */
const DESKTOP_COLS = [
  'w-[3rem] xl:w-[3.5rem]', // #
  '', // Team (auto)
  'w-[3rem] xl:w-[3.5rem]', // PTS
  'w-[3.75rem] xl:w-[4.5rem]', // League
  'w-[3.25rem] xl:w-[4rem]', // Pct
  'w-[4.25rem] xl:w-[5rem]', // Overall
  'w-[2.5rem] xl:w-[3rem]', // GF
  'w-[2.5rem] xl:w-[3rem]', // GA
  'w-[6.75rem] xl:w-[7.5rem]', // GD: 64 track + 4 + 28 numeral
  'w-[2.75rem] xl:w-[3.25rem]', // Stk
  'w-[3.25rem] xl:w-[4rem]', // Home
  'w-[3.25rem] xl:w-[4rem]', // Away
  'w-[3.25rem] xl:w-[4rem]', // Neut
  'w-[8.875rem] xl:w-[9.25rem]', // Last 5: five 20px chips, 4px apart, right-aligned
] as const;

export function StandingsTable(props: StandingsTableProps) {
  const { variant, caption, highlightSlug, berthRuleAfter, gdDomain, className, id } = props;
  const flagged = new Set<TeamSlug>(props.flaggedSlugs ?? []);
  const rows = variant === 'mini' ? props.rows.slice(0, props.limit ?? 4) : props.rows;
  const showNotes = variant !== 'mini' && (props.notes ?? 'inline') === 'inline';
  const notes = showNotes ? collectStandingsNotes({ ...props, rows }) : null;

  const trClass = (row: StandingsRowData) => {
    const classes = ['relative'];
    // The pinned team's 2px accent left rule. A caller that already knows the team (the playoff
    // bracket) passes `highlightSlug`; on the static pages the pin lives in localStorage, so
    // `data-team-slug` below is what the end-of-body script in app/layout.tsx matches on.
    if (highlightSlug && row.team.slug === highlightSlug) classes.push('sx-pinned');
    return classes.join(' ');
  };
  // The 2px automatic-qualifier cut: the one deliberately strong line in the table.
  const cut = (index: number) =>
    berthRuleAfter && index + 1 === berthRuleAfter
      ? { borderBottom: '2px solid var(--sx-border-strong)' }
      : undefined;
  const hrefOf = (row: StandingsRowData) => row.href ?? `/teams/${row.team.slug}`;
  const formLabel = (row: StandingsRowData) =>
    `${row.team.name} last ${row.standing.computed.last5.length} league games`;

  const bleed = variant === 'phone' || variant === 'mini';

  return (
    <div className={className} id={id}>
      {/* `sx-flush` is `overflow: clip`, NOT `hidden`: `hidden` makes the card a scroll container,
          and a sticky `<thead>` then resolves its `top` against the card instead of the viewport
          — the head floated between rows 1 and 2 at rest and scrolled away entirely. */}
      <div className={`sx-card sx-flush${bleed ? ' sx-bleed' : ''}${variant === 'mini' ? ' @container' : ''}`}>
        <table
          className={
            variant === 'desktop'
              ? 'sx-table sx-table-wide text-cell xl:text-meta'
              : variant === 'archive'
                ? 'sx-table text-meta'
                : 'sx-table text-cell'
          }
        >
          {/* sr-only in every variant: "unofficial" and the through-date are in the section meta. */}
          <caption className="sr-only">{caption}</caption>

          {variant === 'phone' ? (
            <>
              <thead>
                <tr>
                  <th scope="col" className="w-[2.75rem] pl-gutter pr-2">
                    #
                  </th>
                  {/* The sticky head names the DIVISION, not "Team": once the section heading
                      has scrolled away under the chrome, this is the only thing on screen that
                      says which of the two tables you are in. A screen reader still hears
                      "… team" as the column's name. `whitespace-normal`: the head's nowrap made
                      "EL CAMINO" the team column's minimum width, which pushed the table 18px
                      past a 390 screen under a 24px browser font; it wraps there instead. */}
                  <th scope="col" className="whitespace-normal">
                    {DIVISION_LABELS[props.division]}
                    <span className="sr-only"> team</span>
                  </th>
                  <th scope="col" className="w-8 text-right">
                    <Abbr short="Pts" long="Points" />
                  </th>
                  {/* The League head (52px of 12px caps) is wider than its numerals (40px), and
                      the numerals carry 8px of right padding so they never run into the GD track
                      (or, below 375, into the GD numeral). From 390 there is room for the head to
                      take the same 8px; below it the head keeps the cell edge and drops its
                      letter-spacing, so it still clears "PTS" by about 7px. */}
                  <th
                    scope="col"
                    className="w-[56px] pl-1 text-right max-[389px]:tracking-normal min-[390px]:w-[68px] min-[390px]:px-2"
                  >
                    League
                  </th>
                  {/* 768-1023: the phone table spans a 720px card, so it shows four more of the
                      desktop columns instead of a 480px team cell with nothing in it. */}
                  <th scope="col" className="hidden w-16 pr-2 text-right md:table-cell">
                    <Abbr short="Pct" long="Win percentage" />
                  </th>
                  <th scope="col" className="hidden w-14 pr-2 text-right md:table-cell">
                    <Abbr short="GF" long="Goals for" />
                  </th>
                  <th scope="col" className="hidden w-14 pr-2 text-right md:table-cell">
                    <Abbr short="GA" long="Goals against" />
                  </th>
                  <th scope="col" className="hidden w-16 pr-2 text-right md:table-cell">
                    <Abbr short="Stk" long="Streak" />
                  </th>
                  {/* Column budget at 390: 44 (#) + 146 (Team) + 32 (PTS) + 68 (League: 8 + 52
                      + 8) + 100 (GD: 56 track + 4 + 24 numeral, three 13px mono glyphs, + 16
                      gutter). Below 390 League gives up 12px of head padding, and below 375 GD
                      keeps only its numeral, so a flagged "Monta Vista" stays whole at 320 and
                      at 375 (it ends 1-2px short of the team cell there).
                      The GD plot is the one thing that can afford to go. Below 375px the fixed
                      columns starved the team cell and long school names truncated to fragments,
                      against DESIGN §10.8's "reflow at 320px with no loss of content". The plot is
                      dropped there and the signed numeral stays, which is the cell's accessible
                      value anyway; the name is what a reader cannot do without. */}
                  <th
                    scope="col"
                    className="w-[44px] pr-gutter text-right min-[375px]:w-[100px]"
                  >
                    <Abbr short="GD" long="Goal difference" />
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
                      // A token in rem, not 68px: the row grows with the reader's browser text
                      // size, so the absolutely placed line 2 never rides up over line 1.
                      style={{ height: 'var(--spacing-row)', ...cut(index) }}
                    >
                      {/* Line 1 is top-aligned at 10px; the 13px numerals take 12px so their
                          20px line box centres on the 24px name line. */}
                      <td className="w-[2.75rem] pt-3 pl-gutter pr-2 align-top text-ink-3">
                        <PlaceCell standing={s} />
                      </td>
                      {/* An explicit `aria-label`, because a row header is re-announced on every
                          cell the reader moves to and this one otherwise accumulates everything in
                          the row: the row link's full label, the visible short name, the form
                          strip's own sentence and the overall record. The name alone is what a
                          cell announcement needs; the link keeps the full "1st in De Anza, 4-0-0,
                          12 points" and the form sentence is still in the row. */}
                      <th
                        scope="row"
                        aria-label={row.team.name}
                        className="max-w-0 pt-2.5 text-left align-top font-normal"
                      >
                        {/* `scroll-mt-9`: html's scroll-padding clears the 48px top bar and the
                            48px division bar, but not this table's own 36px sticky head, which
                            would otherwise cover half of a row focused by Shift+Tab. */}
                        <RowLink href={hrefOf(row)} label={rowLabel(row)} className="max-md:scroll-mt-9" />
                        <span className="flex items-center gap-2">
                          <TeamMonogram team={row.team} size={24} />
                          {/* shortName, not name: the phone team cell is ~158px at 390, so "St.
                              Ignatius College Preparatory" would truncate mid-word. The row link's
                              accessible name still carries the full school name. */}
                          <span className="min-w-0 truncate text-body font-semibold text-ink">
                            {row.team.shortName}
                          </span>
                          {isFlagged(row, flagged) ? <FlagMark name={row.team.name} /> : null}
                        </span>
                        {/* Line 2 runs the FULL row width — 44px indent (under the monogram), the
                            form strip, then the overall record — which a cell in a five-column
                            table cannot do. The <tr> is `position: relative`, so absolute placement
                            here spans the row. It is inert (the chips carry no links in this
                            variant), hence `pointer-events-none`: the row link stays whole.
                            The strip sits in a fixed 116px box (five 20px chips, 4px apart),
                            right-aligned, so a team with fewer than five results still has its
                            NEWEST chip and the overall record at the same x as every other row.
                            The box is in px, not rem, because the chips are: a 7.25rem box grew
                            to 174px under a 24px browser font around the same 116px of chips
                            and squeezed the record onto three lines, up into line 1.
                            Budget at 320: 44 + 116 + 8 + ~95 ("10-1-0" in 13px mono, then
                            " overall" in 13px sans, narrower than mono) = 263 of 304.
                            The League record (in its td) and this record never wrap at their
                            hyphens: under a large browser font (320-375 at 20/24px) a wrapped
                            League cell pushes its tail into line 2, and a wrapped line-2 record
                            grows UP into line 1. Not `truncate`: at 320/24px that clips every
                            row to "9-1-0 ov…", where nowrap lets the word run into the right
                            padding instead. */}
                        {has ? (
                          <span className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center gap-2 pl-[2.75rem] pr-gutter text-meta text-ink-3">
                            <span className="flex w-[116px] shrink-0 justify-end">
                              <FormStrip
                                entries={toFormEntries(s.computed.last5)}
                                size={20}
                                label={formLabel(row)}
                              />
                            </span>
                            {/* Mono for the digits only (they stack down the rows); the word is
                                prose and stays sans. */}
                            <span className="whitespace-nowrap text-cell text-ink-3">
                              <span className="sx-num">{recordString(s.overall)}</span> overall
                            </span>
                          </span>
                        ) : null}
                      </th>
                      {has ? (
                        <>
                          <td className="sx-num w-8 pt-2.5 text-right align-top text-body font-bold text-ink">
                            {s.computed.pts}
                          </td>
                          <td className="sx-num w-[56px] whitespace-nowrap pt-3 pl-1 pr-2 text-right align-top font-medium text-ink min-[390px]:w-[68px] min-[390px]:pl-2">
                            {recordString(s.computed)}
                          </td>
                          <td className="sx-num hidden w-16 pt-3 pr-2 text-right align-top font-medium text-ink md:table-cell">
                            {winPct(s.computed.winPct)}
                          </td>
                          <td className="sx-num hidden w-14 pt-3 pr-2 text-right align-top text-ink-2 md:table-cell">
                            {dash(s.computed.gf, has)}
                          </td>
                          <td className="sx-num hidden w-14 pt-3 pr-2 text-right align-top text-ink-2 md:table-cell">
                            {dash(s.computed.ga, has)}
                          </td>
                          <td className="sx-num hidden w-16 pt-3 pr-2 text-right align-top text-ink-2 md:table-cell">
                            {streakString(s.computed.streak)}
                          </td>
                          <td className="w-[44px] pt-3 pr-gutter text-right align-top min-[375px]:w-[100px]">
                            <GoalDiffCell
                              value={s.computed.gd}
                              domain={gdDomain}
                              track={56}
                              numberWidth={24}
                              numberClassName="text-cell"
                              barClassName="hidden min-[375px]:block"
                            />
                          </td>
                        </>
                      ) : (
                        /* No results (Wilcox): one sentence across the data columns, as on the
                           desktop table, instead of a row of em dashes and a stray `·`. The span
                           differs at md, where four more columns show; only one of the two cells
                           is ever displayed. The rank cell and the row link already say "not
                           ranked" / "no results reported yet" to a screen reader. */
                        <>
                          <td colSpan={3} className="pt-3 pr-gutter text-right align-top text-meta text-ink-3 md:hidden">
                            No results yet
                          </td>
                          <td colSpan={7} className="hidden pt-3 pr-gutter text-right align-top text-meta text-ink-3 md:table-cell">
                            No results yet
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </>
          ) : null}

          {variant === 'desktop' ? (
            <>
              <colgroup>
                {DESKTOP_COLS.map((width, i) => (
                  <col key={i} className={width || undefined} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  {/* The division, not "Team": see the phone head above. */}
                  <th scope="col">
                    {DIVISION_LABELS[props.division]}
                    <span className="sr-only"> team</span>
                  </th>
                  <th scope="col" className="text-right">
                    <Abbr short="Pts" long="Points" />
                  </th>
                  <th scope="col" className="text-right">
                    League
                  </th>
                  <th scope="col" className="text-right">
                    <Abbr short="Pct" long="Win percentage" />
                  </th>
                  <th scope="col" className="text-right">
                    Overall
                  </th>
                  <th scope="col" className="text-right">
                    <Abbr short="GF" long="Goals for" />
                  </th>
                  <th scope="col" className="text-right">
                    <Abbr short="GA" long="Goals against" />
                  </th>
                  <th scope="col" className="text-right">
                    <Abbr short="GD" long="Goal difference" />
                  </th>
                  <th scope="col" className="text-right">
                    <Abbr short="Stk" long="Streak" />
                  </th>
                  <th scope="col" className="text-right">
                    Home
                  </th>
                  <th scope="col" className="text-right">
                    Away
                  </th>
                  <th scope="col" className="text-right">
                    <Abbr short="Neut" long="Neutral site" />
                  </th>
                  {/* Right-aligned, head and strip: a team with fewer than five results then
                      ends on its NEWEST chip at the same x as every other row. */}
                  <th scope="col" className="text-right">
                    Last 5
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
                      // rem, not px: the row grows with the browser text size.
                      style={{ height: 'var(--spacing-row-1)', ...cut(index) }}
                    >
                      <td className="text-ink-3">
                        <PlaceCell standing={s} />
                      </td>
                      {/* `aria-label`: the row header is re-announced on every cell, and without
                          it carries the row link's whole sentence (see the phone variant). */}
                      <th scope="row" aria-label={row.team.name} className="text-left font-normal">
                        <RowLink href={hrefOf(row)} label={rowLabel(row)} />
                        <span className="flex items-center gap-3">
                          <TeamMonogram team={row.team} size={24} />
                          <span className="min-w-0 truncate text-body font-medium text-ink">
                            {row.team.shortName}
                          </span>
                          {isFlagged(row, flagged) ? <FlagMark name={row.team.name} /> : null}
                        </span>
                      </th>
                      {has ? (
                        <>
                          <td className="sx-num text-right text-body font-bold text-ink">
                            {s.computed.pts}
                          </td>
                          <td className="sx-num text-right font-medium text-ink">
                            {recordString(s.computed)}
                          </td>
                          <td className="sx-num text-right font-medium text-ink">
                            {winPct(s.computed.winPct)}
                          </td>
                          <td className="sx-num text-right text-ink-2">
                            {recordString(s.overall)}
                          </td>
                          <td className="sx-num text-right text-ink-2">{dash(s.computed.gf, has)}</td>
                          <td className="sx-num text-right text-ink-2">{dash(s.computed.ga, has)}</td>
                          <td className="text-right">
                            <GoalDiffCell
                              value={s.computed.gd}
                              domain={gdDomain}
                              track={64}
                              thickness={8}
                              numberWidth={28}
                            />
                          </td>
                          <td className="sx-num text-right text-ink-2">
                            {streakString(s.computed.streak)}
                          </td>
                          <td className="sx-num text-right text-ink-2">
                            {recordString(s.computed.homeRecord)}
                          </td>
                          <td className="sx-num text-right text-ink-2">
                            {recordString(s.computed.awayRecord)}
                          </td>
                          <td className="sx-num text-right text-ink-2">
                            {recordString(s.computed.neutralRecord)}
                          </td>
                          <td className="text-right">
                            <FormStrip
                              entries={toFormEntries(s.computed.last5)}
                              size={20}
                              label={formLabel(row)}
                            />
                          </td>
                        </>
                      ) : (
                        /* A team with no reported results gets ONE sentence across the
                           twelve data columns: no fabricated 0-0-0, no row of em dashes. The
                           place cell and the row link already say "not ranked" / "no results
                           reported yet" to a screen reader. */
                        <td colSpan={12} className="text-ink-3">
                          No results reported yet
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </>
          ) : null}

          {variant === 'mini' ? (
            <>
              {/* A VISIBLE head, static (`[&_th]:static`): the mini table is four rows on the home
                  page, too short for a sticky head to earn its keep. A head holding an `Abbr`
                  takes `relative` back, for its sr-only long form.
                  Columns run # · Team · Pts · League · GD, the full table's order, so the ordering
                  key sits next to the name. Pts is 32px; League is 68px with 8px a side, so its
                  52px head never touches "PTS". Fixed columns: 44 + 32 + 68 + 100 = 244, which
                  leaves 146px for the team in a 390 card and 160px in the 348px two-up card at
                  768 (GD is 44 there), so "St Francis" and "Santa Clara" stay whole.
                  The GD plot keys off the CARD's width (`@container` on the card), not the
                  viewport. The query is in rem (23.4375rem = 375px at the default 16px), so under
                  a larger browser text size the plot drops out earlier and the name keeps the room
                  it needs; the name also wraps to two lines rather than truncating. Below that
                  card width only the signed numeral shows. */}
              <thead className="[&_th]:static">
                <tr>
                  <th scope="col" className="w-[2.75rem] pl-gutter pr-2">
                    #
                  </th>
                  <th scope="col">Team</th>
                  <th scope="col" className="relative w-8 text-right">
                    <Abbr short="Pts" long="Points" />
                  </th>
                  <th scope="col" className="w-[68px] px-2 text-right">
                    League
                  </th>
                  <th
                    scope="col"
                    className="relative w-[44px] pr-gutter text-right @min-[23.4375rem]:w-[100px]"
                  >
                    <Abbr short="GD" long="Goal difference" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const s = row.standing;
                  const has = s.hasReportedResults;
                  return (
                    <tr
                      key={row.team.id}
                      data-team-slug={row.team.slug}
                      className={trClass(row)}
                      // rem, not px: the row grows with the browser text size.
                      style={{ height: 'var(--spacing-row-1)' }}
                    >
                      <td className="w-[2.75rem] pl-gutter pr-2 text-ink-3">
                        <PlaceCell standing={s} />
                      </td>
                      <th scope="row" aria-label={row.team.name} className="max-w-0 text-left font-normal">
                        <RowLink href={hrefOf(row)} label={rowLabel(row)} />
                        <span className="flex items-center gap-2">
                          <TeamMonogram team={row.team} size={24} />
                          {/* Two lines, never an ellipsis: under a large browser text size the
                              name wraps inside the row instead of losing its second word. */}
                          <span className="min-w-0 line-clamp-2 break-words text-body text-ink">
                            {row.team.shortName}
                          </span>
                        </span>
                      </th>
                      <td className="sx-num w-8 text-right text-body font-bold text-ink">
                        {has ? s.computed.pts : EM_DASH}
                      </td>
                      <td className="sx-num w-[68px] px-2 text-right font-medium text-ink">
                        {has ? recordString(s.computed) : EM_DASH}
                      </td>
                      <td className="w-[44px] pr-gutter text-right @min-[23.4375rem]:w-[100px]">
                        {has ? (
                          <GoalDiffCell
                            value={s.computed.gd}
                            domain={gdDomain}
                            track={56}
                            numberWidth={24}
                            numberClassName="text-cell"
                            barClassName="hidden @min-[23.4375rem]:block"
                          />
                        ) : (
                          <NoGoalDiff />
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
                  <th scope="col" className="w-[2.75rem] pl-4 pr-2 md:pl-5">
                    #
                  </th>
                  <th scope="col">Team</th>
                  <th scope="col" className="text-right">
                    League
                  </th>
                  <th scope="col" className="pr-4 text-right md:pr-5">
                    Overall
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.team.id}
                    data-team-slug={row.team.slug}
                    className={trClass(row)}
                    // rem, not px: the row grows with the browser text size.
                    style={{ height: 'var(--spacing-row-1)' }}
                  >
                    <td className="w-[2.75rem] pl-4 pr-2 text-ink-3 md:pl-5">
                      <PlaceCell standing={row.standing} />
                    </td>
                    <th scope="row" aria-label={row.team.name} className="text-left font-normal">
                      <RowLink href={hrefOf(row)} label={rowLabel(row)} />
                      <span className="flex items-center gap-2">
                        <TeamMonogram team={row.team} size={24} />
                        <span className="truncate text-body text-ink">{row.team.name}</span>
                      </span>
                    </th>
                    <td className="sx-num text-right font-medium text-ink">
                      {recordString(row.standing.computed)}
                    </td>
                    <td className="sx-num pr-4 text-right text-ink-2 md:pr-5">
                      {row.standing.overall.gp > 0 ? recordString(row.standing.overall) : EM_DASH}
                    </td>
                  </tr>
                ))}
              </tbody>
            </>
          ) : null}
        </table>
      </div>

      {notes && notes.legend.length + notes.specific.length > 0 ? (
        // `flex-col gap-2`, not `space-y-2`: the list carries `m-0`, which outranks v4's
        // zero-specificity space-y rule and would leave no gap above the link row.
        <div className="mt-3 flex max-w-prose flex-col gap-2 text-meta text-ink-3">
          <ul className="m-0 list-none space-y-1.5 p-0">
            {[...notes.specific, ...notes.legend].map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
          {/* Standalone actions, not prose: each carries its own 24px box (WCAG 2.5.8). */}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link
              href="/about#standings"
              prefetch={false}
              className="sx-action text-accent hover:underline"
            >
              How standings are computed
            </Link>
            {props.sourceUrl ? (
              <ExternalLink href={props.sourceUrl} className="sx-action gap-1">
                MaxPreps table
              </ExternalLink>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default StandingsTable;

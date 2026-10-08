import Link from 'next/link';

import type { StandingContext } from '../../lib/data';
import { EM_DASH, placeWords, recordString, recordWords, streakString, winPct } from '../../lib/format';
import { divisionHeading, leagueOfDivision } from '../../lib/leagues';
import type { DivisionId, Standing, Team, TeamId, TeamSlug } from '../../lib/types';

import ExternalLink from './ExternalLink';
import FormStrip, { toFormEntries } from './FormStrip';
import MissingValue from './MissingValue';
import { GoalDiffCell } from './GoalDiffBar';
import { articleFor, membershipSource } from './membership-words';
import PlaceMark from './PlaceMark';
import { formStripName, plural } from './plural';
import TeamMonogram from './TeamMonogram';

/**
 * The league table (DESIGN §3.2, §7.3), amended by BYLAWS-ADDENDUM.
 *
 * A PTS column SHIPS and it is the ordering key: By-Laws Article VI §2 awards 3 points for a win
 * and 1 for a tie, and "the division placement/standings will be the order of team points".
 * DESIGN §1.2's "no PTS column" and §11.8's win-percentage sort predate the by-laws PDF and are
 * superseded by it.
 *
 * SHARED PLACES ARE REAL. Every league's chain ends in a step we cannot compute (a coin flip, a
 * blind draw, a play-in), so two or more teams can carry the same `computed.place` with
 * `tiebreak.shared === true`. Those rows render LEVEL — the same number with the US sports-page
 * `T` prefix ("T7", never the British "7=") — and `tiebreak.note` (which already cites the rule)
 * goes into the footnotes. Two teams level on 7th leave no 8th.
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
 *
 * Multi-league (SPEC §10.3, §13.3 — additive only): `context` (`getStandingContext(division)`) and
 * `columns` add a GP column (every variant but archive; the phone row prints `<counted>/<scheduled>
 * GP` on its second line) and, on the desktop table, LEFT and MAX after PTS. LEFT is league games
 * with no counted result yet; MAX the most points a team could still reach — a ceiling, never a
 * projection. With the two new columns the desktop table drops its Home / Away / Neutral splits,
 * which the team page carries, so the team column keeps its width. A `†` follows W-L-T for a team
 * with a counted si.com score (`context.backfilled > 0`); the caller prints the footnote. Without
 * `context` and `columns` the table renders exactly today's columns.
 */
export type StandingsVariant = 'phone' | 'desktop' | 'mini' | 'archive';

export interface StandingsRowData {
  standing: Standing;
  team: Team;
  /** Defaults to /teams/[slug]. */
  href?: string;
}

export type StandingsColumn = 'gp' | 'left' | 'max';

export interface StandingsTableProps {
  division: DivisionId;
  /** Already sorted and ranked by lib/standings.ts. */
  rows: StandingsRowData[];
  /** max |gd| for THIS division — never global (R-2). */
  gdDomain: number;
  variant: StandingsVariant;
  /** "De Anza Division league standings through Sep 29" */
  caption: string;
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
  /** Derived per-row facts (`getStandingContext(division)`), keyed by team id. */
  context?: ReadonlyMap<TeamId, StandingContext>;
  /** Extra columns read from `context`: GP (all variants but archive), LEFT and MAX (desktop). */
  columns?: ReadonlyArray<StandingsColumn>;
}

/** The † after W-L-T: this team's record includes a score published from si.com (SPEC §7.9). */
function BackfillMark({ context }: { context: StandingContext | undefined }) {
  if (!context || context.backfilled === 0) return null;
  return (
    <>
      <span aria-hidden="true">&dagger;</span>
      <span className="sr-only">
        {context.backfilled === 1
          ? ', includes 1 score via si.com'
          : `, includes ${context.backfilled} scores via si.com`}
      </span>
    </>
  );
}

/**
 * `6/12` games counted of the division's scheduled league games, or the bare count (`6`) in a league
 * with no fixed schedule (the Sunset, `scheduled` null: DESIGN-socal §2.1.7), which has no "of N".
 */
function gpText(context: StandingContext | undefined): string {
  if (!context) return EM_DASH;
  return context.scheduled === null ? `${context.counted}` : `${context.counted}/${context.scheduled}`;
}

/** The GP head's title: "of those scheduled" only where there is a schedule to count against. */
function gpTitle(fixed: boolean): string {
  return fixed ? 'League games counted of those scheduled' : 'League games counted';
}

/** The division as a reader names it: its heading, or the league's short name for a one-table league. */
/**
 * The biggest |goal difference| among `gds`, 0 when there is none. Not `getGoalDiffDomain`
 * (lib/data.ts), which floors at 1 so a bar never divides by zero: that floor is a scale, never a
 * fact to print. Every place that prints "biggest goal difference (N)" asks this first and leaves the
 * clause out when it is 0 (StandingsTable's legend, DivisionStandings, MiniStandings, the standings
 * page's disclosure).
 */
export function biggestGoalDiff(gds: readonly number[]): number {
  return Math.max(0, ...gds.map((gd) => Math.abs(gd)));
}

function tableName(division: DivisionId): string {
  return divisionHeading(division) ?? leagueOfDivision(division).shortName;
}

/**
 * The colour comes from the cell (rank is ink-3 in every variant). '1', 'T7' for a shared place,
 * an em dash for a team with no reported results. `whitespace-nowrap`: the phone and mini place
 * column is 20px of content at 320 and "T7" is ~16px of 13px mono, so it must never break into
 * a "T" over a "7".
 */
function PlaceCell({ standing }: { standing: Standing }) {
  return (
    <PlaceMark
      place={standing.computed.place}
      shared={standing.tiebreak.shared}
      ranked={standing.hasReportedResults}
      className="sx-num"
    />
  );
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
 * the moment the link enters the viewport. SCVAL's fifteen rows in one viewport are fifteen whole
 * team pages — measured at 97 KB on the wire and 876 KB decoded, against a 35 KB document.
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
  const place = placeWords(standing.computed.place, standing.tiebreak.shared);
  // The record in WORDS: "4-1-0" read aloud is a subtraction or a date, depending on the voice.
  return `${team.name}, ${place} in ${tableName(team.division)}, ${recordWords(
    standing.computed,
  )}, ${plural(standing.computed.pts, 'point')}`;
}


/**
 * The table's notes, split by where they belong (brief §4.22):
 *  - `legend`: the GD paragraph and the PTS paragraph — generic, and verbatim the same under every
 *    table, so a page may print them once;
 *  - `specific`: shared-place notes, the no-results team, `standing.mismatch` flags and the
 *    caller's `footnotes` — facts about THIS division, which always stay visible.
 *
 * `statedElsewhere`: teams whose MaxPreps difference the caller's Notes block already states in
 * its comparison list (StandingsNotes). Their `standing.mismatch` note is left out, so one fact is
 * not said twice in one list in two wordings.
 */
export function collectStandingsNotes(
  props: Pick<StandingsTableProps, 'rows' | 'gdDomain' | 'division' | 'variant' | 'footnotes'> & {
    statedElsewhere?: readonly TeamSlug[];
  },
): { legend: React.ReactNode[]; specific: React.ReactNode[] } {
  const legend: React.ReactNode[] = [];
  const specific: React.ReactNode[] = [];
  const { rows, gdDomain, division, variant } = props;
  if (variant !== 'archive') {
    // The scale names the division's biggest goal difference only when there is one: `gdDomain` is
    // floored at 1 for the bar arithmetic, and "(1)" printed for a division where every |GD| is 0
    // (Metro South Bay before its first game) stated a goal difference nobody has (review 2026-10-06).
    const scale =
      biggestGoalDiff(rows.map((r) => r.standing.computed.gd)) > 0
        ? `, to ${tableName(division)}’s biggest goal difference (${gdDomain})`
        : '';
    legend.push(
      `GD = league goals for minus goals against. Bars are scaled per division${scale}, so bars in different divisions are not comparable to each other. A real 0 shows as 0; a score we do not have shows as an em dash. Forfeits count in the win-loss-tie record, not in the goal columns.`,
    );
    legend.push(`PTS: ${leagueOfDivision(division).rules.citations.points}.`);
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
      // A league with no documents of its own (`official.mode: 'none'`) publishes no alignment, so
      // nothing says "official". "As MaxPreps lists it" only where MaxPreps' table for this division
      // lists the team (the EAL); otherwise the league's membership source is named (Newport
      // Harbor, Hilltop, Southwest: components/ui/membership-words.ts).
      const table = tableName(row.team.division);
      const source = membershipSource(row.team.division, [row.team.slug]);
      const is =
        source.kind === 'maxpreps'
          ? `is in the ${table} table as MaxPreps lists it`
          : source.kind === 'official'
            ? `is in the official ${table} alignment`
            : `is ${articleFor(table)} ${table} team (${source.source})`;
      specific.push(
        `${row.team.name} ${is} but has no results in the source table — no record is invented for them.`,
      );
    }
    if (row.standing.mismatch && !props.statedElsewhere?.includes(row.team.slug)) {
      // The pipeline's detail ("overall record 3-2-3 vs MaxPreps 3-3-2") has no full stop.
      const detail = row.standing.mismatchDetail?.replace(/\.?$/, '.');
      specific.push(
        <>
          <span aria-hidden="true">&#9873;</span>
          <span className="sr-only">Flagged:</span> {row.team.name}:{' '}
          {detail ?? 'our computation differs from MaxPreps.'} We show our own
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

/**
 * No results: a `·` on the zero rule plus an em dash, with the words for a screen reader. The home
 * page's mini table (components/home/MiniStandings.tsx) renders the same cell.
 */
export function NoGoalDiff() {
  return (
    <span className="sx-num text-ink-3">
      <MissingValue words="no goal differential" glyph={`\u00b7 ${EM_DASH}`} />
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
const COL = {
  place: 'w-[3rem] xl:w-[3.5rem]', // #
  team: '', // Team (auto)
  gp: 'w-[3.25rem] xl:w-[3.75rem]', // GP: "12/16" is five 13px mono glyphs
  pts: 'w-[3rem] xl:w-[3.5rem]', // PTS
  left: 'w-[3rem] xl:w-[3.5rem]', // LEFT
  max: 'w-[3rem] xl:w-[3.5rem]', // MAX
  league: 'w-[3.75rem] xl:w-[4.5rem]', // League (+ 7px for a †)
  pct: 'w-[3.25rem] xl:w-[4rem]', // Pct
  overall: 'w-[4.25rem] xl:w-[5rem]', // Overall
  gf: 'w-[2.5rem] xl:w-[3rem]', // GF
  ga: 'w-[2.5rem] xl:w-[3rem]', // GA
  gd: 'w-[6.75rem] xl:w-[7.5rem]', // GD: 64 track + 4 + 28 numeral
  stk: 'w-[2.75rem] xl:w-[3.25rem]', // Stk
  home: 'w-[3.25rem] xl:w-[4rem]', // Home
  away: 'w-[3.25rem] xl:w-[4rem]', // Away
  neut: 'w-[3.25rem] xl:w-[4rem]', // Neut
  l5: 'w-[8.875rem] xl:w-[9.25rem]', // Last 5: five 20px chips, 4px apart, right-aligned
} as const;
type DesktopCol = keyof typeof COL;

/**
 * The desktop columns in order. With GP / LEFT / MAX on, the Home / Away / Neutral splits go (the
 * team page has them): three 3rem columns in, three 3.25rem out, so Team keeps ≈170px at 1024.
 */
function desktopCols(gp: boolean, left: boolean, max: boolean): DesktopCol[] {
  const extended = gp || left || max;
  return [
    'place',
    'team',
    ...(gp ? (['gp'] as const) : []),
    'pts',
    ...(left ? (['left'] as const) : []),
    ...(max ? (['max'] as const) : []),
    'league',
    'pct',
    'overall',
    'gf',
    'ga',
    'gd',
    'stk',
    ...(extended ? [] : (['home', 'away', 'neut'] as const)),
    'l5',
  ];
}

/**
 * Each desktop head: `long` (when set) is what a screen reader hears with every cell of the column
 * (`Abbr`). GP, Left and Max carry a `title` instead and stay plain words. The team head is the
 * table's own name (`tableName`), filled in per render: see the phone head.
 */
const DESKTOP_HEAD: Record<DesktopCol, { label: string; right: boolean; title?: string; long?: string }> = {
  place: { label: '#', right: false },
  team: { label: 'Team', right: false },
  gp: { label: 'GP', right: true, title: 'League games counted of those scheduled' },
  pts: { label: 'Pts', right: true, long: 'Points' },
  left: { label: 'Left', right: true, title: 'League games with no counted result yet' },
  max: { label: 'Max', right: true, title: 'The most points still reachable' },
  league: { label: 'League', right: true },
  pct: { label: 'Pct', right: true, long: 'Win percentage' },
  overall: { label: 'Overall', right: true },
  gf: { label: 'GF', right: true, long: 'Goals for' },
  ga: { label: 'GA', right: true, long: 'Goals against' },
  gd: { label: 'GD', right: true, long: 'Goal difference' },
  stk: { label: 'Stk', right: true, long: 'Streak' },
  home: { label: 'Home', right: true },
  away: { label: 'Away', right: true },
  neut: { label: 'Neut', right: true, long: 'Neutral site' },
  // Right-aligned, head and strip: a team with fewer than five results then ends on its NEWEST
  // chip at the same x as every other row.
  l5: { label: 'Last 5', right: true },
};

export function StandingsTable(props: StandingsTableProps) {
  const { variant, caption, berthRuleAfter, gdDomain, className, id } = props;
  const flagged = new Set<TeamSlug>(props.flaggedSlugs ?? []);
  const context = props.context;
  const columns = new Set<StandingsColumn>(context ? (props.columns ?? []) : []);
  const showGp = columns.has('gp');
  const ctx = (row: StandingsRowData) => context?.get(row.team.id);
  // Every row of a table shares its division's schedule, so one null `scheduled` means none is fixed.
  const fixedSchedule = props.rows.every((row) => ctx(row)?.scheduled !== null);
  const cols = desktopCols(showGp, columns.has('left'), columns.has('max'));
  const rows = variant === 'mini' ? props.rows.slice(0, props.limit ?? 4) : props.rows;
  const showNotes = variant !== 'mini' && (props.notes ?? 'inline') === 'inline';
  const notes = showNotes ? collectStandingsNotes({ ...props, rows }) : null;

  // The pinned team's 2px accent left rule has one channel. The pages are static and the pin lives
  // in localStorage, so every row carries `data-team-slug`, and the pinned-team head script
  // (components/layout/pinned-team-script.ts, run from app/layout.tsx's <head>; then
  // components/ui/PinnedTeamMarks.tsx after a client navigation) sets `[data-pinned]` on the
  // matching row.
  // The 2px automatic-qualifier cut: the one deliberately strong line in the table.
  const cut = (index: number) =>
    berthRuleAfter && index + 1 === berthRuleAfter
      ? { borderBottom: '2px solid var(--sx-border-strong)' }
      : undefined;
  const hrefOf = (row: StandingsRowData) => row.href ?? `/teams/${row.team.slug}`;
  const formLabel = (row: StandingsRowData) =>
    formStripName(row.team.name, row.standing.computed.last5.length);

  const bleed = variant === 'phone' || variant === 'mini';

  return (
    <div className={className} id={id}>
      {/* `sx-flush` is `overflow: clip`, NOT `hidden`: `hidden` makes the card a scroll container,
          and a sticky `<thead>` then resolves its `top` against the card instead of the viewport
          — the head floated between rows 1 and 2 at rest and scrolled away entirely. */}
      <div
        className={['sx-card sx-flush', bleed ? 'sx-bleed' : null, variant === 'mini' ? '@container' : null]
          .filter(Boolean)
          .join(' ')}
      >
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
                  {/* The sticky head names the TABLE (its division heading, or the league's short
                      name for a one-table league), not "Team": once the section heading has
                      scrolled away under the chrome, this is the only thing on screen that says
                      which table you are in. A screen reader still hears "… team" as the column's
                      name. `whitespace-normal`: the head's nowrap made "EL CAMINO" the team
                      column's minimum width, which pushed the table 18px past a 390 screen under a
                      24px browser font; it wraps there instead. */}
                  <th scope="col" className="whitespace-normal">
                    {tableName(props.division)}
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
                  {/* Column budget at 390: 44 (#) + 158 (Team) + 32 (PTS) + 68 (League: 8 + 52
                      + 8) + 88 (GD: 44 track + 4 + 24 numeral, three 13px mono glyphs, + 16
                      gutter). The track was 56 until the longest short names ("Lick-Wilmerding"
                      125px of 16px semibold, "Valley Christian" 120, "Marin Academy" 119) needed
                      the 12px it gave up: at 56 they truncated at 390 to "Lick-Wilmerd…". Below
                      390 League gives up 12px of head padding, and below 375 GD keeps only its
                      numeral, so a flagged "Monta Vista" stays whole at 320 and at 375.
                      The GD plot is the one thing that can afford to go. Below 375px the fixed
                      columns starved the team cell and long school names truncated to fragments,
                      against DESIGN §10.8's "reflow at 320px with no loss of content". The plot is
                      dropped there and the signed numeral stays, which is the cell's accessible
                      value anyway; the name is what a reader cannot do without.
                      The threshold is 23.4375rem, not 375px: 375 at the default text size, 562
                      under a 24px browser font, where a px query kept the 100px plot at 390 and
                      the table ran 10px past its card ("T4" and "Mt. Hamilton" grow, the plot
                      does not). The same unit the line-2 record and the mini table's query use. */}
                  <th
                    scope="col"
                    className="w-[44px] pr-gutter text-right min-[23.4375rem]:w-[88px]"
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
                      className="relative"
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
                          {/* shortName, not name: the phone team cell is ~158px at 390, so
                              "Convent of the Sacred Heart" would truncate mid-word. The row link's
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
                            padding instead. Where GP also leads the line (a caller that passes
                            the `gp` column, as every league page does), the record gives way
                            below 23.4375rem rather than wrap or clip: see the budget there. */}
                        {has ? (
                          <span className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center gap-2 pl-[2.75rem] pr-gutter text-meta text-ink-3">
                            <span className="flex w-[116px] shrink-0 justify-end">
                              <FormStrip
                                entries={toFormEntries(s.computed.last5)}
                                size={20}
                                label={formLabel(row)}
                              />
                            </span>
                            {/* GP leads the overall record. Budget at 16px: 44 + 116 + 8 + ~56
                                ("6/12 GP") + 8 + ~95 ("10-1-0 overall") + 16 right gutter = 343,
                                past a 320 row, inside a 375 one. Everything but the 116px strip
                                is in rem and grows with the browser text size (at 24px the same
                                line is ~470), so the threshold is in rem too: 23.4375rem is 375px
                                at 16px, 469 at 20px and 562 at 24px — the unit the GD container
                                query uses. Below it the record gives way rather than run past
                                the card edge and be clipped mid-word ("9-1-0 over"); the team
                                page still carries it. */}
                            {showGp ? (
                              <span className="sx-num shrink-0 text-cell text-ink-3">{gpText(ctx(row))} GP</span>
                            ) : null}
                            {/* Mono for the digits only (they stack down the rows); the word is
                                prose and stays sans. */}
                            <span
                              className={[
                                'whitespace-nowrap text-cell text-ink-3',
                                showGp ? 'max-[23.4375rem]:hidden' : null,
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            >
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
                            <BackfillMark context={ctx(row)} />
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
                          <td className="w-[44px] pt-3 pr-gutter text-right align-top min-[23.4375rem]:w-[88px]">
                            <GoalDiffCell
                              value={s.computed.gd}
                              domain={gdDomain}
                              track={44}
                              numberWidth={24}
                              numberClassName="text-cell"
                              barClassName="hidden min-[23.4375rem]:block"
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
                          <td data-twin colSpan={3} className="pt-3 pr-gutter text-right align-top text-meta text-ink-3 md:hidden">
                            No results yet
                          </td>
                          <td data-twin colSpan={7} className="hidden pt-3 pr-gutter text-right align-top text-meta text-ink-3 md:table-cell">
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
                {cols.map((col) => (
                  <col key={col} className={COL[col] || undefined} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  {cols.map((col) => {
                    const head = DESKTOP_HEAD[col];
                    if (col === 'team') {
                      // The table's name, not "Team" (see the phone head above).
                      return (
                        <th key={col} scope="col">
                          {tableName(props.division)}
                          <span className="sr-only"> team</span>
                        </th>
                      );
                    }
                    return (
                      <th
                        key={col}
                        scope="col"
                        title={col === 'gp' ? gpTitle(fixedSchedule) : head.title}
                        className={head.right ? 'text-right' : undefined}
                      >
                        {head.long ? <Abbr short={head.label} long={head.long} /> : head.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const s = row.standing;
                  const has = s.hasReportedResults;
                  const c = ctx(row);
                  const cell = (col: DesktopCol): React.ReactNode => {
                    switch (col) {
                      case 'gp':
                        return <td key={col} className="sx-num text-right text-ink-2">{gpText(c)}</td>;
                      case 'pts':
                        return (
                          <td key={col} className="sx-num text-right text-body font-bold text-ink">
                            {s.computed.pts}
                          </td>
                        );
                      case 'left':
                        return <td key={col} className="sx-num text-right text-ink-2">{c?.remaining ?? EM_DASH}</td>;
                      case 'max':
                        return <td key={col} className="sx-num text-right text-ink-2">{c?.maxPts ?? EM_DASH}</td>;
                      case 'league':
                        return (
                          <td key={col} className="sx-num text-right font-medium text-ink">
                            {recordString(s.computed)}
                            <BackfillMark context={c} />
                          </td>
                        );
                      case 'pct':
                        return (
                          <td key={col} className="sx-num text-right font-medium text-ink">
                            {winPct(s.computed.winPct)}
                          </td>
                        );
                      case 'overall':
                        return <td key={col} className="sx-num text-right text-ink-2">{recordString(s.overall)}</td>;
                      case 'gf':
                        return <td key={col} className="sx-num text-right text-ink-2">{dash(s.computed.gf, has)}</td>;
                      case 'ga':
                        return <td key={col} className="sx-num text-right text-ink-2">{dash(s.computed.ga, has)}</td>;
                      case 'gd':
                        return (
                          <td key={col} className="text-right">
                            <GoalDiffCell
                              value={s.computed.gd}
                              domain={gdDomain}
                              track={64}
                              thickness={8}
                              numberWidth={28}
                            />
                          </td>
                        );
                      case 'stk':
                        return (
                          <td key={col} className="sx-num text-right text-ink-2">
                            {streakString(s.computed.streak)}
                          </td>
                        );
                      case 'home':
                        return <td key={col} className="sx-num text-right text-ink-2">{recordString(s.computed.homeRecord)}</td>;
                      case 'away':
                        return <td key={col} className="sx-num text-right text-ink-2">{recordString(s.computed.awayRecord)}</td>;
                      case 'neut':
                        return <td key={col} className="sx-num text-right text-ink-2">{recordString(s.computed.neutralRecord)}</td>;
                      case 'l5':
                        return (
                          <td key={col} className="text-right">
                            <FormStrip
                              entries={toFormEntries(s.computed.last5)}
                              size={20}
                              label={formLabel(row)}
                            />
                          </td>
                        );
                      default:
                        return null;
                    }
                  };
                  return (
                    <tr
                      key={row.team.id}
                      data-team-slug={row.team.slug}
                      className="relative"
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
                        cols.slice(2).map(cell)
                      ) : (
                        /* A team with no reported results gets ONE sentence across the data
                           columns: no fabricated 0-0-0, no row of em dashes. The place cell and
                           the row link already say "not ranked" / "no results reported yet" to a
                           screen reader. GP still reads 0/12 where the column is on: a fact, not
                           a rank. */
                        <>
                          {showGp ? cell('gp') : null}
                          <td colSpan={cols.length - (showGp ? 3 : 2)} className="text-ink-3">
                            No results reported yet
                          </td>
                        </>
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
                  Columns run # · Team · (GP) · Pts · League · GD, the full table's order, so the
                  ordering key sits next to the name. Pts is 32px; League is 68px with 8px a side,
                  so its 52px head never touches "PTS". Fixed columns: 44 + 32 + 68 + 100 = 244,
                  which leaves 146px for the team in a 390 card (less the 36px GP column where it
                  shows).
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
                  {showGp ? (
                    <th scope="col" className="w-9 text-right" title={gpTitle(fixedSchedule)}>
                      GP
                    </th>
                  ) : null}
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
                      className="relative"
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
                          {/* Two lines, broken at a space (no `break-words`, which split a name
                              per letter in a narrow cell): under a large browser text size the
                              name wraps inside the row instead of losing its second word. */}
                          <span className="min-w-0 line-clamp-2 text-ellipsis text-body text-ink">
                            {row.team.shortName}
                          </span>
                        </span>
                      </th>
                      {showGp ? (
                        // Mono 11px: "12/16" fits the 36px column with its padding.
                        <td className="sx-num w-9 text-right text-[0.6875rem] text-ink-3">
                          {gpText(ctx(row))}
                        </td>
                      ) : null}
                      <td className="sx-num w-8 text-right text-body font-bold text-ink">
                        {has ? s.computed.pts : EM_DASH}
                      </td>
                      <td className="sx-num w-[68px] px-2 text-right font-medium text-ink">
                        {has ? recordString(s.computed) : EM_DASH}
                        {has ? <BackfillMark context={ctx(row)} /> : null}
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
                    className="relative"
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

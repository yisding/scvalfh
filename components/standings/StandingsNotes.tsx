import Link from 'next/link';

import { ordinal } from '../../lib/format';
import type { Standing } from '../../lib/types';
import ExternalLink from '../ui/ExternalLink';
import type { StandingsRowData } from '../ui/StandingsTable';

import type { MismatchNote, UnreportedFixtures } from './standings-view';

/**
 * The division's Notes block (DESIGN §9, §8; brief §4.22): an inset under the table that holds
 * every fact specific to THIS division, always visible.
 *
 *  1. The table's own notes: shared places (Article VI §7), the team with no results, any
 *     `standing.mismatch` flag.
 *  2. Every disagreement with MaxPreps' own published table, in PLAIN SENTENCES, with our figure
 *     and theirs. We show OUR computation and say so. AGREEMENT is published too — silence would
 *     be indistinguishable from not checking. The cross-check log's raw field names ("place (we
 *     order on points, Art. VI §2; MaxPreps orders on win pct)") are for /about#cross-check; here
 *     they are rewritten at render time, without touching lib or the snapshot:
 *      - a RECIPROCAL place swap (we have A 1st and B 2nd, MaxPreps the other way round) is ONE
 *        item naming both teams, because it is one fact: MaxPreps ranks by win percentage, the
 *        by-laws rank by points;
 *      - a lone place difference reads "3rd here, 4th on MaxPreps", and only claims the
 *        win-percentage reason when the win percentages involved actually differ;
 *      - a place we hold LEVEL (Article VI §7) says so: "level 7th here (coin flip …)".
 *     One ⚑ per item and the sr-only "Flagged:" stay, so each ⚑ in the table has a line here.
 *  3. Official SCVAL fixtures that no source has published a contest for. We do not invent a
 *     result for them, and we do not let the absence read as a team that did not play.
 *  4. Division-specific footnotes (league games played with no score; no league results yet).
 *  5. One row of links: the cross-check log and the primary sources. They are standalone actions
 *     (`sx-action`, a 24px floor), with no `·` text nodes between them. "How standings are
 *     computed" is NOT repeated here: the page foot carries it once, as a pill.
 *
 * It shares an `lg` row with the CCS card, so it takes the card's padding, radius and `text-lead`
 * h3 and the two read as one row; the inset surface stays, because this is commentary. The row
 * stretches both panels to the taller one and this block is a flex column whose link row is
 * pushed down (`mt-auto`), so both link rows end on the same line.
 *
 * It sits OUTSIDE the two table variants so it renders once, not once per breakpoint.
 */
export interface StandingsNotesProps {
  divisionLabel: string;
  /**
   * The division's rows, for the facts a mismatch sentence needs (is the place shared, do the win
   * percentages differ). Without them the sentences make no win-percentage claim.
   */
  rows?: readonly StandingsRowData[];
  /** `collectStandingsNotes(...).specific` without the footnotes. */
  tableNotes?: React.ReactNode[];
  mismatches: MismatchNote[];
  unreported: UnreportedFixtures;
  /** Division-specific footnotes, printed last. */
  footnotes?: string[];
  /** The MaxPreps league table for this division. */
  sourceUrl?: string;
  /** The official SCVAL schedule-grid PDF for this division. */
  scheduleUrl: string;
  className?: string;
}

/** The in-site explanation every division's notes point at. */
const ABOUT_LINKS = [{ href: '/about#cross-check', label: 'Cross-check log' }] as const;

/** lib/standings.ts `buildCrossCheck` field names: the place row starts with "place". */
const isPlaceField = (field: string) => field.startsWith('place');

/** The log's terse field names, in words. Anything unknown is printed as it comes. */
const FIELD_WORDS: Record<string, string> = {
  'league record': 'league record',
  'overall record': 'overall record',
  'league goals for': 'league goals scored',
  'league goals against': 'league goals conceded',
  'win pct': 'league win percentage',
};

type FieldItem = Pick<MismatchNote, 'field' | 'ours' | 'theirs'>;

interface FlagLine {
  slug: string;
  name: string;
  /** The place disagreement, when there is one: our place and MaxPreps' (null if it gives none). */
  place: { ours: number; theirs: number | null } | null;
  /** Every other field. */
  items: FieldItem[];
  urls: string[];
}

/** One ⚑ per team, keeping every field's figures. */
function byTeam(mismatches: MismatchNote[]): FlagLine[] {
  const lines = new Map<string, FlagLine>();
  for (const note of mismatches) {
    const line = lines.get(note.slug) ?? {
      slug: note.slug,
      name: note.name,
      place: null,
      items: [],
      urls: [],
    };
    const ours = Number(note.ours);
    if (isPlaceField(note.field) && Number.isInteger(ours)) {
      const theirs = Number(note.theirs);
      line.place = { ours, theirs: Number.isInteger(theirs) ? theirs : null };
    } else {
      line.items.push({ field: note.field, ours: note.ours, theirs: note.theirs });
    }
    if (!line.urls.includes(note.url)) line.urls.push(note.url);
    lines.set(note.slug, line);
  }
  return [...lines.values()];
}

type NoteItem =
  | { kind: 'swap'; key: string; a: FlagLine; b: FlagLine }
  | { kind: 'team'; key: string; line: FlagLine };

/** Pair every reciprocal place swap (A ours 1 / theirs 2, B ours 2 / theirs 1) into one item. */
function toItems(lines: FlagLine[]): NoteItem[] {
  const paired = new Set<string>();
  const items: NoteItem[] = [];
  for (const line of lines) {
    if (paired.has(line.slug)) continue;
    const p = line.place;
    const partner =
      p && p.theirs !== null && p.theirs !== p.ours
        ? lines.find(
            (other) =>
              other.slug !== line.slug &&
              !paired.has(other.slug) &&
              other.place?.ours === p.theirs &&
              other.place.theirs === p.ours,
          )
        : undefined;
    if (partner) {
      paired.add(line.slug);
      paired.add(partner.slug);
      const [a, b] = p!.ours < partner.place!.ours ? [line, partner] : [partner, line];
      items.push({ kind: 'swap', key: `${a.slug}+${b.slug}`, a, b });
    } else {
      items.push({ kind: 'team', key: line.slug, line });
    }
  }
  return items;
}

/** Win percentages to the three places both tables print, so .8333 and .833 are the same. */
const pct3 = (s: Standing) => Math.round(s.computed.winPct * 1000);

/**
 * Does MaxPreps' win-percentage ordering explain a place difference? Only if it points the same
 * way: MaxPreps puts the team LOWER than we do only if a team between the two places has a higher
 * win percentage, and HIGHER only if one has a lower percentage. A percentage that merely differs
 * does not establish the cause (the gap could be a game one table counts and the other does not),
 * and then no reason is given. Unknown (no rows, no MaxPreps place) claims nothing.
 */
function winPctExplains(
  slug: string,
  place: { ours: number; theirs: number | null },
  rows: readonly StandingsRowData[],
): boolean {
  const theirs = place.theirs;
  if (theirs === null || theirs === place.ours) return false;
  const self = rows.find((r) => r.team.slug === slug)?.standing;
  if (!self) return false;
  const lo = Math.min(place.ours, theirs);
  const hi = Math.max(place.ours, theirs);
  const outranksOnPct = (other: Standing) =>
    theirs > place.ours ? pct3(other) > pct3(self) : pct3(other) < pct3(self);
  return rows.some(
    (r) =>
      r.team.slug !== slug &&
      r.standing.hasReportedResults &&
      r.standing.computed.place >= lo &&
      r.standing.computed.place <= hi &&
      outranksOnPct(r.standing),
  );
}

const RULE_SENTENCE = 'SCVAL ranks by points (Article VI §2), and so do we.';

/** "league record 1-3-2 here, 1-4-2 on MaxPreps; …" */
function FieldPhrases({ items }: { items: FieldItem[] }) {
  return (
    <>
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 ? '; ' : null}
          {FIELD_WORDS[item.field] ?? item.field} <span className="sx-num text-ink">{item.ours}</span>{' '}
          here, <span className="sx-num text-ink">{item.theirs}</span> on MaxPreps
        </span>
      ))}
    </>
  );
}

function Flag() {
  return (
    <>
      <span aria-hidden="true">&#9873;</span>
      <span className="sr-only">Flagged:</span>{' '}
    </>
  );
}

const Name = ({ children }: { children: React.ReactNode }) => (
  <b className="font-semibold text-ink">{children}</b>
);

/** A lone team: its place sentence (if any), then any other fields. */
function TeamSentence({ line, rows }: { line: FlagLine; rows: readonly StandingsRowData[] }) {
  const p = line.place;
  const shared = rows.find((r) => r.team.slug === line.slug)?.standing.tiebreak.shared ?? false;
  const reason = p ? winPctExplains(line.slug, p, rows) : false;
  return (
    <>
      <Name>{line.name}</Name>:{' '}
      {p ? (
        shared ? (
          <>
            level {ordinal(p.ours)} here (coin flip, Article VI §7)
            {p.theirs === null ? '; MaxPreps gives no place' : `; MaxPreps puts it ${ordinal(p.theirs)}`}
            .
          </>
        ) : (
          <>
            {ordinal(p.ours)} here,{' '}
            {p.theirs === null ? 'no place on MaxPreps' : `${ordinal(p.theirs)} on MaxPreps`}.
          </>
        )
      ) : null}
      {p && reason ? <> MaxPreps ranks by win percentage. {RULE_SENTENCE}</> : null}
      {line.items.length > 0 ? (
        <>
          {p ? ' Also ' : null}
          <FieldPhrases items={line.items} />. We publish our own computation.
        </>
      ) : null}
    </>
  );
}

/** "St Francis (1st) and St Ignatius (2nd): MaxPreps lists them the other way round because …" */
function SwapSentence({
  a,
  b,
  rows,
}: {
  a: FlagLine;
  b: FlagLine;
  rows: readonly StandingsRowData[];
}) {
  const reason = winPctExplains(a.slug, a.place!, rows);
  return (
    <>
      <Name>{a.name}</Name> ({ordinal(a.place!.ours)}) and <Name>{b.name}</Name> (
      {ordinal(b.place!.ours)}): MaxPreps lists them the other way round
      {reason ? ' because it ranks by win percentage' : null}. {RULE_SENTENCE}
      {[a, b]
        .filter((line) => line.items.length > 0)
        .map((line) => (
          <span key={line.slug}>
            {' '}
            {line.name}: <FieldPhrases items={line.items} />.
          </span>
        ))}
    </>
  );
}

/** A per-team MaxPreps link only when it is NOT the division table linked below. */
function TeamLinks({ lines, sourceUrl }: { lines: FlagLine[]; sourceUrl?: string }) {
  const urls = [...new Set(lines.flatMap((line) => line.urls))].filter((url) => url !== sourceUrl);
  return (
    <>
      {urls.map((url) => (
        <span key={url}>
          {' '}
          <ExternalLink href={url}>MaxPreps table</ExternalLink>
        </span>
      ))}
    </>
  );
}

export function StandingsNotes({
  divisionLabel,
  rows = [],
  tableNotes = [],
  mismatches,
  unreported,
  footnotes = [],
  sourceUrl,
  scheduleUrl,
  className,
}: StandingsNotesProps) {
  const items = toItems(byTeam(mismatches));
  return (
    <div
      className={`sx-inset flex flex-col rounded-card-lg p-5 md:p-6${className ? ` ${className}` : ''}`}
    >
      <h3 className="m-0 text-lead text-ink">Notes</h3>
      <ul className="mt-3 mb-0 max-w-prose list-none space-y-2 p-0">
        {tableNotes.map((note, i) => (
          <li key={`table-${i}`}>{note}</li>
        ))}
        {items.length === 0 ? (
          <li>
            Our computed records match MaxPreps&rsquo; published {divisionLabel} table for every
            team.
          </li>
        ) : (
          items.map((item) => (
            <li key={item.key}>
              <Flag />
              {item.kind === 'swap' ? (
                <>
                  <SwapSentence a={item.a} b={item.b} rows={rows} />
                  <TeamLinks lines={[item.a, item.b]} sourceUrl={sourceUrl} />
                </>
              ) : (
                <>
                  <TeamSentence line={item.line} rows={rows} />
                  <TeamLinks lines={[item.line]} sourceUrl={sourceUrl} />
                </>
              )}
            </li>
          ))
        )}
        {unreported.total > 0 ? (
          <li>
            On SCVAL&rsquo;s schedule but not in any source: {unreported.total} {divisionLabel}{' '}
            {unreported.total === 1 ? 'fixture' : 'fixtures'}
            {unreported.noDataTotal > 0 ? (
              <>
                {' '}
                &mdash; {unreported.noDataTotal} of them {unreported.noDataTeams.join(' and ')}
                &rsquo;s
              </>
            ) : null}
            {unreported.otherMatchups.length > 0 ? (
              <>
                {unreported.noDataTotal > 0 ? ', plus ' : ' — '}
                {unreported.otherMatchups.join(' and ')}
              </>
            ) : null}
            , so {unreported.total === 1 ? 'it counts' : 'they count'} for nothing here.
          </li>
        ) : null}
        {footnotes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      {/* `mt-auto pt-3`: the 12px gap the inset's own `* + *` rule gave, and from lg (where the
          row stretches this block to the CCS card's height) the push to the bottom edge. */}
      <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-3">
        {ABOUT_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            prefetch={false}
            className="sx-action font-medium text-accent hover:underline"
          >
            {link.label}
          </Link>
        ))}
        {sourceUrl ? (
          <ExternalLink href={sourceUrl} className="sx-action gap-1 font-medium">
            {/* Wrapped: `.sx-action` is inline-flex, which trims the spaces around the sr-only
                span if the words are bare flex items ("MaxPrepstable"). */}
            <span>
              MaxPreps <span className="sr-only">{divisionLabel} </span>table
            </span>
          </ExternalLink>
        ) : null}
        {/* The division name is in the accessible name only: the block already sits under its
            heading, but a links list read out of context would show two identical names. */}
        <ExternalLink href={scheduleUrl} className="sx-action gap-1 font-medium">
          <span>
            Official <span className="sr-only">{divisionLabel} </span>schedule (PDF)
          </span>
        </ExternalLink>
      </div>
    </div>
  );
}

export default StandingsNotes;

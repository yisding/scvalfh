import Link from 'next/link';

import { SCORE_UNITS } from '../words/score-words';
import { ordinal } from '../../lib/format';
import type { Standing } from '../../lib/types';
import ExternalLink from '../ui/ExternalLink';
import type { StandingsRowData } from './standings-table/types';

import type { ComparisonView, MismatchNote, MissingRowView } from './standings-view';

/**
 * A division's notes (DESIGN §9, §8, §33; SPEC §10.3): a plain list under the table that holds every
 * fact specific to THIS division, always visible, and nothing when there is nothing to say.
 *
 *  1. The table's own notes: shared places, the team with no results, any `standing.mismatch`.
 *  2. Missing official results (`id="missing-<division>"`): official fixtures dated before today
 *     with no counted result, each with si.com's score when si.com has one that the site's
 *     backfill rule did not publish (and why); postponed fixtures after them, never counted. A
 *     league with no schedule document (EAL) lists the past games MaxPreps marks as league games
 *     instead, and its intro never says "official".
 *  3. The comparison with MaxPreps' own published table: agreement is printed only when the
 *     division's trust is not informational, MaxPreps leaves no one out and no row differs —
 *     otherwise the known cause and each team MaxPreps leaves out, then the differing figures.
 *     A difference in a `full` division starts with the dagger its row carries in the table.
 *     The differences are PLAIN SENTENCES, with our figure and theirs. The cross-check log's raw
 *     field names ("place (we order on points, Art. VI §2; MaxPreps orders on win pct)") are for
 *     /about#cross-check; here they are rewritten at render time, without touching lib or the
 *     snapshot:
 *      - a RECIPROCAL place swap (we have A 1st and B 2nd, MaxPreps the other way round) is ONE
 *        item naming both teams, because it is one fact: MaxPreps ranks by win percentage, the
 *        league ranks by points (`rankRule`, from the league's citations);
 *      - a lone place difference reads "3rd here, 4th on MaxPreps", and only claims the
 *        win-percentage reason when the win percentages involved actually explain it;
 *      - a place we hold LEVEL says so, in the US sports-page words the table's `T` stands for:
 *        "tied for 7th here; MaxPreps puts it 8th". It does not say what settles the tie: the
 *        tied group's own note (`tiebreak.note`, item 1, earlier in this same list) already cites
 *        the league's last step — SCVAL's coin flip, MCAL's play-in — so it is said once.
 *  4. Division-specific footnotes (league games played with no score; no league results yet).
 *  5. Where the league games come from, ONLY for a league that publishes no schedule (EAL, the San
 *     Diego leagues): with a schedule document, its link below says it.
 *
 * Then one row of source links (`.sx-linkrow`): MaxPreps' table and the official schedule (labelled
 * by its source: PDF or Google Doc), each with the division in its accessible name.
 *
 * No heading, no box: the list sits under its table, inside the division's own section. It renders
 * once, outside the table.
 */
export interface StandingsNotesProps {
  /** The division heading, or the league's short name for a single-division league. */
  divisionLabel: string;
  /**
   * The division's rows, for the facts a mismatch sentence needs (is the place shared, do the win
   * percentages differ). Without them the sentences make no win-percentage claim.
   */
  rows?: readonly StandingsRowData[];
  /** `collectStandingsNotes(...).specific` without the footnotes. */
  tableNotes?: React.ReactNode[];
  mismatches: MismatchNote[];
  comparison: ComparisonView;
  missingId: string;
  missingIntro: string;
  missing: MissingRowView[];
  postponed: MissingRowView[];
  /** Division-specific footnotes, printed last. */
  footnotes?: string[];
  /** The MaxPreps league table for this division; absent when MaxPreps publishes none (the San Diego Section's Valley). */
  sourceUrl?: string;
  /**
   * Why there is no MaxPreps table to link (`crossCheckSkipReason`: 'MaxPreps publishes no table for this
   * division'), printed as a note in place of the link, so a missing link is said, not silent.
   */
  sourceSkipped?: string | null;
  /** The league's schedule document; null when it publishes none (EAL): no link is drawn. */
  officialSchedule: { href: string; label: string } | null;
  /** `Scheduled per <SHORT>`, or `League games as MaxPreps marks them (<SHORT> publishes no schedule)`. */
  scheduledPer: string;
  /** `<SHORT> ranks by points (<citation>), and so do we.` or the EAL's title-only wording (standings-view `rankRule`). */
  rankRule: string;
  className?: string;
}

/** lib/standings/cross-check.ts `buildCrossCheck` field names: the place row starts with "place". */
const isPlaceField = (field: string) => field.startsWith('place');

/** The log's terse field names, in words. Anything unknown is printed as it comes. */
const FIELD_WORDS: Record<string, string> = {
  'league record': 'league record',
  'overall record': 'overall record',
  'league goals for': `league ${SCORE_UNITS} scored`,
  'league goals against': `league ${SCORE_UNITS} conceded`,
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

/** One line per team, keeping every field's figures. */
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

/** "league record 1-3-2 here, 1-4-2 on MaxPreps; …" */
function FieldPhrases({ items }: { items: FieldItem[] }) {
  return (
    <>
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 ? '; ' : null}
          {FIELD_WORDS[item.field] ?? item.field} <span className="text-ink">{item.ours}</span> here,{' '}
          <span className="text-ink">{item.theirs}</span> on MaxPreps
        </span>
      ))}
    </>
  );
}

/** The dagger a differing row carries in the table (standings-table/cells.tsx FlagMark). */
function Flag() {
  return <>&dagger; </>;
}

const Name = ({ children }: { children: React.ReactNode }) => (
  <b className="font-semibold text-ink">{children}</b>
);

/** A lone team: its place sentence (if any), then any other fields. */
function TeamSentence({
  line,
  rows,
  rankRule,
}: {
  line: FlagLine;
  rows: readonly StandingsRowData[];
  rankRule: string;
}) {
  const p = line.place;
  const shared = rows.find((r) => r.team.slug === line.slug)?.standing.tiebreak.shared ?? false;
  const reason = p ? winPctExplains(line.slug, p, rows) : false;
  return (
    <>
      <Name>{line.name}</Name>:{' '}
      {p ? (
        shared ? (
          <>
            tied for {ordinal(p.ours)} here
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
      {p && reason ? <> MaxPreps ranks by win percentage. {rankRule}</> : null}
      {line.items.length > 0 ? (
        <>
          {p ? ' Also ' : null}
          <FieldPhrases items={line.items} />. We publish our own computation.
        </>
      ) : null}
    </>
  );
}

/** "Saint Francis (1st) and St. Ignatius (2nd): MaxPreps lists them the other way round because …" */
function SwapSentence({
  a,
  b,
  rows,
  rankRule,
}: {
  a: FlagLine;
  b: FlagLine;
  rows: readonly StandingsRowData[];
  rankRule: string;
}) {
  const reason = winPctExplains(a.slug, a.place!, rows);
  return (
    <>
      <Name>{a.name}</Name> ({ordinal(a.place!.ours)}) and <Name>{b.name}</Name> (
      {ordinal(b.place!.ours)}): MaxPreps lists them the other way round
      {reason ? ' because it ranks by win percentage' : null}. {rankRule}
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
          <ExternalLink href={url} className="sx-link">
            MaxPreps table
          </ExternalLink>
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
  comparison,
  missingId,
  missingIntro,
  missing,
  postponed,
  footnotes = [],
  sourceUrl,
  sourceSkipped = null,
  officialSchedule,
  scheduledPer,
  rankRule,
  className,
}: StandingsNotesProps) {
  const items = toItems(byTeam(mismatches));
  const hasList =
    tableNotes.length > 0 ||
    missing.length + postponed.length > 0 ||
    comparison.agreement !== null ||
    comparison.knownCause !== null ||
    comparison.leftOut.length > 0 ||
    items.length > 0 ||
    footnotes.length > 0 ||
    sourceSkipped !== null ||
    officialSchedule === null;
  if (!hasList && !sourceUrl && !officialSchedule) return null;
  return (
    <div className={className}>
      {hasList ? (
        <ul aria-label={`Notes: ${divisionLabel}`} className="sx-note list-none space-y-1 p-0">
          {tableNotes.map((note, i) => (
            <li key={`table-${i}`}>{note}</li>
          ))}
          {missing.length + postponed.length > 0 ? (
            <li id={missingId} className="sx-target">
              {missing.length > 0 ? missingIntro : null}
              <ul className="m-0 list-none p-0">
                {[...missing, ...postponed].map((row) => (
                  <li key={row.key}>
                    <time dateTime={row.dateKey} className="text-ink">
                      {row.dateLabel}
                    </time>{' '}
                    {row.href ? (
                      <Link href={row.href} prefetch={false} className="sx-link">
                        {row.matchup}
                      </Link>
                    ) : (
                      row.matchup
                    )}
                    {row.sbliveNote ? <span className="block">{row.sbliveNote}</span> : null}
                  </li>
                ))}
              </ul>
            </li>
          ) : null}
          {/* Agreement comes ONLY from the view's comparison (SPEC §10.3): an empty mismatch list
              is not agreement where MaxPreps leaves a team out or is informational only. */}
          {comparison.agreement ? <li>{comparison.agreement}</li> : null}
          {comparison.knownCause ? <li>{comparison.knownCause}</li> : null}
          {comparison.leftOut.map((line) => (
            <li key={line}>{line}</li>
          ))}
          {comparison.agreement
            ? null
            : items.map((item) => (
                <li key={item.key}>
                  {/* The dagger only in a `full` division; elsewhere a difference is an annotation. */}
                  {comparison.flag ? <Flag /> : null}
                  {item.kind === 'swap' ? (
                    <>
                      <SwapSentence a={item.a} b={item.b} rows={rows} rankRule={rankRule} />
                      <TeamLinks lines={[item.a, item.b]} sourceUrl={sourceUrl} />
                    </>
                  ) : (
                    <>
                      <TeamSentence line={item.line} rows={rows} rankRule={rankRule} />
                      <TeamLinks lines={[item.line]} sourceUrl={sourceUrl} />
                    </>
                  )}
                </li>
              ))}
          {footnotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
          {sourceSkipped ? <li>{sourceSkipped}, so there is nothing to compare these records with.</li> : null}
          {/* With a schedule document its link says where the league games come from. */}
          {officialSchedule === null ? <li>{scheduledPer}.</li> : null}
        </ul>
      ) : null}
      {sourceUrl || officialSchedule ? (
        <ul className="sx-linkrow">
          {sourceUrl ? (
            <li>
              <ExternalLink href={sourceUrl} className="sx-action">
                {/* Wrapped: `.sx-action` is inline-flex, which trims the spaces around the sr-only
                    span if the words are bare flex items ("MaxPrepstable"). */}
                <span>
                  MaxPreps <span className="sr-only">{divisionLabel} </span>table
                </span>
              </ExternalLink>
            </li>
          ) : null}
          {/* The division name is in the accessible name only: the block already sits under its
              heading, but a links list read out of context would show two identical names. */}
          {officialSchedule ? (
            <li>
              <ExternalLink href={officialSchedule.href} className="sx-action">
                <span>
                  {officialSchedule.label}
                  <span className="sr-only"> for {divisionLabel}</span>
                </span>
              </ExternalLink>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

export default StandingsNotes;

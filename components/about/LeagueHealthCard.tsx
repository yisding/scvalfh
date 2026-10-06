import { formatStamp, officialSourceFormat } from '../../lib/format';
import type { LeagueHealth, LeagueRunState, OfficialSourceId } from '../../lib/types';
import ExternalLink from '../ui/ExternalLink';
import { plural } from '../ui/plural';

/**
 * One league's data health on /about#health (SPEC §10.8): how the last run went for THIS league,
 * in words — its state, the MaxPreps league pages and whether their tables were read (counting
 * member rows only, with the division's known cause when MaxPreps' table differs on purpose, such
 * as a row for a non-member), the team schedule feeds
 * (`12 of 12 current`), the official schedule (`<source> · <n> fixtures · <m> matched · upstream
 * unchanged|revised`), counted results, official results still missing, and contests dropped on
 * purpose. The pipeline's reasons are plain sentences and render verbatim.
 *
 * A division whose league publishes no schedule document (`official.mode: 'none'`, the EAL) says so
 * (`No official schedule document.`) and prints the config's note on where its league games come
 * from; its Missing row counts the past games MaxPreps marks as league games with no counted result
 * (`missingLeaguePast`), in words that never say "official".
 *
 * A server component with plain props: the page reads `getLeagueHealth()`, `getSources({ league })`
 * and `getDropped()` and hands the numbers down. No hue: the state is a word.
 */
export interface HealthDivision {
  id: string;
  /** Division heading, or null for a single-division league (no division label). */
  heading: string | null;
  /**
   * MaxPreps league standings page, or null where MaxPreps publishes no table for the division (the San
   * Diego Section's Valley: lib/leagues.ts leagueStandingsUrl). The card then says so, and that the
   * cross-check is skipped, instead of linking anything.
   */
  maxprepsUrl: string | null;
  /** Why there is no table (lib/standings.ts crossCheckSkipReason); null when there is one. */
  skipReason?: string | null;
  /**
   * The division's standings rows that carry MaxPreps' reported record: the member rows its table
   * matched, read this run or carried. Counted from the standings rather than taken from the stored
   * `reportedRows`, which a snapshot written before 2026-10-04 counted with MaxPreps' extra
   * non-member row (EAL: Red Bluff).
   */
  memberRows: number;
  knownCause: string | null;
  official:
    | {
        source: OfficialSourceId;
        url: string;
        /** 'live-pdf' = read every run; 'bundled' = our transcription, sha256-checked against upstream. */
        mode: 'live-pdf' | 'bundled';
        revisedOn: string | null;
      }
    | {
        /** The league publishes no schedule (EAL, the Sunset, the San Diego leagues). */
        mode: 'none';
        /** `DivisionConfig.official.note`: where its league games come from instead. */
        note: string;
      };
}

export interface LeagueHealthCardProps {
  shortName: string;
  name: string;
  health: LeagueHealth;
  divisions: readonly HealthDivision[];
  /** Contests the pipeline removed on purpose that involve this league's teams. */
  dropped: number;
  /** Source rows for this league that were stale or failed in the last run. */
  problems: ReadonlyArray<{ label: string; status: string; error?: string }>;
  /** The league's region: the card's `data-region-scope` on /about (DESIGN-socal §2.4). */
  region?: 'norcal' | 'socal';
  className?: string;
}

const STATE_WORDS: Readonly<Record<LeagueRunState, string>> = {
  fresh: 'Current',
  partial: 'Current, with gaps',
  frozen: 'Carried from an earlier run',
  degraded: 'Partly carried from an earlier run',
};

const TABLE_WORDS = {
  ok: 'read this run',
  carried: 'carried from an earlier run',
  missing: 'could not be read',
  skipped: 'not requested',
} as const;

/** 'MCAL schedule (PDF)' / 'BVAL schedule (Google Doc)'. Only for a league that publishes one (not mode 'none'). */
export function officialSourceLabel(shortName: string, source: OfficialSourceId): string {
  return `${shortName} schedule (${officialSourceFormat(source)})`;
}

type DocumentOfficial = Exclude<HealthDivision['official'], { mode: 'none' }>;

/** The schedule document's line: its link, then what the last run read from it. */
function OfficialLine({
  shortName,
  official: doc,
  health: official,
}: {
  shortName: string;
  official: DocumentOfficial;
  health: NonNullable<LeagueHealth['divisions'][number]['official']> | null;
}) {
  return (
    <p className="m-0 mt-1">
      <ExternalLink href={doc.url}>{officialSourceLabel(shortName, doc.source)}</ExternalLink>
      {official ? (
        <>
          {' '}
          &middot; {plural(official.total, 'fixture', 'fixtures')} &middot; {official.matched} matched
          &middot;{' '}
          {doc.mode === 'live-pdf'
            ? 'read live each run'
            : official.revisedUpstream
              ? `upstream revised${doc.revisedOn ? ` since our copy (${doc.revisedOn})` : ''}`
              : 'upstream unchanged'}
          {official.carried ? ' · carried from an earlier run' : ''}
        </>
      ) : (
        ' · not read this run'
      )}
    </p>
  );
}

export function LeagueHealthCard({ shortName, name, health, divisions, dropped, problems, region, className }: LeagueHealthCardProps) {
  const feeds = health.teamFeeds;
  const counted = health.divisions.reduce((n, d) => n + d.countedFinals, 0);
  const backfilled = health.divisions.reduce((n, d) => n + d.backfilled, 0);
  const missing = health.divisions.reduce((n, d) => n + (d.official?.missingPast ?? d.missingLeaguePast ?? 0), 0);
  // Every division without a schedule document (EAL): nothing it lists is "official".
  const noDocument = divisions.length > 0 && divisions.every((d) => d.official.mode === 'none');
  const [one, many] = noDocument
    ? ['league result', 'league results']
    : ['official league result', 'official league results'];
  return (
    <article
      data-region-scope={region}
      className={['sx-card flex flex-col p-5', className].filter(Boolean).join(' ')}
      aria-label={`${shortName} data health`}
    >
      <header>
        <h3 className="m-0 text-lead text-ink">{shortName}</h3>
        <p className="m-0 mt-0.5 text-meta text-ink-3">{name}</p>
      </header>
      <dl className="m-0 mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-meta">
        <dt className="text-ink-3">State</dt>
        <dd className="m-0 text-ink">
          {STATE_WORDS[health.state]}
          {health.state !== 'fresh' && health.lastFreshAt ? (
            <span className="text-ink-2"> &middot; last current {formatStamp(health.lastFreshAt)}</span>
          ) : null}
        </dd>

        <dt className="text-ink-3">Team schedules</dt>
        <dd className="m-0 text-ink-2">
          {feeds.ok} of {feeds.total} current
          {feeds.carried > 0 ? ` · ${feeds.carried} carried` : ''}
          {feeds.failed > 0 ? ` · ${feeds.failed} failed` : ''}
        </dd>

        <dt className="text-ink-3">Counted results</dt>
        <dd className="m-0 text-ink-2">
          {plural(counted, 'league result', 'league results')}
          {backfilled > 0 ? ` · ${backfilled} from si.com` : ''}
        </dd>

        <dt className="text-ink-3">Missing</dt>
        <dd className="m-0 text-ink-2">
          {missing === 0
            ? `No ${one} is missing`
            : `${plural(missing, one, many)} past their date with no counted result`}
        </dd>

        <dt className="text-ink-3">Dropped</dt>
        <dd className="m-0 text-ink-2">
          {dropped === 0 ? 'Nothing dropped' : `${plural(dropped, 'contest', 'contests')} dropped on purpose`} (
          <a href="#dropped" className="text-accent hover:underline">
            list
          </a>
          )
        </dd>
      </dl>

      <ul className="m-0 mt-4 list-none space-y-3 p-0 text-meta text-ink-2">
        {divisions.map((d) => {
          const h = health.divisions.find((x) => x.divisionId === d.id);
          const official = h?.official ?? null;
          const where = d.heading ? `${d.heading}: ` : '';
          return (
            <li key={d.id}>
              <p className="m-0">
                {where}
                {d.maxprepsUrl === null ? (
                  // No table at all (the San Diego Section's Valley): nothing to link or compare.
                  <>{d.skipReason ?? 'MaxPreps publishes no table for this division'}; the cross-check is skipped.</>
                ) : (
                  <>
                    <ExternalLink href={d.maxprepsUrl}>MaxPreps table</ExternalLink>{' '}
                    {h ? TABLE_WORDS[h.reportedTable] : 'not reported'}
                    {h && h.reportedRows !== null ? ` (${plural(d.memberRows, 'member row', 'member rows')})` : ''}.
                  </>
                )}
              </p>
              {d.knownCause ? <p className="m-0 mt-1">{d.knownCause}</p> : null}
              {d.official.mode === 'none' ? (
                <p className="m-0 mt-1">No official schedule document. {d.official.note}</p>
              ) : (
                <OfficialLine shortName={shortName} official={d.official} health={official} />
              )}
            </li>
          );
        })}
      </ul>

      {health.reasons.length > 0 ? (
        <div className="mt-4 sx-inset text-meta text-ink-2" role="note">
          {health.reasons.map((reason) => (
            <p key={reason} className="m-0">
              {reason}
            </p>
          ))}
        </div>
      ) : null}

      {problems.length > 0 ? (
        <ul className="m-0 mt-3 list-disc space-y-1 pl-5 text-meta text-ink-2">
          {problems.map((p) => (
            <li key={`${p.label}-${p.status}`}>
              {p.label}: {p.status}
              {p.error ? ` (${p.error})` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export default LeagueHealthCard;

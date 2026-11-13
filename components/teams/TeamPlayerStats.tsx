import ExternalLink from '../ui/ExternalLink';
import MissingValue from '../ui/MissingValue';
import { plural } from '../words/plural';
import type { GoalieCard, PlayerStatsView, StatTable } from './player-stats-view';
import { statText } from './player-stats-view';

/**
 * The team page's player stats (SPEC §1.1k): season totals as the coach entered them on MaxPreps.
 *
 * The field tables are real `<table>`s — a stat line is tabular data a reader scans down a column
 * — kept to at most five numeric columns so they fit 320px without a scroller (DESIGN §10.8):
 * Scoring always, a second table only for the extra stats this team tracks. A goalkeeper is a
 * name over a list of label-over-value cells instead, because a team can track ten goalie stats.
 * Each group is headed by an h3; nothing is boxed (DESIGN §33).
 *
 * Column heads are abbreviations a reader may not know (GWG, SOG), so each head carries its full
 * name for a screen reader and the legend under the tables spells every one out.
 *
 * Goals, assists and saves a coach wrote in a game note instead (lib/players/note-stats.ts) are added in, and every
 * row or card holding one carries a mark that the list of noted games under the tables explains.
 */

/** The mark on a row or card whose numbers include a game note; a screen reader hears why. */
function NotedMark() {
  return (
    <>
      <sup aria-hidden="true" className="ml-0.5 text-ink-2">
        *
      </sup>
      <span className="sr-only"> (includes a game note)</span>
    </>
  );
}

/** A stat table of the team page's shape; the game page's Game stats section uses it too. */
export function StatsTable({ table, caption }: { table: StatTable; caption: string }) {
  // The number slot is the table's, not the row's: when any row has a number, every row keeps the
  // box (a dash where none is listed, as on the roster), so every name starts at x=48. Drawn only
  // for the rows that had one, Marin Catholic's names started at 48 or 16 down one column. Two
  // characters fit 24px; "21/88" (Valley Christian) needs 44px, as the roster's wide column does.
  const numbered = table.rows.some((r) => r.jersey);
  const numberWidth = table.rows.some((r) => (r.jersey?.length ?? 0) > 2) ? 'w-11' : 'w-6';
  // The 56px floor under each stat head evens the columns out, but five of them are 280px before a
  // name, so it is keyed to the width the table has (`@container`), not the viewport's: the game
  // page sets two teams' tables side by side in 280px columns at 1024 (360 at 1280), where a
  // viewport `sm:` floor pushed the table 120px past its strip. From 28rem it fits five columns
  // and a name; below that the columns take their own width, as on a phone.
  return (
    <div className="@container max-w-[34rem] min-w-0">
      <table className="sx-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-full text-left">
              Player
            </th>
            {table.columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className="text-right @md:min-w-14"
              >
                <span aria-hidden="true">{c.label}</span>
                <span className="sr-only">{c.title}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="text-left font-normal whitespace-normal">
                {/* Wraps rather than truncating, so a long name lowers the row instead of
                    pushing the numbers past a 320px screen (HistoryStandingsTable's rule). The
                    number is its own fixed box beside the name, so a wrapped name's second line
                    starts under the first, never under the number. */}
                <span className="flex items-baseline text-body text-ink">
                  {numbered ? (
                    <span className={['sx-num mr-2 shrink-0 text-right text-cell text-ink-2', numberWidth].join(' ')}>
                      {row.jersey ? (
                        <>
                          <span className="sr-only">Number </span>
                          {row.jersey}
                        </>
                      ) : (
                        <MissingValue words="No number listed" />
                      )}
                    </span>
                  ) : null}
                  <span className="min-w-0">
                    {row.name}
                    {row.noted ? <NotedMark /> : null}
                  </span>
                </span>
              </th>
              {row.values.map((v, i) => (
                <td
                  key={table.columns[i].key}
                  className="sx-num text-right"
                >
                  {(row.texts ? row.texts[i] : statText(v)) ?? <MissingValue words="not recorded" />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Goalie({ card }: { card: GoalieCard }) {
  return (
    <div className="border-b border-hairline py-3">
      <h4 className="m-0 text-body font-semibold text-ink">
        {card.jersey ? (
          <span className="sx-num mr-2 text-cell font-normal text-ink-2">
            <span className="sr-only">Number </span>
            {card.jersey}
          </span>
        ) : null}
        {card.name}
        {card.noted ? <NotedMark /> : null}
      </h4>
      <dl className="m-0 mt-2 grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-4">
        {card.stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="text-micro text-ink-2">{s.label}</dt>
            <dd className="sx-num m-0 text-lead font-semibold text-ink">{s.text ?? <MissingValue words="not recorded" />}</dd>
          </div>
        ))}
      </dl>
      {card.flag ? <p className="sx-note">{card.flag}</p> : null}
    </div>
  );
}

export interface TeamPlayerStatsProps {
  view: PlayerStatsView;
}

export function TeamPlayerStats({ view }: TeamPlayerStatsProps) {
  const { teamName } = view;
  const tables = view.tables ?? [];
  const hasAny = view.scoring !== null || view.more !== null || view.goalies.length > 0 || tables.length > 0;

  if (!hasAny) {
    // ONE plain line. A failed or pending update is not "no stats": each says which it is.
    return (
      <p className="sx-empty">
        {view.status === 'error'
          ? `${teamName}'s player stats could not be read.`
          : view.status === 'pending'
            ? `${teamName}'s player stats have not been collected yet.`
            : 'No stats reported'}
        {view.statsUrl ? (
          <>
            {' '}
            <ExternalLink href={view.statsUrl} className="sx-link">
              Check MaxPreps
            </ExternalLink>
          </>
        ) : null}
      </p>
    );
  }

  const legend = [
    ...(view.scoring?.columns ?? []),
    ...(view.more?.columns ?? []),
    ...tables.flatMap((t) => t.table.columns),
  ].map((c) =>
    // MaxPreps' 2-per-goal points (showsPoints); basketball's points are scored and need no gloss.
    c.key === 'points' && view.showsPoints ? `${c.label} points (2 per goal, 1 per assist)` : `${c.label} ${c.title.toLowerCase()}`,
  );

  // Up to four goalkeeping figures fit a table at 320px; a team that tracks more keeps the cells.
  const goalieLabels = [...new Set(view.goalies.flatMap((g) => g.stats.map((x) => x.label)))];
  const goalieColumns = goalieLabels.length > 0 && goalieLabels.length <= 4 ? goalieLabels : null;

  return (
    <div>
      {/* Groups in two columns from 1024 (the section spans the page there; a short group sits under another), each table capped so the
          numbers stay near the names; each group is headed by a strip, as every group of rows is. */}
      <div className="lg:columns-2 lg:gap-x-10 [&>div]:mb-6 [&>div]:break-inside-avoid">
        {view.scoring ? (
          <div>
            <h3 className="sx-strip max-w-[34rem]">Scoring</h3>
            <StatsTable table={view.scoring} caption={`${teamName} scoring, this season`} />
          </div>
        ) : null}
        {view.more ? (
          <div>
            <h3 className="sx-strip max-w-[34rem]">Shooting and more</h3>
            <StatsTable table={view.more} caption={`${teamName} shooting and other stats, this season`} />
          </div>
        ) : null}
        {tables.map((t) => (
          <div key={t.id}>
            <h3 className="sx-strip max-w-[34rem]">{t.kicker}</h3>
            <StatsTable table={t.table} caption={t.caption} />
          </div>
        ))}
        {view.goalies.length > 0 ? (
          <div>
            <h3 className="sx-strip max-w-[34rem]">Goalkeeping</h3>
            {goalieColumns ? (
              /* A few figures per keeper are a table, like the two above. */
              <div className="max-w-[34rem] min-w-0">
                <table className="sx-table">
                  <caption className="sr-only">{`${teamName} goalkeeping, this season`}</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="w-full text-left">
                        Player
                      </th>
                      {goalieColumns.map((label) => (
                        <th key={label} scope="col" className="text-right">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {view.goalies.map((g) => (
                      <tr key={g.key}>
                        <th scope="row" className="text-left font-normal whitespace-normal">
                          <span className="flex items-baseline text-body text-ink">
                            {g.jersey ? (
                              <span className="sx-num mr-2 w-6 shrink-0 text-right text-cell text-ink-2">
                                <span className="sr-only">Number </span>
                                {g.jersey}
                              </span>
                            ) : null}
                            <span className="min-w-0">
                              {g.name}
                              {g.noted ? <NotedMark /> : null}
                            </span>
                          </span>
                          {g.flag ? <span className="block text-cell text-ink-2">{g.flag}</span> : null}
                        </th>
                        {goalieColumns.map((label) => (
                          <td key={label} className="sx-num text-right">
                            {g.stats.find((x) => x.label === label)?.text ?? <MissingValue words="not recorded" />}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid gap-x-10 sm:grid-cols-2">
                {view.goalies.map((g) => (
                  <Goalie key={g.key} card={g} />
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-3 max-w-prose text-cell text-ink-2">
        <p className="m-0">
          Season totals for every varsity game, league and non-league, as the coach entered them on
          MaxPreps{view.updated ? `, last updated ${view.updated}` : ''}.
          {view.more ? ' Shooting and more lists only players with at least one of those stats.' : ''}
          {view.showsDerived
            ? ' The per-game figures and the percentages are worked out here from those totals: a per-game figure is over the games the player is credited with.'
            : ''}
        </p>
        {view.goalkeepingEntered ? (
          <p className="mt-1 mb-0">
            Goalkeeping is as entered too, including opponent shots on goal, which can disagree with the
            saves beside it.
            {view.showsSavePercent
              ? ' Save % is the one figure worked out here: saves divided by saves plus goals against, left out where the entered figures cannot all be right.'
              : ''}
          </p>
        ) : null}
        {view.gamesSince > 0 ? (
          <p className="mt-1 mb-0">
            {teamName} has played {plural(view.gamesSince, 'game')} since
            then, so these totals are behind.
          </p>
        ) : null}
        {view.notedGames.length > 0 ? (
          <div className="mt-1">
            <p className="m-0">
              * Also counts what the coach wrote in MaxPreps&rsquo; game notes but did not enter as stats:
            </p>
            <ul className="m-0 mt-1 list-disc pl-5">
              {view.notedGames.map((g) => (
                <li key={g.key}>
                  {g.game}: {g.added} (&ldquo;{g.note}&rdquo;).
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {legend.length > 0 ? <p className="mt-1 mb-0">{legend.join(', ')}.</p> : null}
        {view.status === 'carried-forward' ? (
          <p className="mt-1 mb-0">
            The latest stats update could not reach MaxPreps, so these are from an earlier one.
          </p>
        ) : null}
      </div>

      {view.statsUrl ? (
        <ul className="sx-linkrow">
          <li>
            <ExternalLink href={view.statsUrl} className="sx-action">
              MaxPreps stats
            </ExternalLink>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

export default TeamPlayerStats;

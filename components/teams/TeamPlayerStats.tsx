import EmptyState from '../ui/EmptyState';
import ExternalLink from '../ui/ExternalLink';
import SectionHeader from '../ui/SectionHeader';
import { plural } from '../ui/plural';
import type { GoalieCard, PlayerStatsView, StatTable } from './player-stats-view';
import { statText } from './player-stats-view';

/**
 * The team page's player stats (SPEC §1.1k): season totals as the coach entered them on MaxPreps.
 *
 * The field tables are real `<table>`s — a stat line is tabular data a reader scans down a column
 * — kept to at most five numeric columns so they fit 320px without a scroller (DESIGN §10.8):
 * Scoring always, a second table only for the extra stats this team tracks. Goalkeepers are cards
 * of label-over-value cells instead, because a team can track ten goalie stats.
 *
 * Column heads are abbreviations a reader may not know (GWG, SOG), so each head carries its full
 * name for a screen reader and the legend under the tables spells every one out.
 */

function Dash() {
  return (
    <>
      <span aria-hidden="true">&mdash;</span>
      <span className="sr-only">not recorded</span>
    </>
  );
}

function StatsTable({ table, caption }: { table: StatTable; caption: string }) {
  return (
    <div className="sx-card sx-flush sx-bleed">
      <table className="sx-table text-meta">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="pl-4">
              Player
            </th>
            {table.columns.map((c, i) => (
              <th
                key={c.key}
                scope="col"
                className={`w-10 pl-2 text-right sm:w-16 ${i === table.columns.length - 1 ? 'pr-4' : ''}`}
              >
                <span aria-hidden="true">{c.label}</span>
                <span className="sr-only">{c.title}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.key} className="h-11">
              <th scope="row" className="pl-4 text-left font-normal">
                {/* Wraps rather than truncating, so a long name lowers the row instead of
                    pushing the numbers past a 320px screen (HistoryStandingsTable's rule). */}
                <span className="text-body text-ink">
                  {row.jersey ? (
                    <span className="sx-num mr-2 inline-block min-w-6 text-right text-cell text-ink-3">
                      <span className="sr-only">Number </span>
                      {row.jersey}
                    </span>
                  ) : null}
                  {row.name}
                </span>
              </th>
              {row.values.map((v, i) => (
                <td
                  key={table.columns[i].key}
                  className={`sx-num pl-2 text-right text-cell text-ink ${
                    i === row.values.length - 1 ? 'pr-4' : ''
                  }`}
                >
                  {statText(v) ?? <Dash />}
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
    <div className="sx-card p-4">
      <h4 className="m-0 text-body font-semibold text-ink">
        {card.jersey ? (
          <span className="sx-num mr-2 text-cell font-normal text-ink-3">
            <span className="sr-only">Number </span>
            {card.jersey}
          </span>
        ) : null}
        {card.name}
      </h4>
      <dl className="m-0 mt-3 grid grid-cols-3 gap-x-3 gap-y-3 sm:grid-cols-4">
        {card.stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="text-micro text-ink-3">{s.label}</dt>
            <dd className="sx-num m-0 text-lead font-semibold text-ink">{s.text ?? <Dash />}</dd>
          </div>
        ))}
      </dl>
      {card.flag ? <p className="mt-3 mb-0 text-meta text-ink-2">{card.flag}</p> : null}
    </div>
  );
}

export function TeamPlayerStats({ view }: { view: PlayerStatsView }) {
  const { teamName } = view;
  const hasAny = view.scoring !== null || view.more !== null || view.goalies.length > 0;

  if (!hasAny) {
    const action = view.statsUrl
      ? { href: view.statsUrl, label: 'Check MaxPreps', external: true }
      : undefined;
    return (
      <EmptyState
        heading={
          view.status === 'error'
            ? `${teamName}'s player stats could not be read.`
            : view.status === 'pending'
              ? `${teamName}'s player stats have not been collected yet.`
              : `No player stats for ${teamName}.`
        }
        action={action}
      >
        {view.status === 'error'
          ? 'The last stats update failed and there was no earlier copy to fall back on.'
          : view.status === 'pending'
            ? 'No stats update has covered this team yet. They will appear once a run collects them.'
            : 'Nobody has entered any on MaxPreps this season.'}
      </EmptyState>
    );
  }

  const legend = [
    ...(view.scoring?.columns ?? []),
    ...(view.more?.columns ?? []),
  ].map((c) =>
    c.key === 'points' ? `${c.label} points (2 per goal, 1 per assist)` : `${c.label} ${c.title.toLowerCase()}`,
  );

  return (
    <div>
      {/* Two columns from 1024px: a stat table stretched across the full ~1070px section put
          the numbers a hand's width from the names. Auto-placement keeps DOM order (scoring,
          more, goalkeeping) as reading order, left to right then down. */}
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-x-10">
        {view.scoring ? (
          <div>
            <SectionHeader as="h3" size="label" kicker="Scoring" />
            <StatsTable table={view.scoring} caption={`${teamName} scoring, this season`} />
          </div>
        ) : null}
        {view.more ? (
          <div>
            <SectionHeader as="h3" size="label" kicker="Shooting and more" />
            <StatsTable table={view.more} caption={`${teamName} shooting and other stats, this season`} />
          </div>
        ) : null}
        {view.goalies.length > 0 ? (
          <div>
            <SectionHeader as="h3" size="label" kicker="Goalkeeping" />
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">
              {view.goalies.map((g) => (
                <Goalie key={g.key} card={g} />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-3 max-w-prose text-meta text-ink-3">
        <p className="m-0">
          Season totals for every varsity game, league and non-league, as the coach entered them on
          MaxPreps{view.updated ? `, last updated ${view.updated}` : ''}.
          {view.more ? ' Shooting and more lists only players with at least one of those stats.' : ''}
        </p>
        {view.goalies.length > 0 ? (
          <p className="mt-1 mb-0">
            Goalkeeping is as entered too, including opponent shots on goal, which can disagree with the
            saves beside it.
            {view.showsSavePercent
              ? ' Save % is the one figure worked out here: saves divided by saves plus goals against, left out where the entered figures cannot all be right.'
              : ''}
          </p>
        ) : null}
        {view.gamesSince > 0 ? (
          <p className="mt-1 mb-0 text-ink-2">
            {teamName} has played {plural(view.gamesSince, 'game')} since
            then, so these totals are behind.
          </p>
        ) : null}
        {legend.length > 0 ? <p className="mt-1 mb-0">{legend.join(' · ')}.</p> : null}
        {view.status === 'carried-forward' ? (
          <p className="mt-1 mb-0 text-ink-2">
            The latest stats update could not reach MaxPreps, so these are from an earlier one.
          </p>
        ) : null}
      </div>

      {view.statsUrl ? (
        <p className="mt-4 mb-0">
          <ExternalLink href={view.statsUrl} className="sx-pill">
            MaxPreps stats
          </ExternalLink>
        </p>
      ) : null}
    </div>
  );
}

export default TeamPlayerStats;

import Link from 'next/link';

import FormStrip, { type FormEntry } from '../ui/FormStrip';
import GhostMonogram from '../ui/GhostMonogram';
import SectionHeader from '../ui/SectionHeader';
import TeamMonogram from '../ui/TeamMonogram';

import type { GameModel, GameSideModel } from './game-view';

/**
 * LAST 5 GAMES (DESIGN §33) — the last five LEAGUE results each side carried into this contest,
 * oldest to newest: a two-row table, the team and its strip, away over home.
 *
 * "Going in" is the whole point: the strip is cut at this game, so a page for a September result
 * never shows October form. Rules are DESIGN §5.5 — league games only, five everywhere, unreported
 * and cancelled games skipped rather than shown as placeholder squares, and the words "no results"
 * instead of an empty row of boxes (FormStrip).
 *
 * An opponent outside the teams this site follows has no record here at all (DESIGN §8), so its
 * row says so in words (SPEC §10.6), beside the same ghost square its game rows use. A member
 * side's name links its team page.
 */
export interface FormGoingInProps {
  model: GameModel;
  className?: string;
}

/** The chips as the standings' Last 5 draws them: five 16px letters, 2px apart, not five links. */
function unlinked(entry: FormEntry): FormEntry {
  return { ...entry, contestId: undefined };
}

function FormRow({ side, memberCount }: { side: GameSideModel; memberCount: number }) {
  return (
    <tr data-team-slug={side.team?.slug}>
      <th scope="row" className="sx-col-team">
        <span className="sx-teamcell">
          {side.team ? <TeamMonogram team={side.team} size={24} /> : <GhostMonogram name={side.name} size={24} />}
          {side.team ? (
            // `prefetch={false}`: one link per row, the policy for every per-row link
            // (tests/ui/prefetch-policy.test.ts).
            <Link href={`/teams/${side.team.slug}`} prefetch={false} className="sx-teamlink">
              {side.team.shortName}
            </Link>
          ) : (
            <span>{side.name}</span>
          )}
        </span>
      </th>
      {side.team ? (
        <td>
          <FormStrip entries={side.formBefore.map(unlinked)} size={16} label={`${side.name} going into this game`} />
        </td>
      ) : (
        <td className="whitespace-normal text-cell text-ink-2">
          {`Not one of the ${memberCount} teams this site follows — no record is kept here.`}
        </td>
      )}
    </tr>
  );
}

export function FormGoingIn({ model, className }: FormGoingInProps) {
  const { away, home } = model;
  const anyTracked = Boolean(away.team || home.team);
  if (!anyTracked) return null;

  return (
    <section className={className} aria-labelledby="game-form-kicker">
      <SectionHeader kicker="Last 5 games" as="h2" id="game-form-kicker" meta="League games before this one" />
      <div className="sx-tablewrap">
        <table className="sx-table">
          <caption className="sr-only">Each side’s last five league results before this game, oldest first</caption>
          {/* Two rows under a heading that names them: the column heads are for screen readers. */}
          <thead className="sr-only">
            <tr>
              <th scope="col" className="sx-col-team">
                Team
              </th>
              <th scope="col">Last 5</th>
            </tr>
          </thead>
          <tbody>
            {/* Away over home, the same order as the scoreboard and every list on the site. */}
            <FormRow side={away} memberCount={model.memberCount} />
            <FormRow side={home} memberCount={model.memberCount} />
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default FormGoingIn;

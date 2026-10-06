import Link from 'next/link';

import Arrow from '../ui/Arrow';
import FormStrip from '../ui/FormStrip';
import GhostMonogram from '../ui/GhostMonogram';
import ResultChip, { CHIP_LABEL } from '../ui/ResultChip';
import SectionHeader from '../ui/SectionHeader';
import TeamMonogram from '../ui/TeamMonogram';

import type { GameModel, GameSideModel } from './game-view';

/**
 * FORM GOING IN (DESIGN §3.5) — the last five LEAGUE results each side carried into this contest,
 * oldest → newest, then what happened here.
 *
 * "Going in" is the whole point: the strip is cut at this game, so a page for a September result
 * never shows October form. Rules are DESIGN §5.5 — league games only, five everywhere, unreported
 * and cancelled games skipped rather than shown as placeholder squares, and the words "no results"
 * instead of an empty row of boxes.
 *
 * An opponent outside the teams this site follows has no record here at all (DESIGN §8), so its
 * row says so in words (SPEC §10.6), beside the same GhostMonogram tile its game rows use.
 *
 * A member side's name is a link to its team page — the natural next step from "how were they
 * playing coming in" is "show me their season". It is a standalone link, so it carries
 * `.sx-action`'s 24px box (WCAG 2.5.8); the short name, because the strip shares its line.
 */
export interface FormGoingInProps {
  model: GameModel;
  className?: string;
}

function FormRow({ side, memberCount }: { side: GameSideModel; memberCount: number }) {
  return (
    <li className="flex min-h-row-1 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      {side.team ? (
        // `max-w-full` + `min-w-0` (not `shrink-0`): in this wrapping row a name wider than the
        // card truncates inside the link instead of pushing the page sideways at 320.
        // `prefetch={false}`: one link per form row, the policy for every per-row link
        // (tests/ui/prefetch-policy.test.ts).
        <span className="flex min-w-0 max-w-full items-center gap-2.5">
          <TeamMonogram team={side.team} size={24} />
          <Link
            href={`/teams/${side.team.slug}`}
            prefetch={false}
            className="sx-action min-w-0 gap-1 text-body text-accent no-underline hover:underline"
          >
            <span className="truncate">{side.team.shortName}</span>
            <span aria-hidden="true" className="shrink-0 text-micro">
              &rsaquo;
            </span>
          </Link>
        </span>
      ) : (
        <span className="flex min-w-0 shrink-0 items-center gap-2.5">
          <GhostMonogram name={side.name} size={24} />
          <span className="truncate text-body text-ink">{side.name}</span>
        </span>
      )}
      {side.team && side.independent ? (
        // A team in no league (the Southern Section independents): no league form to show, ever.
        <span className="ml-auto text-meta text-ink-3">Plays no league games</span>
      ) : side.team ? (
        // The strip and "→ then [chip]" are ONE unit that never splits: when it does not fit
        // beside the name it moves whole, so the outcome chip never sits alone on a line. Below
        // 360px it always takes its own line, aligned under the name, and wraps: a linked strip is
        // 40px a chip, so four or five games plus "then L" are wider than that line at 320.
        <span className="ml-auto flex shrink-0 items-center gap-3 whitespace-nowrap max-[359px]:ml-0 max-[359px]:basis-full max-[359px]:flex-wrap max-[359px]:gap-y-1 max-[359px]:pl-[2.125rem]">
          <FormStrip
            entries={side.formBefore}
            size={20}
            label={`${side.name} going into this game`}
          />
          {side.outcome ? (
            <span className="flex items-center gap-2 text-meta text-ink-3">
              <Arrow />
              <span>then</span>
              {/* `aria-hidden` on the chip, as every other ResultChip consumer does (GameRow,
                  SeasonSeries, FormStrip). ResultChip is a `role="img"` with its own
                  `aria-label`, so left exposed beside the sentence below it the row announced
                  "Loss" and then "Loss in this game". The written word is the channel that
                  carries the meaning here; the chip is the colour-free glyph beside it. */}
              <span aria-hidden="true">
                <ResultChip kind={side.outcome} size={20} />
              </span>
              <span className="sr-only">
                {CHIP_LABEL[side.outcome]} in this game
              </span>
            </span>
          ) : null}
        </span>
      ) : (
        <span className="text-meta text-ink-3">
          {`Not one of the ${memberCount} teams this site follows — no record is kept here.`}
        </span>
      )}
    </li>
  );
}

export function FormGoingIn({ model, className }: FormGoingInProps) {
  const { away, home } = model;
  const anyTracked = Boolean(away.team || home.team);
  if (!anyTracked) return null;
  const played = [away, home].filter((s) => s.team && s.playedBefore > 0).length;
  // Every followed side is an independent: there is no league form on that side to speak of.
  const tracked = [away, home].filter((s) => s.team);
  const allIndependent = tracked.every((s) => s.independent);

  return (
    <section className={className} aria-labelledby="game-form-kicker">
      <SectionHeader
        kicker="Form going in"
        as="h2"
        id="game-form-kicker"
        meta="League games · oldest → newest"
      />
      <div className="sx-card sx-flush sx-bleed">
        <ol className="sx-list">
          {/* Away over home, the same order as the scoreboard and every list on the site. */}
          <FormRow side={away} memberCount={model.memberCount} />
          <FormRow side={home} memberCount={model.memberCount} />
        </ol>
        <p className="m-0 border-t border-divider px-4 py-3 text-meta text-ink-3">
          {allIndependent
            ? tracked.length === 2
              ? 'Neither side plays league games.'
              : `${tracked[0]!.name} plays no league games.`
            : played === 0
            ? 'Neither side had a league result before this date.'
            : 'Games with no reported score are skipped, never shown as a result.'}
        </p>
      </div>
    </section>
  );
}

export default FormGoingIn;
